# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for the KherveDOC desktop app (one-folder build).

Build command (from src/desktop):
    pyinstaller KherveDOC.spec --noconfirm

Output: dist/KherveDOC/ on Windows, dist/KherveDOC.app on macOS.
"""

import sys
from pathlib import Path

ROOT = Path(SPECPATH)
sys.path.insert(0, str(ROOT))

from khervedoc_desktop import __version__

PKG = ROOT / "khervedoc_desktop"

a = Analysis(
    [str(ROOT / "KherveDOC.py")],
    pathex=[str(ROOT)],
    datas=[(str(PKG / "icon.png"), "khervedoc_desktop")],
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
    name="KherveDOC",
    console=False,
    upx=False,
    icon=str(PKG / ("icon.icns" if sys.platform == "darwin" else "icon.ico")),
)

coll = COLLECT(exe, a.binaries, a.datas, upx=False, name="KherveDOC")

if sys.platform == "darwin":
    app = BUNDLE(
        coll,
        name="KherveDOC.app",
        icon=str(PKG / "icon.icns"),
        bundle_identifier="com.kherve.khervedoc",
        version=__version__,
        info_plist={
            "CFBundleName": "KherveDOC",
            "CFBundleDisplayName": "KherveDOC",
            "CFBundleShortVersionString": __version__,
            "NSHighResolutionCapable": True,
            "LSApplicationCategoryType": "public.app-category.productivity",
            # Lets the app reach an http:// server such as the local Docker setup.
            "NSAppTransportSecurity": {"NSAllowsArbitraryLoads": True},
        },
    )
