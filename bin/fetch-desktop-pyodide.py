#!/usr/bin/env python3
"""Gather the Pyodide files KherveCELL (spreadsheets) needs, so the desktop
app works offline from its first launch; they land in src/desktop/pyodide
and PyInstaller bundles them (see src/desktop/KherveDOC.spec).

- Pyodide itself and the packages the engine loads (numpy, scipy,
  matplotlib and their dependencies, micropip), from the Pyodide CDN;
- the pure-Python PyPI packages the engine installs with micropip
  (openpyxl for Excel files, lmfit for peak fitting), listed in
  pypi.json for the engine.

    python3 bin/fetch-desktop-pyodide.py
"""
import json
import subprocess
import sys
import urllib.request
from pathlib import Path

CDN = "https://cdn.jsdelivr.net/pyodide/v0.28.3/full/"
DEST = Path(__file__).resolve().parent.parent / "src" / "desktop" / "pyodide"
CORE = ["pyodide.js", "pyodide.asm.js", "pyodide.asm.wasm",
        "python_stdlib.zip", "pyodide-lock.json"]
PACKAGES = ["numpy", "scipy", "matplotlib", "micropip"]
#: micropip installs these from PyPI ("pypi:<name>" in the engine).
PYPI = {"openpyxl": ["openpyxl", "et_xmlfile"],
        "lmfit": ["lmfit", "asteval", "uncertainties", "dill"]}


def _context():
    import ssl
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


def fetch(name: str) -> None:
    target = DEST / name
    if target.exists():
        return
    print("↓", name)
    with urllib.request.urlopen(CDN + name, timeout=300,
                                context=_context()) as resp:
        target.write_bytes(resp.read())


def main() -> None:
    DEST.mkdir(parents=True, exist_ok=True)
    for name in CORE:
        fetch(name)
    lock = json.loads((DEST / "pyodide-lock.json").read_text())["packages"]
    wanted, todo = set(), list(PACKAGES)
    while todo:
        name = todo.pop()
        if name in wanted:
            continue
        wanted.add(name)
        todo.extend(lock[name].get("depends", []))
    for name in sorted(wanted):
        fetch(lock[name]["file_name"])
    wheels = DEST / "pypi"
    wheels.mkdir(exist_ok=True)
    manifest = {}
    for package, names in PYPI.items():
        subprocess.run([sys.executable, "-m", "pip", "download", "--quiet",
                        "--no-deps", "--only-binary=:all:", "--dest",
                        str(wheels), *names], check=True)
        files = []
        for name in names:
            found = sorted(wheels.glob(f"{name.replace('-', '_')}-*.whl"))
            if not found:
                sys.exit(f"No wheel for {name}")
            files.append("pypi/" + found[-1].name)
        manifest[package] = files
    (DEST / "pypi.json").write_text(json.dumps(manifest, indent=1))
    size = sum(f.stat().st_size for f in DEST.rglob("*") if f.is_file())
    print(f"Pyodide for KherveCELL → {DEST} ({size / 1e6:.0f} MB)")


if __name__ == "__main__":
    main()
