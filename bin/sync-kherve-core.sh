#!/bin/sh
# Copy KherveSheet's calculation engine (khervesheet/core, no Qt) into the
# frontend, where KherveCELL runs it in the browser with Pyodide.
#   bin/sync-kherve-core.sh [path to the KherveSheet repo]
set -e
SRC="${1:-$(dirname "$0")/../../KherveSheet}"
DEST="$(dirname "$0")/../src/frontend/apps/impress/public/kherve-cell/python"
[ -d "$SRC/khervesheet/core" ] || { echo "No khervesheet/core in $SRC" >&2; exit 1; }
rm -rf "$DEST/khervesheet"
mkdir -p "$DEST/khervesheet/core"
cp "$SRC"/khervesheet/core/*.py "$DEST/khervesheet/core/"
# The desktop package's __init__ reads its version from git; not needed here.
cat > "$DEST/khervesheet/__init__.py" <<'PY'
"""KherveSheet's calculation core, as used by KherveCELL (see core/)."""
PY
REV=$(git -C "$SRC" rev-parse --short HEAD 2>/dev/null || echo unknown)
BRANCH=$(git -C "$SRC" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)
FILES=$(cd "$DEST" && find khervesheet kherve_bridge.py -name '*.py' | sort | sed 's/.*/"&"/' | paste -sd, -)
printf '{"khervesheet": "%s", "branch": "%s", "files": [%s]}\n' "$REV" "$BRANCH" "$FILES" > "$DEST/manifest.json"
echo "KherveSheet core $REV ($BRANCH) → $DEST"
