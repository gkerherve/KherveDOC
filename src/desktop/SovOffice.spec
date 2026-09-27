# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for the Sovereign Office desktop app (one-folder build).

Build command (from src/desktop):
    pyinstaller SovOffice.spec --noconfirm

Output: dist/SovOffice/ on Windows, dist/SovOffice.app on macOS.

Build the web app first (from the repository root, with ``make run`` up):
    bin/build-desktop-web.sh
It lands in src/desktop/web, which is bundled so the app works on its own.
"""

import sys
from pathlib import Path

ROOT = Path(SPECPATH)
sys.path.insert(0, str(ROOT))

from sovoffice_desktop import __version__

PKG = ROOT / "sovoffice_desktop"

# One file type per kind of document (and .kdoc, from KherveDOC).
DOC_TYPES = [("sdoc", "document"), ("ssheet", "spreadsheet"),
             ("sslides", "presentation"), ("snote", "note"), ("schat", "chat"),
             ("smeet", "meeting"), ("kdoc", "document (KherveDOC)")]
WEB = ROOT / "web"
if not (WEB / "index.html").is_file():
    raise SystemExit("No web app in src/desktop/web: run bin/build-desktop-web.sh")

a = Analysis(
    [str(ROOT / "SovOffice.py")],
    pathex=[str(ROOT)],
    datas=[
        (str(PKG / "icon.png"), "sovoffice_desktop"),
        (str(PKG / "local" / "config_template.json"), "sovoffice_desktop/local"),
        (str(WEB), "web"),
        # Documents, spreadsheets and slides to learn from (bin/make-examples.py).
        (str(ROOT.parent / "backend" / "core" / "examples"), "examples"),
        # Spreadsheets offline from the first launch (bin/fetch-desktop-pyodide.py).
        *([(str(ROOT / "pyodide"), "pyodide")]
          if (ROOT / "pyodide" / "pyodide.js").is_file() else []),
    ],
    hiddenimports=["pycrdt", "aiohttp", "certifi"],
    excludes=["PyQt5", "PyQt6", "tkinter", "test", "pip", "setuptools"],
)

# The QtWebEngine hook drags in every QML module; drop the Qt families this app
# never loads (roughly halves the bundle).
UNUSED_QT = (
    "Qt3D", "QtBluetooth", "QtCharts", "QtDataVisualization", "QtDesigner",
    "QtGraphs", "QtGrpc", "QtHelp", "QtHttpServer", "QtLabs", "QtLocation",
    "QtMultimedia", "QtNfc", "QtProtobuf", "QtQuick3D", "QtQuickTest",
    "QtQuickTimeline", "QtRemoteObjects", "QtScxml", "QtSensors", "QtSerial",
    "QtShaderTools", "QtSpatialAudio", "QtSql", "QtStateMachine", "QtTest",
    "QtTextToSpeech", "QtUiTools", "QtVirtualKeyboard", "QtWebView",
)


def _used(entry):
    return not any(part.startswith(UNUSED_QT) for part in Path(entry[0]).parts)


a.binaries = [b for b in a.binaries if _used(b)]
a.datas = [d for d in a.datas if _used(d)]

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="SovOffice",
    console=False,
    upx=False,
    icon=str(PKG / ("icon.icns" if sys.platform == "darwin" else "icon.ico")),
)

coll = COLLECT(exe, a.binaries, a.datas, upx=False, name="SovOffice")

if sys.platform == "darwin":
    app = BUNDLE(
        coll,
        name="SovOffice.app",
        icon=str(PKG / "icon.icns"),
        bundle_identifier="eu.sovoffice.app",
        version=__version__,
        info_plist={
            "CFBundleName": "Sovereign Office",
            "CFBundleDisplayName": "Sovereign Office",
            "CFBundleShortVersionString": __version__,
            "NSHighResolutionCapable": True,
            "LSApplicationCategoryType": "public.app-category.productivity",
            # Lets the app reach an http:// server such as the local Docker setup.
            "NSAppTransportSecurity": {"NSAllowsArbitraryLoads": True},
            # Documents open in Sovereign Office (double-click in Finder).
            "CFBundleDocumentTypes": [{
                "CFBundleTypeName": f"Sovereign Office {name}",
                "CFBundleTypeRole": "Editor",
                "LSHandlerRank": "Owner",
                "LSItemContentTypes": [f"eu.sovoffice.app.{ext}"],
                "CFBundleTypeIconFile": "icon.icns",
            } for ext, name in DOC_TYPES],
            "UTExportedTypeDeclarations": [{
                "UTTypeIdentifier": f"eu.sovoffice.app.{ext}",
                "UTTypeDescription": f"Sovereign Office {name}",
                "UTTypeConformsTo": ["public.data", "public.zip-archive"],
                "UTTypeTagSpecification": {"public.filename-extension": [ext]},
            } for ext, name in DOC_TYPES],
        },
    )
