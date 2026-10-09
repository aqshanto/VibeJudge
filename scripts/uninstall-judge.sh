#!/usr/bin/env bash
# VibeJudge judge worker — Linux-এর এক কমান্ডের remover (install-judge.sh-এর উল্টো)
#
#   curl -fsSL https://raw.githubusercontent.com/aqshanto/VibeJudge/main/scripts/uninstall-judge.sh | bash
#
# judge-এর সব container বন্ধ করে মুছে দেয়, judge image, যে base image থেকে বানানো সেগুলো,
# Docker build cache আর ~/.vibejudge ফোল্ডার (কোড + সেভ করা টোকেন)। Docker নিজে থেকে যায়।
#
# অটোমেশনের জন্য (প্রশ্ন ছাড়া): VJ_YES=1

set -uo pipefail

BASE="$HOME/.vibejudge"
IMAGE="vibejudge-judge"
NAME="vibejudge-worker"
# apps/judge/Dockerfile-এর FROM লাইনগুলো; সেভ করা কপি থাকলে সেখান থেকেও পড়ি
BASE_IMAGES="debian:trixie-slim node:22-trixie-slim"

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
ok() { printf '    \033[32m%s\033[0m\n' "$*"; }
warn() { printf '    \033[33m%s\033[0m\n' "$*"; }

echo "This removes the VibeJudge judge from this PC:"
echo "  - stops and deletes the judge worker container(s)"
echo "  - deletes the judge image, its base images and the Docker build cache"
echo "  - deletes $BASE (downloaded code + saved token)"
echo "  Docker itself stays installed."
if [ "${VJ_YES:-}" != "1" ]; then
  # "curl | bash"-এ stdin হলো script নিজে — উত্তর টার্মিনাল থেকে পড়ি
  answer=""
  read -rp $'\nRemove everything? [y/N] ' answer </dev/tty || true
  case "$answer" in [yY]*) ;; *) echo "Nothing was changed."; exit 0 ;; esac
fi

SUDO=""
if [ "$(id -u)" -ne 0 ]; then SUDO="sudo"; fi

say "Checking Docker"
DOCKER=""
if command -v docker >/dev/null 2>&1; then
  if docker info >/dev/null 2>&1; then DOCKER="docker"
  elif $SUDO docker info >/dev/null 2>&1; then DOCKER="$SUDO docker"
  fi
fi

if [ -z "$DOCKER" ]; then
  warn "Docker is not installed or not running — containers and images were NOT removed."
else
  ok "Docker is running"

  say "Stopping the judge worker"
  ids="$( { $DOCKER ps -aq --filter "name=^${NAME}\$"; $DOCKER ps -aq --filter "ancestor=$IMAGE"; } 2>/dev/null | sort -u)"
  if [ -n "$ids" ]; then
    # shellcheck disable=SC2086
    $DOCKER rm -f $ids >/dev/null
    ok "Removed $(printf '%s\n' "$ids" | wc -l) container(s)"
  else
    ok "No judge container was running"
  fi

  say "Deleting the judge image and build cache"
  if [ -f "$BASE/src/apps/judge/Dockerfile" ]; then
    BASE_IMAGES="$BASE_IMAGES $(sed -nE 's/^[[:space:]]*FROM[[:space:]]+([^[:space:]]+).*/\1/p' "$BASE/src/apps/judge/Dockerfile")"
  fi
  if $DOCKER image inspect "$IMAGE" >/dev/null 2>&1; then
    $DOCKER rmi -f "$IMAGE" >/dev/null && ok "Deleted image $IMAGE"
  else
    ok "Image $IMAGE was not there"
  fi
  # -f ছাড়া rmi: অন্য কিছু ব্যবহার করলে image থেকে যায়
  for img in $(printf '%s\n' $BASE_IMAGES | sort -u); do
    $DOCKER image inspect "$img" >/dev/null 2>&1 || continue
    if $DOCKER rmi "$img" >/dev/null 2>&1; then ok "Deleted base image $img"
    else warn "Kept $img (another container or image uses it)"; fi
  done
  $DOCKER image prune -f >/dev/null 2>&1 || true   # আগের আপডেটের নামহীন পুরোনো judge image
  $DOCKER builder prune -af >/dev/null 2>&1 || true
  ok "Cleared the Docker build cache"
fi

say "Deleting downloaded files"
if [ -d "$BASE" ]; then
  rm -rf "$BASE" && ok "Deleted $BASE" || warn "Could not fully delete $BASE"
else
  ok "$BASE was not there"
fi

printf '\n\033[1;32m[OK] VibeJudge judge has been removed from this PC.\033[0m\n'
