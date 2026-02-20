#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

PACKAGE_PATHS=(
  "packages/core"
  "packages/providers"
  "packages/proxy"
  "packages/ui"
  "apps/overlay"
  "packages/cli"
)

TARGET=""
DRY_RUN=0
RUN_INSTALL=1

usage() {
  cat <<'EOF'
Usage:
  scripts/bump-version.sh <patch|minor|major|version> [options]

Description:
  Bump all publishable Pinpatch packages to the same version:
  - @pinpatch/core
  - @pinpatch/providers
  - @pinpatch/proxy
  - @pinpatch/ui
  - @pinpatch/overlay
  - pinpatch

Arguments:
  patch|minor|major    Increment current version from packages/cli/package.json
  version              Explicit version (example: 0.1.2)

Options:
  --dry-run            Print planned changes without writing files
  --no-install         Skip running "pnpm install" after version updates
  -h, --help           Show this help text

Examples:
  ./scripts/bump-version.sh patch
  ./scripts/bump-version.sh minor
  ./scripts/bump-version.sh 0.1.2
  ./scripts/bump-version.sh 0.1.2 --dry-run
EOF
}

die() {
  echo "ERROR: $*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

get_current_version() {
  node -e 'console.log(require(process.argv[1]).version)' "$ROOT_DIR/packages/cli/package.json"
}

compute_next_version() {
  local current="$1"
  local target="$2"

  case "$target" in
    patch|minor|major)
      ;;
    *)
      echo "$target"
      return 0
      ;;
  esac

  if [[ ! "$current" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
    die "Current version '$current' is not plain semver (x.y.z); use explicit version instead."
  fi

  local major minor patch
  major="${BASH_REMATCH[1]}"
  minor="${BASH_REMATCH[2]}"
  patch="${BASH_REMATCH[3]}"

  case "$target" in
    patch)
      patch=$((patch + 1))
      ;;
    minor)
      minor=$((minor + 1))
      patch=0
      ;;
    major)
      major=$((major + 1))
      minor=0
      patch=0
      ;;
  esac

  echo "${major}.${minor}.${patch}"
}

validate_version() {
  local version="$1"
  if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]]; then
    die "Invalid version '$version'. Expected semver-like value (for example: 0.1.2)"
  fi
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

  TARGET="$1"
  shift

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --dry-run)
        DRY_RUN=1
        shift
        ;;
      --no-install)
        RUN_INSTALL=0
        shift
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

  require_cmd node
  require_cmd npm
  require_cmd pnpm

  local current_version next_version
  current_version="$(get_current_version)"
  next_version="$(compute_next_version "$current_version" "$TARGET")"
  validate_version "$next_version"

  echo "Current version: $current_version"
  echo "Next version:    $next_version"
  echo "Packages:"
  local path
  for path in "${PACKAGE_PATHS[@]}"; do
    echo "  - $path"
  done

  for path in "${PACKAGE_PATHS[@]}"; do
    if [[ "$DRY_RUN" -eq 1 ]]; then
      echo "[dry-run] (cd \"$path\" && npm version \"$next_version\" --no-git-tag-version)"
      continue
    fi

    (
      cd "$ROOT_DIR/$path"
      npm version "$next_version" --no-git-tag-version >/dev/null
    )
  done

  if [[ "$DRY_RUN" -eq 0 && "$RUN_INSTALL" -eq 1 ]]; then
    (cd "$ROOT_DIR" && pnpm install)
  elif [[ "$DRY_RUN" -eq 0 && "$RUN_INSTALL" -eq 0 ]]; then
    echo "Skipped pnpm install (--no-install)"
  fi

  if [[ "$DRY_RUN" -eq 0 ]]; then
    echo
    echo "Updated versions:"
    node -e '
      const root = process.argv[1];
      const paths = process.argv.slice(2);
      for (const rel of paths) {
        const pkg = require(`${root}/${rel}/package.json`);
        console.log(`  ${pkg.name}@${pkg.version}`);
      }
    ' "$ROOT_DIR" "${PACKAGE_PATHS[@]}"
  fi
}

main "$@"
