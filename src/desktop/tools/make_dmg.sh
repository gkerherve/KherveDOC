#!/usr/bin/env bash
#
# Wrap dist/KherveDOC.app into a distributable .dmg (as KherveSheet does).
# Usage:  tools/make_dmg.sh [output-dir]        # default: installer/
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="$ROOT/dist/KherveDOC.app"
OUT_DIR="${1:-$ROOT/installer}"
STAGE="$ROOT/build/dmg"

if [[ ! -d "$APP" ]]; then
  echo "make_dmg.sh: $APP not found — run pyinstaller KherveDOC.spec first" >&2
  exit 1
fi

VERSION="$(cd "$ROOT" && .venv/bin/python -c 'from khervedoc_desktop import __version__; print(__version__)' 2>/dev/null || echo 0.1.0)"
ARCH="$(uname -m)"
DMG="$OUT_DIR/KherveDOC-${VERSION%%+*}-${ARCH}.dmg"

# Ad-hoc signature: Apple Silicon refuses unsigned code. Not notarization.
echo "==> ad-hoc signing $APP"
codesign --force --deep --sign - --timestamp=none "$APP"
codesign --verify --deep --strict "$APP"

echo "==> staging"
rm -rf "$STAGE"
mkdir -p "$STAGE" "$OUT_DIR"
cp -R "$APP" "$STAGE/"
ln -s /Applications "$STAGE/Applications"

echo "==> building $DMG"
rm -f "$DMG"
hdiutil create -volname "KherveDOC" -srcfolder "$STAGE" -fs HFS+ \
  -format UDZO -imagekey zlib-level=9 -ov "$DMG"
rm -rf "$STAGE"
echo "==> done: $DMG"
ls -lh "$DMG"
