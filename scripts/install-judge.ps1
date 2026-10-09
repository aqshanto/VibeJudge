# VibeJudge judge worker - one-command installer / updater for Windows.
#
# On a lab PC, open PowerShell and paste:
#   irm https://raw.githubusercontent.com/aqshanto/VibeJudge/main/scripts/install-judge.ps1 | iex
#
# First run: check Docker -> download code -> ask for the token (once) -> build -> start the worker.
# Later runs: update to the latest code and restart (the saved token is reused).
# The worker runs with "--restart unless-stopped", so it comes back after a reboot
# as soon as Docker Desktop is running.
#
# Non-interactive use: $env:VJ_TOKEN, $env:VJ_API_URL, $env:VJ_WORKER_NAME, $env:VJ_CONCURRENCY
#
# NOTE: keep this file ASCII-only. Windows PowerShell 5.1 reads BOM-less files in the ANSI
# code page, and non-ASCII bytes can turn into "smart quotes" that break parsing.

& {
  # "Continue", not "Stop": in PowerShell 5.1, a native command (docker) writing to stderr
  # would otherwise abort the script before we can check $LASTEXITCODE.
  $ErrorActionPreference = "Continue"
  $ProgressPreference = "SilentlyContinue" # makes Invoke-WebRequest much faster

  $Repo = "aqshanto/VibeJudge"
  $Branch = "main"
  $DefaultApi = "https://vibejudge-api.onrender.com"
  $Base = Join-Path $env:USERPROFILE ".vibejudge"
  $Src = Join-Path $Base "src"
  $EnvFile = Join-Path $Base "worker.env"
  $Image = "vibejudge-judge"
  $Name = "vibejudge-worker"

  function Say($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
  function Ok($msg) { Write-Host "    $msg" -ForegroundColor Green }
  # "exit" would close the whole PowerShell window when run through iex, so throw instead
  function Fail($msg) { throw "VibeJudge installer: $msg" }

  # ---------- 1. Docker ----------
  Say "Checking Docker"
  $docker = $null
  $cmd = Get-Command docker -ErrorAction SilentlyContinue
  if ($cmd) { $docker = $cmd.Source }
  foreach ($p in @("$env:ProgramFiles\Docker\Docker\resources\bin\docker.exe",
                   "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin\docker.exe")) {
    if (-not $docker -and (Test-Path $p)) { $docker = $p }
  }
  if (-not $docker) {
    Write-Host "Docker Desktop is not installed." -ForegroundColor Yellow
    $answer = Read-Host "Install it now with winget? (needs admin + a restart afterwards) [y/N]"
    if ($answer -match '^[yY]') {
      winget install -e --id Docker.DockerDesktop --accept-package-agreements --accept-source-agreements
      Write-Host "`nDocker Desktop installed. RESTART the PC, open Docker Desktop once, then run this command again." -ForegroundColor Yellow
      return
    }
    Fail "Docker Desktop is required: https://www.docker.com/products/docker-desktop/"
  }

  # Start Docker Desktop if it is not running, and wait for it
  & $docker info *> $null
  if ($LASTEXITCODE -ne 0) {
    $desktop = @("$env:ProgramFiles\Docker\Docker\Docker Desktop.exe",
                 "$env:LOCALAPPDATA\Programs\DockerDesktop\Docker Desktop.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $desktop) { Fail "Docker is installed but not running. Start Docker Desktop and run this again." }
    Write-Host "    Starting Docker Desktop (can take a minute)..."
    Start-Process $desktop
    $deadline = (Get-Date).AddMinutes(4)
    do {
      Start-Sleep -Seconds 5
      & $docker info *> $null
    } while ($LASTEXITCODE -ne 0 -and (Get-Date) -lt $deadline)
    if ($LASTEXITCODE -ne 0) { Fail "Docker did not start. Open Docker Desktop, wait until it says 'running', then run this again." }
  }
  Ok "Docker is running"

  # Make Docker Desktop start at sign-in, so the worker also comes back after a reboot
  $settings = Join-Path $env:APPDATA "Docker\settings-store.json"
  $autoStartHint = "    Tip: in Docker Desktop -> Settings -> General, turn on 'Start Docker Desktop when you sign in'."
  if (Test-Path $settings) {
    # Only flip "AutoStart": false -> true (no BOM); never rewrite the whole JSON
    $raw = [IO.File]::ReadAllText($settings)
    if ($raw -match '"AutoStart"\s*:\s*false') {
      [IO.File]::WriteAllText($settings, ($raw -replace '"AutoStart"\s*:\s*false', '"AutoStart": true'), (New-Object Text.UTF8Encoding $false))
      # uninstall-judge.ps1 turns it back off only if we were the ones who turned it on
      New-Item -ItemType Directory -Force $Base | Out-Null
      New-Item -ItemType File -Force (Join-Path $Base "autostart-enabled-by-vibejudge") | Out-Null
      Ok "Docker Desktop will now start automatically when you sign in"
    } elseif ($raw -notmatch '"AutoStart"\s*:\s*true') {
      Write-Host $autoStartHint -ForegroundColor Yellow
    }
  } else {
    Write-Host $autoStartHint -ForegroundColor Yellow
  }

  # ---------- 2. Latest code ----------
  Say "Downloading the latest VibeJudge code"
  New-Item -ItemType Directory -Force $Base -ErrorAction Stop | Out-Null
  $zip = Join-Path $Base "src.zip"
  $tmp = Join-Path $Base "src.tmp"
  Invoke-WebRequest -UseBasicParsing "https://github.com/$Repo/archive/refs/heads/$Branch.zip" -OutFile $zip -ErrorAction Stop
  if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force -ErrorAction Stop }
  Expand-Archive $zip $tmp -Force -ErrorAction Stop
  if (Test-Path $Src) { Remove-Item $Src -Recurse -Force -ErrorAction Stop }
  Move-Item (Get-ChildItem $tmp -Directory | Select-Object -First 1).FullName $Src -ErrorAction Stop
  Remove-Item $tmp, $zip -Recurse -Force
  Ok "Code saved in $Src"

  # ---------- 3. Settings (first time only) ----------
  $haveToken = (Test-Path $EnvFile) -and ((Get-Content $EnvFile -Raw) -match '(?m)^JUDGE_TOKEN=\S+')
  if (-not $haveToken) {
    Say "First-time setup"
    $api = if ($env:VJ_API_URL) { $env:VJ_API_URL } else { $a = Read-Host "API URL [$DefaultApi]"; if ($a) { $a } else { $DefaultApi } }
    $token = $env:VJ_TOKEN
    while (-not $token) {
      $secure = Read-Host "JUDGE_TOKEN (Render -> vibejudge-api -> Environment; typing is hidden)" -AsSecureString
      $token = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
    }
    $defName = $env:COMPUTERNAME.ToLower()
    $workerName = if ($env:VJ_WORKER_NAME) { $env:VJ_WORKER_NAME } else { $n = Read-Host "Worker name [$defName]"; if ($n) { $n } else { $defName } }
    $defConc = [Math]::Max(1, [Environment]::ProcessorCount - 1)
    $conc = if ($env:VJ_CONCURRENCY) { $env:VJ_CONCURRENCY } else { $c = Read-Host "Submissions judged at the same time [$defConc]"; if ($c) { $c } else { $defConc } }

    # UTF-8 without BOM and LF line endings - otherwise docker misreads the first variable name
    $text = "API_URL=$($api.Trim().TrimEnd('/'))`nJUDGE_TOKEN=$($token.Trim())`nWORKER_NAME=$workerName`nCONCURRENCY=$conc`n"
    [IO.File]::WriteAllText($EnvFile, $text, (New-Object Text.UTF8Encoding $false))
    Ok "Settings saved in $EnvFile (keep this file private)"
  } else {
    Ok "Using saved settings from $EnvFile"
  }

  # ---------- 4. Build ----------
  Say "Building the judge (first time takes ~5-10 minutes)"
  & $docker build -f "$Src\apps\judge\Dockerfile" -t $Image $Src
  if ($LASTEXITCODE -ne 0) { Fail "docker build failed (see the messages above)" }

  # ---------- 5. Start ----------
  Say "Starting the worker"
  & $docker rm -f $Name *> $null
  & $docker run -d --restart unless-stopped --name $Name --privileged --cgroupns=private --env-file $EnvFile $Image | Out-Null
  if ($LASTEXITCODE -ne 0) { Fail "could not start the worker container" }

  # Watch the log for a few seconds to catch a wrong token
  Start-Sleep -Seconds 12
  $logs = (& $docker logs $Name 2>&1 | ForEach-Object { "$_" }) -join "`n"
  if ($logs -match "HTTP 401") {
    & $docker rm -f $Name *> $null
    Remove-Item $EnvFile -Force
    Fail "The JUDGE_TOKEN is wrong (the API said 401). Run the command again and paste the token from Render."
  }
  if ($logs -match "HTTP 503") {
    Write-Host "    The API says judging is disabled (JUDGE_TOKEN is not set on Render)." -ForegroundColor Yellow
  }

  Write-Host ""
  Write-Host (($logs -split "`n" | Select-Object -Last 3) -join "`n")
  Write-Host "`n[OK] VibeJudge judge is running on this PC." -ForegroundColor Green
  Write-Host "  It restarts by itself after a reboot (as soon as Docker Desktop is running)."
  Write-Host "  Update later : run the same command again"
  Write-Host "  See activity : docker logs -f $Name"
  Write-Host "  Remove all   : double-click remove-judge.bat, or run"
  Write-Host "                 irm https://raw.githubusercontent.com/$Repo/$Branch/scripts/uninstall-judge.ps1 | iex"
}
