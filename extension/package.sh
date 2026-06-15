#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXTENSION_DIR="$ROOT_DIR/extension"
EXTENSION_NAME="$(node -p "require('./extension/package.json').name" 2>/dev/null)"
EXTENSION_VERSION="$(node -p "require('./extension/package.json').version" 2>/dev/null)"
OUTPUT_VSIX="$EXTENSION_DIR/${EXTENSION_NAME}-${EXTENSION_VERSION}.vsix"

cd "$ROOT_DIR"
npm run compile

cd "$EXTENSION_DIR"
npx vsce package --allow-missing-repository --no-dependencies

echo "Packaged extension: $OUTPUT_VSIX"
