#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

PACK_PATHS=(
  "packages/core"
  "packages/providers"
  "packages/proxy"
  "packages/ui"
  "apps/overlay"
  "packages/cli"
)

PUBLISH_PACKAGES=(
  "@pinpatch/core"
  "@pinpatch/providers"
  "@pinpatch/proxy"
  "@pinpatch/ui"
  "@pinpatch/overlay"
  "pinpatch"
)

TAG="latest"
NO_GIT_CHECKS=1
PUBLISH_WITH_ALL=0
PACK_DIR=""
CONSUMER_DIR=""
TARGET_PORT=4010
BRIDGE_PORT=7441
PROXY_PORT=3441
BAD_VERSION=""
GOOD_VERSION=""
DEPRECATION_REASON=""
PROMOTE_VERSION=""

log() {
  printf '\n[%s] %s\n' "$(date '+%H:%M:%S')" "$*"
}

run() {
  log "$*"
  "$@"
}

die() {
  printf '\nERROR: %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

usage() {
  cat <<'EOF'
Usage:
  scripts/npm-release.sh <command> [options]

Commands:
  preflight
      Run: pnpm install --frozen-lockfile, clean, build, typecheck, test, test:e2e

  pack-verify
      Run npm pack --dry-run + pnpm pack for publishable packages, install tarballs
      in a temp external directory, verify pinpatch CLI commands, and verify overlay
      runtime does not fall back to warning script.

  registry-readiness
      Run npm whoami and npm ping.

  publish
      Publish packages in dependency order:
      @pinpatch/core, @pinpatch/providers, @pinpatch/proxy, @pinpatch/ui,
      @pinpatch/overlay, pinpatch

  post-verify
      Run npm view checks for all publish packages and npx pinpatch@<tag> --help.

  promote
      Promote a published version to latest for all publish packages.
      Defaults to packages/cli/package.json version when --version is omitted.

  rollback
      Deprecate bad versions and restore latest dist-tag to a known-good version.
      Requires --bad-version and --good-version.

  all
      Run: preflight -> pack-verify -> registry-readiness
      Optional publish path: add --publish-with-all to also run publish + post-verify.

Options:
  --tag <tag>                 npm dist-tag for publish/post-verify (default: latest)
  --pack-dir <path>           tarball output directory for pack-verify
  --consumer-dir <path>       external install test directory for pack-verify
  --target-port <port>        temp target app port for overlay runtime check (default: 4010)
  --bridge-port <port>        bridge port for overlay runtime check (default: 7441)
  --proxy-port <port>         proxy port for overlay runtime check (default: 3441)
  --no-git-checks             pass --no-git-checks to pnpm publish (default)
  --git-checks                do not pass --no-git-checks to pnpm publish
  --publish-with-all          for 'all', include publish and post-verify
  --version <version>         promote: version to set as latest for all packages
  --bad-version <version>     rollback: version to deprecate
  --good-version <version>    rollback: version to tag as latest
  --reason <text>             rollback deprecation message
  -h, --help                  show this help
EOF
}

resolve_repo_version() {
  node -e 'console.log(require(process.argv[1]).version)' "$ROOT_DIR/packages/cli/package.json"
}

preflight() {
  pushd "$ROOT_DIR" >/dev/null
  run pnpm install --frozen-lockfile
  run pnpm clean
  run pnpm build
  run pnpm typecheck
  run pnpm test
  run pnpm test:e2e
  popd >/dev/null
}

pack_verify() {
  pushd "$ROOT_DIR" >/dev/null

  local path
  for path in "${PACK_PATHS[@]}"; do
    log "npm pack --dry-run $path"
    (cd "$path" && npm pack --dry-run)
  done

  if [[ -z "$PACK_DIR" ]]; then
    PACK_DIR="/tmp/pinpatch-pack-$(date +%s)"
  fi
  mkdir -p "$PACK_DIR"

  for path in "${PACK_PATHS[@]}"; do
    log "pnpm pack $path -> $PACK_DIR"
    (cd "$path" && pnpm pack --pack-destination "$PACK_DIR" >/dev/null)
  done
  run ls -1 "$PACK_DIR"

  if [[ -z "$CONSUMER_DIR" ]]; then
    CONSUMER_DIR="/tmp/pinpatch-consumer-$(date +%s)"
  fi
  mkdir -p "$CONSUMER_DIR"

  log "Installing tarballs in external consumer dir: $CONSUMER_DIR"
  (
    cd "$CONSUMER_DIR"
    npm init -y >/dev/null
    npm install "$PACK_DIR"/*.tgz
    npx pinpatch --help
    npx pinpatch tasks
  )

  log "Verifying overlay runtime in external consumer dir"
  local target_pid=0
  local pinpatch_pid=0
  local overlay_file="$CONSUMER_DIR/overlay.js"
  local proxied_file="$CONSUMER_DIR/proxied.html"
  local log_file="$CONSUMER_DIR/pinpatch-dev.log"

  cleanup_runtime() {
    if [[ "$pinpatch_pid" -gt 0 ]]; then
      kill "$pinpatch_pid" >/dev/null 2>&1 || true
      wait "$pinpatch_pid" >/dev/null 2>&1 || true
    fi
    if [[ "$target_pid" -gt 0 ]]; then
      kill "$target_pid" >/dev/null 2>&1 || true
      wait "$target_pid" >/dev/null 2>&1 || true
    fi
  }

  trap cleanup_runtime EXIT

  (
    cd "$CONSUMER_DIR"
    node -e "require('http').createServer((_,res)=>{res.setHeader('content-type','text/html');res.end('<html><body><h1>ok</h1></body></html>')}).listen($TARGET_PORT)"
  ) &
  target_pid=$!

  (
    cd "$CONSUMER_DIR"
    npx pinpatch dev --target "$TARGET_PORT" --bridge-port "$BRIDGE_PORT" --proxy-port "$PROXY_PORT" >"$log_file" 2>&1
  ) &
  pinpatch_pid=$!

  local attempt
  for attempt in $(seq 1 50); do
    if rg -q "Pinpatch dev ready" "$log_file" 2>/dev/null; then
      break
    fi
    sleep 0.2
    if [[ "$attempt" -eq 50 ]]; then
      cat "$log_file" || true
      die "pinpatch dev did not become ready in time"
    fi
  done

  run curl -sf "http://localhost:$BRIDGE_PORT/overlay.js" -o "$overlay_file"
  run curl -sf "http://localhost:$PROXY_PORT/" -o "$proxied_file"

  if rg -q "__PINPATCH_OVERLAY_FALLBACK__|overlay bundle is missing" "$overlay_file"; then
    die "Overlay runtime check failed: fallback overlay script detected"
  fi

  if ! rg -q 'data-pinpatch-overlay="true"' "$proxied_file"; then
    die "Proxy injection check failed: overlay script tag missing in proxied HTML"
  fi

  cleanup_runtime
  trap - EXIT
  popd >/dev/null
}

registry_readiness() {
  pushd "$ROOT_DIR" >/dev/null
  run npm whoami
  run npm ping
  popd >/dev/null
}

publish_packages() {
  pushd "$ROOT_DIR" >/dev/null

  local pkg
  local -a cmd
  for pkg in "${PUBLISH_PACKAGES[@]}"; do
    if [[ "$pkg" == "pinpatch" ]]; then
      cmd=(pnpm --filter "$pkg" publish --tag "$TAG")
    else
      cmd=(pnpm --filter "$pkg" publish --access public --tag "$TAG")
    fi

    if [[ "$NO_GIT_CHECKS" -eq 1 ]]; then
      cmd+=(--no-git-checks)
    fi

    run "${cmd[@]}"
  done

  popd >/dev/null
}

post_verify() {
  pushd "$ROOT_DIR" >/dev/null

  local pkg
  for pkg in "${PUBLISH_PACKAGES[@]}"; do
    run npm view "$pkg" version dist-tags --json
  done

  run npx "pinpatch@$TAG" --help
  popd >/dev/null
}

rollback() {
  [[ -n "$BAD_VERSION" ]] || die "rollback requires --bad-version"
  [[ -n "$GOOD_VERSION" ]] || die "rollback requires --good-version"
  if [[ -z "$DEPRECATION_REASON" ]]; then
    DEPRECATION_REASON="Bad release: use $GOOD_VERSION"
  fi

  pushd "$ROOT_DIR" >/dev/null

  local pkg
  for pkg in "${PUBLISH_PACKAGES[@]}"; do
    run npm deprecate "$pkg@$BAD_VERSION" "$DEPRECATION_REASON"
  done

  for pkg in "${PUBLISH_PACKAGES[@]}"; do
    run npm dist-tag add "$pkg@$GOOD_VERSION" latest
  done

  popd >/dev/null
}

promote() {
  if [[ -z "$PROMOTE_VERSION" ]]; then
    PROMOTE_VERSION="$(resolve_repo_version)"
  fi

  pushd "$ROOT_DIR" >/dev/null

  local pkg
  for pkg in "${PUBLISH_PACKAGES[@]}"; do
    run npm dist-tag add "$pkg@$PROMOTE_VERSION" latest
  done

  popd >/dev/null
}

main() {
  [[ $# -gt 0 ]] || {
    usage
    exit 1
  }

  case "$1" in
    -h|--help|help)
      usage
      exit 0
      ;;
  esac

  local command="$1"
  shift

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --tag)
        TAG="$2"
        shift 2
        ;;
      --pack-dir)
        PACK_DIR="$2"
        shift 2
        ;;
      --consumer-dir)
        CONSUMER_DIR="$2"
        shift 2
        ;;
      --target-port)
        TARGET_PORT="$2"
        shift 2
        ;;
      --bridge-port)
        BRIDGE_PORT="$2"
        shift 2
        ;;
      --proxy-port)
        PROXY_PORT="$2"
        shift 2
        ;;
      --no-git-checks)
        NO_GIT_CHECKS=1
        shift
        ;;
      --git-checks)
        NO_GIT_CHECKS=0
        shift
        ;;
      --publish-with-all)
        PUBLISH_WITH_ALL=1
        shift
        ;;
      --version)
        PROMOTE_VERSION="$2"
        shift 2
        ;;
      --bad-version)
        BAD_VERSION="$2"
        shift 2
        ;;
      --good-version)
        GOOD_VERSION="$2"
        shift 2
        ;;
      --reason)
        DEPRECATION_REASON="$2"
        shift 2
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        die "Unknown option: $1"
        ;;
    esac
  done

  require_cmd pnpm
  require_cmd npm
  require_cmd npx
  require_cmd node
  require_cmd curl
  require_cmd rg

  case "$command" in
    preflight)
      preflight
      ;;
    pack-verify)
      pack_verify
      ;;
    registry-readiness)
      registry_readiness
      ;;
    publish)
      publish_packages
      ;;
    post-verify)
      post_verify
      ;;
    promote)
      promote
      ;;
    rollback)
      rollback
      ;;
    all)
      preflight
      pack_verify
      registry_readiness
      if [[ "$PUBLISH_WITH_ALL" -eq 1 ]]; then
        publish_packages
        post_verify
      else
        log "Skipping publish and post-verify. Re-run with --publish-with-all to publish."
      fi
      ;;
    *)
      die "Unknown command: $command"
      ;;
  esac
}

main "$@"
