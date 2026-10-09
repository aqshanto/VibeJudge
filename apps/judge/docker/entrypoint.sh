#!/bin/sh
# isolate-এর জন্য cgroup v2 subtree তৈরি করে।
# কনটেইনার চালাতে হবে: --privileged --cgroupns=private
set -eu

CG=/sys/fs/cgroup

if [ ! -f "$CG/cgroup.controllers" ]; then
  echo "entrypoint: cgroup v2 not found at $CG" >&2
  exit 1
fi

# cgroup v2-এর নিয়ম: যে cgroup-এ process আছে, সে child-দের controller দিতে পারে না।
# তাই আমাদের নিজেদের process গুলো আগে একটা leaf cgroup ("init")-এ সরাই।
mkdir -p "$CG/init"
for pid in $(cat "$CG/cgroup.procs"); do
  echo "$pid" > "$CG/init/cgroup.procs" 2>/dev/null || true
done

# memory, pids, cpuset controller নিচে পাঠাই — isolate এগুলো দিয়ে limit/মাপ নেয়
for c in cpuset memory pids; do
  if grep -qw "$c" "$CG/cgroup.controllers"; then
    echo "+$c" > "$CG/cgroup.subtree_control"
  fi
done

mkdir -p "$CG/isolate"
for c in cpuset memory pids; do
  if grep -qw "$c" "$CG/isolate/cgroup.controllers"; then
    echo "+$c" > "$CG/isolate/cgroup.subtree_control"
  fi
done

mkdir -p /run/isolate/locks

exec "$@"
