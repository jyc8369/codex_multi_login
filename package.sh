#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  bash package.sh [--build-only] [--skip-compile] [--package|--publish]

By default this shows an interactive menu:
  1) 일반 빌드  -> vsce package
  2) 업로드 빌드 -> vsce publish

--build-only runs only the build/copy step.
--skip-compile skips TypeScript compilation and only refreshes copied assets.
--package skips the menu and runs vsce package.
--publish skips the menu and runs vsce publish.
EOF
}

die() {
  echo "ERROR: $*" >&2
  exit 1
}

BUILD_ONLY=0
SKIP_COMPILE=0
ACTION=""

for arg in "$@"; do
  case "$arg" in
    --build-only)
      BUILD_ONLY=1
      ;;
    --skip-compile)
      SKIP_COMPILE=1
      ;;
    --package)
      ACTION="package"
      ;;
    --publish)
      ACTION="publish"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "Unknown argument: $arg"
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$SCRIPT_DIR"
EXTENSION_DIR="$ROOT_DIR/extension"
RELEASE_DIR="$ROOT_DIR/releases"
PACKAGE_NAME="$(node -p "require('./package.json').name")"
PACKAGE_VERSION="$(node -p "require('./package.json').version")"
SOURCE_VSIX="$EXTENSION_DIR/${PACKAGE_NAME}-${PACKAGE_VERSION}.vsix"
TARGET_VSIX="$RELEASE_DIR/${PACKAGE_NAME}-${PACKAGE_VERSION}.vsix"

log() {
  printf '[package] %s\n' "$*"
}

copy_webview_assets() {
  rm -rf "$ROOT_DIR/out/webview" "$EXTENSION_DIR/out"
  mkdir -p "$ROOT_DIR/out" "$EXTENSION_DIR"
  cp -R "$ROOT_DIR/src/webview" "$ROOT_DIR/out/"
  cp -R "$ROOT_DIR/out" "$EXTENSION_DIR/"
  cp "$ROOT_DIR/icon.png" "$EXTENSION_DIR/icon.png"
}

build_extension() {
  if [[ "$SKIP_COMPILE" -eq 0 ]]; then
    log "running tsc"
    (cd "$ROOT_DIR" && npx tsc -p .)
  else
    log "skipping tsc"
  fi

  log "copying webview assets"
  copy_webview_assets
}

package_extension() {
  mkdir -p "$RELEASE_DIR"
  rm -f "$SOURCE_VSIX" "$TARGET_VSIX"

  log "running vsce package"
  (cd "$EXTENSION_DIR" && npx vsce package --allow-missing-repository --no-dependencies)

  [[ -f "$SOURCE_VSIX" ]] || die "VSIX was not created at $SOURCE_VSIX"
  mv "$SOURCE_VSIX" "$TARGET_VSIX"
  log "done -> $TARGET_VSIX"
}

publish_extension() {
  mkdir -p "$RELEASE_DIR"
  rm -f "$SOURCE_VSIX" "$TARGET_VSIX"

  log "running vsce publish"
  (cd "$EXTENSION_DIR" && npx vsce publish --allow-missing-repository --no-dependencies)

  if [[ -f "$SOURCE_VSIX" ]]; then
    mv "$SOURCE_VSIX" "$TARGET_VSIX"
    log "archived -> $TARGET_VSIX"
  else
    log "no VSIX archive was left behind by vsce publish"
  fi
}

log "root=$ROOT_DIR"
log "extension=$EXTENSION_DIR"
log "release=$TARGET_VSIX"

build_extension

if [[ "$BUILD_ONLY" -eq 0 ]]; then
  if [[ -z "$ACTION" ]]; then
    echo
    echo "Select build mode:"
    echo "  1) 일반 빌드     (vsce package)"
    echo "  2) 업로드 빌드   (vsce publish)"
    read -r -p "Choice [1-2]: " choice
    case "$choice" in
      1) ACTION="package" ;;
      2) ACTION="publish" ;;
      *) die "Invalid choice: $choice" ;;
    esac
  fi

  case "$ACTION" in
    package) package_extension ;;
    publish) publish_extension ;;
    *) die "Unknown action: $ACTION" ;;
  esac
fi
