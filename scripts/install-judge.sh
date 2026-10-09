#!/usr/bin/env bash
# VibeJudge judge worker — Linux (Ubuntu/Debian)-এর এক কমান্ডের installer / updater
#
# ল্যাব পিসির টার্মিনালে শুধু এটা পেস্ট করো:
#   curl -fsSL https://raw.githubusercontent.com/aqshanto/VibeJudge/main/scripts/install-judge.sh | bash
#
# প্রথমবার: Docker না থাকলে ইনস্টল → কোড নামানো → টোকেন জিজ্ঞেস (একবারই) → image build → worker চালু।
# পরে আবার চালালে: নতুন কোডে আপডেট করে worker restart (টোকেন আর জিজ্ঞেস করে না)।
# Worker "--restart unless-stopped" দিয়ে চলে — পিসি restart হলেও নিজে আবার চলে।
#
# অটোমেশনের জন্য (প্রশ্ন ছাড়া): VJ_TOKEN, VJ_API_URL, VJ_WORKER_NAME, VJ_CONCURRENCY

set -euo pipefail

REPO="aqshanto/VibeJudge"
BRANCH="main"
DEFAULT_API="https://vibejudge-api.onrender.com"
BASE="$HOME/.vibejudge"
SRC="$BASE/src"
ENV_FILE="$BASE/worker.env"
IMAGE="vibejudge-judge"
NAME="vibejudge-worker"

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
ok() { printf '    \033[32m%s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mError: %s\033[0m\n' "$*" >&2; exit 1; }

# "curl | bash"-এ stdin হলো script নিজে — তাই প্রশ্নের উত্তর টার্মিনাল (/dev/tty) থেকে পড়ি
ask() {
  local prompt="$1" default="${2-}" answer=""
  read -rp "$prompt" answer </dev/tty || true
  printf '%s' "${answer:-$default}"
}
ask_secret() {
  local prompt="$1" answer=""
  read -rsp "$prompt" answer </dev/tty || true
  printf '\n' >/dev/tty
  printf '%s' "$answer"
}

[ "$(uname -s)" = "Linux" ] || die "This script is for Linux. On Windows use install-judge.ps1."
SUDO=""
if [ "$(id -u)" -ne 0 ]; then SUDO="sudo"; fi

# ---------- ১. Docker ----------
say "Checking Docker"
if ! command -v docker >/dev/null 2>&1; then
  echo "    Docker is not installed — installing it (your password may be asked)."
  curl -fsSL https://get.docker.com | $SUDO sh
fi
$SUDO systemctl enable --now docker >/dev/null 2>&1 || true
DOCKER="docker"
docker info >/dev/null 2>&1 || DOCKER="$SUDO docker" # নিজে docker group-এ না থাকলে sudo দিয়ে
$DOCKER info >/dev/null 2>&1 || die "Docker is installed but not running."
ok "Docker is running"

# isolate-এর জন্য cgroup v2 লাগে (Ubuntu 22.04+ এ ডিফল্ট)
[ -f /sys/fs/cgroup/cgroup.controllers ] || die "This system uses cgroup v1. Use Ubuntu 22.04 or newer."

# ---------- ২. সর্বশেষ কোড ----------
say "Downloading the latest VibeJudge code"
mkdir -p "$BASE"
rm -rf "$SRC.tmp" && mkdir -p "$SRC.tmp"
curl -fsSL "https://github.com/$REPO/archive/refs/heads/$BRANCH.tar.gz" | tar -xz -C "$SRC.tmp" --strip-components=1
rm -rf "$SRC" && mv "$SRC.tmp" "$SRC"
ok "Code saved in $SRC"

# ---------- ৩. সেটিং (শুধু প্রথমবার) ----------
if [ -f "$ENV_FILE" ] && grep -qE '^JUDGE_TOKEN=[^[:space:]]+' "$ENV_FILE"; then
  ok "Using saved settings from $ENV_FILE"
else
  say "First-time setup"
  api="${VJ_API_URL:-$(ask "API URL [$DEFAULT_API]: " "$DEFAULT_API")}"
  token="${VJ_TOKEN:-}"
  while [ -z "$token" ]; do
    token="$(ask_secret "JUDGE_TOKEN (Render -> vibejudge-api -> Environment; typing is hidden): ")"
  done
  def_name="$(hostname | tr '[:upper:]' '[:lower:]')"
  name="${VJ_WORKER_NAME:-$(ask "Worker name [$def_name]: " "$def_name")}"
  cores="$(nproc)"
  def_conc=$(( cores > 1 ? cores - 1 : 1 ))
  conc="${VJ_CONCURRENCY:-$(ask "Submissions judged at the same time [$def_conc]: " "$def_conc")}"
  (
    umask 077 # শুধু নিজে পড়তে পারবে — টোকেন গোপন
    printf 'API_URL=%s\nJUDGE_TOKEN=%s\nWORKER_NAME=%s\nCONCURRENCY=%s\n' "${api%/}" "$token" "$name" "$conc" >"$ENV_FILE"
  )
  ok "Settings saved in $ENV_FILE (keep this file private)"
fi

# ---------- ৪. Image build ----------
say "Building the judge (first time takes ~5-10 minutes)"
$DOCKER build -f "$SRC/apps/judge/Dockerfile" -t "$IMAGE" "$SRC"

# ---------- ৫. Worker চালু ----------
say "Starting the worker"
$DOCKER rm -f "$NAME" >/dev/null 2>&1 || true
$DOCKER run -d --restart unless-stopped --name "$NAME" --privileged --cgroupns=private \
  --env-file "$ENV_FILE" "$IMAGE" >/dev/null

# টোকেন ঠিক আছে কি না — কয়েক সেকেন্ড লগ দেখি
sleep 12
logs="$($DOCKER logs "$NAME" 2>&1 || true)"
if printf '%s' "$logs" | grep -q "HTTP 401"; then
  $DOCKER rm -f "$NAME" >/dev/null 2>&1 || true
  rm -f "$ENV_FILE"
  die "The JUDGE_TOKEN is wrong (the API said 401). Run the command again and paste the token from Render."
fi
if printf '%s' "$logs" | grep -q "HTTP 503"; then
  printf '    \033[33mThe API says judging is disabled (JUDGE_TOKEN is not set on Render).\033[0m\n'
fi

echo
printf '%s\n' "$logs" | tail -3
printf '\n\033[1;32m[OK] VibeJudge judge is running on this PC.\033[0m\n'
echo "  It restarts by itself after a reboot."
echo "  Update later : run the same command again"
echo "  See activity : $DOCKER logs -f $NAME"
echo "  Remove all   : curl -fsSL https://raw.githubusercontent.com/$REPO/$BRANCH/scripts/uninstall-judge.sh | bash"
