#!/bin/sh
# Build a Sovereign Office desktop release on this Mac: SovOffice-<version>-<arch>.dmg
# in src/desktop/installer. The version is 0.2.<commits>+<sha>, like
# KherveSheet's; publish the .dmg on github.com/gkerherve/Kherve-Downloads
# as a release tagged sovoffice-v<version> for the app's auto-update.
#
#   bin/build-desktop-release.sh [--skip-web]   # --skip-web: reuse src/desktop/web
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DESK="$ROOT/src/desktop"
COUNT=$(git -C "$ROOT" rev-list --count HEAD)
SHA=$(git -C "$ROOT" rev-parse --short HEAD)
VERSION="0.2.$COUNT+$SHA"
printf 'VERSION = "%s"\n' "$VERSION" > "$DESK/sovoffice_desktop/_version.py"
echo "==> Sovereign Office $VERSION"
[ "$1" = "--skip-web" ] || "$ROOT/bin/build-desktop-web.sh"
"$DESK/.venv/bin/python" "$ROOT/bin/fetch-desktop-pyodide.py"
(cd "$DESK" && .venv/bin/python -m PyInstaller SovOffice.spec --noconfirm)
"$DESK/tools/make_dmg.sh"
echo "==> release tag: sovoffice-v${VERSION%%+*}"
