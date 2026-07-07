#!/usr/bin/env bash
# Pack the Chrome extension into a store-ready zip.
#
# Chrome Web Store requires the manifest.json at the ROOT of the
# uploaded zip — not inside a wrapping folder. That's what this
# script produces, using the same layout as npm run zip:extension
# but writing a versioned filename to docs/store-listing/zips/
# instead of overwriting public/chrome-extension.zip.
#
# Usage:  npm run pack:store
# Output: docs/store-listing/zips/shipbots-cs-vX.Y.Z.zip
#
# The Chrome Web Store lets you upload a fresh zip whenever you
# bump the manifest version; teammates auto-update within ~5 hours
# with no action on their end.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MANIFEST="$ROOT/chrome-extension/manifest.json"
OUT_DIR="$ROOT/docs/store-listing/zips"

if [[ ! -f "$MANIFEST" ]]; then
  echo "pack-store: manifest not found at $MANIFEST" >&2
  exit 1
fi

VERSION="$(node -p "require('$MANIFEST').version")"
OUT_FILE="$OUT_DIR/shipbots-cs-v${VERSION}.zip"

mkdir -p "$OUT_DIR"
rm -f "$OUT_FILE"

(
  cd "$ROOT/chrome-extension"
  zip -qr "$OUT_FILE" . -x '*.DS_Store'
)

echo "Packed v${VERSION} → ${OUT_FILE#$ROOT/}"
