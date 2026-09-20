#!/usr/bin/env bash
# Project-local entry point. No sudo, global npm packages, profile edits, or Docker.
set -euo pipefail
task_repo="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
task_runtime="${XDG_DATA_HOME:-$HOME/.local/share}/myasset-dev"
task_major="${MYASSET_NODE_MAJOR:-22}"
[[ "$task_major" == 22 || "$task_major" == 24 ]] || { echo 'Supported Node majors: 22 or 24' >&2; exit 1; }
task_node="$task_runtime/node$task_major"
task_frontend="$task_repo/frontend"

use_node() {
  if [[ ! -x "$task_node/bin/node" ]]; then
    echo 'Project Node runtime is missing. Run: bash tools/wsl-dev.sh install' >&2
    exit 1
  fi
  export PATH="$task_node/bin:$PATH"
  export npm_config_cache="$task_runtime/npm-cache"
  export npm_config_update_notifier=false
}

case "${1:-help}" in
  install)
    [[ "$(uname -m)" == x86_64 ]] || { echo 'This setup currently supports Linux x86_64 only.' >&2; exit 1; }
    [[ -f "$task_frontend/package-lock.json" ]] || { echo 'Missing frontend lockfile.' >&2; exit 1; }
    mkdir -p -- "$task_runtime"
    if [[ ! -x "$task_node/bin/node" ]]; then
      [[ ! -e "$task_node" ]] || { echo 'Existing incomplete runtime found; inspect it before retrying.' >&2; exit 1; }
      task_download="$(mktemp -d "$task_runtime/download.XXXXXXXX")"
      curl --fail --location --retry 2 --connect-timeout 15 --max-time 120 \
        "https://nodejs.org/dist/latest-v$task_major.x/SHASUMS256.txt" -o "$task_download/SHASUMS256.txt"
      task_archive="$(awk -v major="$task_major" '$2 ~ ("^node-v" major "\\.[0-9]+\\.[0-9]+-linux-x64\\.tar\\.xz$") {print $2}' "$task_download/SHASUMS256.txt")"
      [[ "$task_archive" =~ ^node-v${task_major}\.[0-9]+\.[0-9]+-linux-x64\.tar\.xz$ ]] || { echo 'Unexpected Node release metadata.' >&2; exit 1; }
      task_version="${task_archive%-linux-x64.tar.xz}"
      task_version="${task_version#node-}"
      curl --fail --location --retry 2 --connect-timeout 15 --max-time 300 \
        "https://nodejs.org/dist/$task_version/$task_archive" -o "$task_download/$task_archive"
      (cd -- "$task_download"; awk -v archive="$task_archive" '$2 == archive' SHASUMS256.txt | sha256sum --check --strict -)
      # Extract into a fresh versioned directory; no directory rename or system Node replacement.
      mkdir -- "$task_node"
      tar -xJf "$task_download/$task_archive" -C "$task_node" --strip-components=1
    fi
    use_node
    node --version
    npm --version
    cd -- "$task_frontend"
    # npm ci replaces only this project's dependency directory, using the existing lockfile.
    npm ci --no-audit --no-fund
    ;;
  dev)
    use_node
    # Node 22.23 supports the existing proxy for fetch; local requests stay local.
    export NODE_USE_ENV_PROXY=1
    export NO_PROXY="${NO_PROXY:+$NO_PROXY,}localhost,127.0.0.1,::1"
    cd -- "$task_frontend"
    exec npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
    ;;
  test)
    use_node
    cd -- "$task_frontend"
    exec npm test -- --maxWorkers=1 --minWorkers=1
    ;;
  build)
    use_node
    cd -- "$task_frontend"
    exec npm run build
    ;;
  status)
    use_node
    node --version
    npm --version
    cd -- "$task_frontend"
    exec npm ls --depth=0
    ;;
  *)
    echo 'Usage: bash tools/wsl-dev.sh {install|dev|test|build|status}'
    ;;
esac
