#!/bin/sh
# Build the KherveDOC web app for the standalone desktop app and copy it to
# src/desktop/web (bundled by PyInstaller; see src/desktop/KherveDOC.spec).
#
# The build talks to the server it is loaded from (the app's own local
# server), has no service worker, and includes PDF / Word / ODT export.
# It runs in the frontend-development container (make run first).
#   bin/build-desktop-web.sh [--no-build]   # --no-build: only copy out/
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/src/frontend/apps/impress"
DEST="$ROOT/src/desktop/web"
if [ "$1" != "--no-build" ]; then
  docker compose -f "$ROOT/compose.yml" exec -T -w /home/frontend/apps/impress \
    -e NEXT_PUBLIC_API_ORIGIN= -e NEXT_PUBLIC_SW_DEACTIVATED=true \
    -e NEXT_PUBLIC_PUBLISH_AS_MIT=false frontend-development sh -c \
    'node scripts/prebuild.mjs && NODE_OPTIONS=--max-old-space-size=6144 npx next build --webpack && node scripts/postbuild.mjs'
fi
[ -f "$APP/out/index.html" ] || { echo "No build in $APP/out" >&2; exit 1; }
rm -rf "$DEST"
cp -R "$APP/out" "$DEST"
VERSION=$(node -p "require('$APP/package.json').version" 2>/dev/null \
  || python3 -c "import json;print(json.load(open('$APP/package.json'))['version'])")
printf '{"version": "%s"}\n' "$VERSION" > "$DEST/kherve-web.json"
echo "KherveDOC web $VERSION → $DEST ($(du -sh "$DEST" | cut -f1))"
