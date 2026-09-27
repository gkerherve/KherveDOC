"""Certificates for https downloads (Pyodide, a Sovereign Office server).

Python from python.org, and the app built from it, may have no CA bundle:
every https connection then fails ("certificate verify failed"). Point
Python at certifi's bundle when the system one is missing.
"""

from __future__ import annotations

import os
import ssl


def ensure_ca_bundle() -> None:
    if os.environ.get("SSL_CERT_FILE"):
        return
    paths = ssl.get_default_verify_paths()
    if (paths.cafile and os.path.exists(paths.cafile)) or (
            paths.capath and os.path.isdir(paths.capath)
            and os.listdir(paths.capath)):
        return
    try:
        import certifi
    except ImportError:
        return
    os.environ["SSL_CERT_FILE"] = certifi.where()
