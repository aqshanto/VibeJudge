# VibeJudge judge worker - one-command REMOVER for Windows.
#
# Undoes install-judge.ps1 on this PC:
#   irm https://raw.githubusercontent.com/aqshanto/VibeJudge/main/scripts/uninstall-judge.ps1 | iex
# (or double-click remove-judge.bat)
#
# Stops and deletes every judge container, the judge image, the base images it was built
# from, the Docker build cache and the ~/.vibejudge folder (code + saved token).
# Docker Desktop itself is NOT uninstalled.
#
# Non-interactive use: $env:VJ_YES = "1" skips the confirmation.
#
# NOTE: keep this file ASCII-only (see install-judge.ps1).

& {
  $ErrorActionPreference = "Continue"

  $Base = Join-Path $env:USERPROFILE ".vibejudge"
  $Image = "vibejudge-judge"
  $Name = "vibejudge-worker"
  # Base images pulled by apps/judge/Dockerfile (FROM lines); also read from the saved copy below
  $BaseImages = @("debian:trixie-slim", "node:22-trixie-slim")
  $AutoStartMarker = Join-Path $Base "autostart-enabled-by-vibejudge"

  function Say($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
  function Ok($msg) { Write-Host "    $msg" -ForegroundColor Green }
  function Warn($msg) { Write-Host "    $msg" -ForegroundColor Yellow }

  Write-Host "This removes the VibeJudge judge from this PC:" -ForegroundColor Cyan
  Write-Host "  - stops and deletes the judge worker container(s)"
  Write-Host "  - deletes the judge image, its base images and the Docker build cache"
  Write-Host "  - deletes $Base (downloaded code + saved token)"
  Write-Host "  Docker Desktop itself stays installed."
  if ($env:VJ_YES -ne "1") {
    $answer = Read-Host "`nRemove everything? [y/N]"
    if ($answer -notmatch '^[yY]') { Write-Host "Nothing was changed."; return }
  }

  # ---------- 1. Docker ----------
  Say "Checking Docker"
  $docker = $null
  $cmd = Get-Command docker -ErrorAction SilentlyContinue
  if ($cmd) { $docker = $cmd.Source }
  foreach ($p in @("$env:ProgramFiles\Docker\Docker\resources\bin\docker.exe",
                   "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin\docker.exe")) {
    if (-not $docker -and (Test-Path $p)) { $docker = $p }
  }

  $dockerOk = $false
  if (-not $docker) {
    Warn "Docker is not installed - nothing to remove there."
  } else {
    & $docker info *> $null
    if ($LASTEXITCODE -ne 0) {
      # Images live inside Docker's own disk, so Docker must be running to delete them
      $desktop = @("$env:ProgramFiles\Docker\Docker\Docker Desktop.exe",
                   "$env:LOCALAPPDATA\Programs\DockerDesktop\Docker Desktop.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
      if ($desktop) {
        Write-Host "    Starting Docker Desktop to delete the images (can take a minute)..."
        Start-Process $desktop
        $deadline = (Get-Date).AddMinutes(4)
        do {
          Start-Sleep -Seconds 5
          & $docker info *> $null
        } while ($LASTEXITCODE -ne 0 -and (Get-Date) -lt $deadline)
      }
    }
    & $docker info *> $null
    if ($LASTEXITCODE -eq 0) { $dockerOk = $true; Ok "Docker is running" }
    else { Warn "Docker is not running - containers and images were NOT removed. Start Docker Desktop and run this again." }
  }

  if ($dockerOk) {
    # ---------- 2. Containers (stop the judge server) ----------
    Say "Stopping the judge worker"
    $ids = @()
    $ids += & $docker ps -aq --filter "name=^$Name$" 2>$null
    $ids += & $docker ps -aq --filter "ancestor=$Image" 2>$null
    $ids = $ids | Where-Object { $_ } | Sort-Object -Unique
    if ($ids) {
      & $docker rm -f $ids | Out-Null
      Ok "Removed $(@($ids).Count) container(s)"
    } else {
      Ok "No judge container was running"
    }

    # ---------- 3. Images + build cache ----------
    Say "Deleting the judge image and build cache"
    $dockerfile = Join-Path $Base "src\apps\judge\Dockerfile"
    if (Test-Path $dockerfile) {
      foreach ($line in Get-Content $dockerfile) {
        if ($line -match '^\s*FROM\s+(\S+)') { $BaseImages += $Matches[1] }
      }
    }
    & $docker image inspect $Image *> $null
    if ($LASTEXITCODE -eq 0) {
      & $docker rmi -f $Image | Out-Null
      Ok "Deleted image $Image"
    } else {
      Ok "Image $Image was not there"
    }
    # Plain rmi (no -f): an image that something else still uses is kept
    foreach ($img in ($BaseImages | Sort-Object -Unique)) {
      & $docker image inspect $img *> $null
      if ($LASTEXITCODE -ne 0) { continue }
      & $docker rmi $img *> $null
      if ($LASTEXITCODE -eq 0) { Ok "Deleted base image $img" } else { Warn "Kept $img (another container or image uses it)" }
    }
    # Old judge images left untagged by earlier updates
    & $docker image prune -f | Out-Null
    & $docker builder prune -af | Out-Null
    Ok "Cleared the Docker build cache"
  }

  # ---------- 4. Docker Desktop auto-start ----------
  # Only undo it if install-judge.ps1 was the one that turned it on
  $settings = Join-Path $env:APPDATA "Docker\settings-store.json"
  if ((Test-Path $AutoStartMarker) -and (Test-Path $settings)) {
    $raw = [IO.File]::ReadAllText($settings)
    if ($raw -match '"AutoStart"\s*:\s*true') {
      [IO.File]::WriteAllText($settings, ($raw -replace '"AutoStart"\s*:\s*true', '"AutoStart": false'), (New-Object Text.UTF8Encoding $false))
      Ok "Docker Desktop will no longer start automatically at sign-in"
    }
  }

  # ---------- 5. Files ----------
  Say "Deleting downloaded files"
  if (Test-Path $Base) {
    Remove-Item $Base -Recurse -Force -ErrorAction SilentlyContinue
    if (Test-Path $Base) { Warn "Could not fully delete $Base - close any program using it and delete it by hand." }
    else { Ok "Deleted $Base" }
  } else {
    Ok "$Base was not there"
  }

  Write-Host "`n[OK] VibeJudge judge has been removed from this PC." -ForegroundColor Green
  if ($dockerOk) {
    Write-Host "  Note: Docker keeps its data in one virtual disk file, which may take a while to shrink."
  }
}
