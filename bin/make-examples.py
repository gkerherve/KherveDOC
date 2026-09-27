#!/usr/bin/env python3
"""Make the Examples folder: documents, spreadsheets and slides, as .kdoc
files in src/backend/core/examples/ (added to users' documents by the
server, and copied to ~/Documents/KherveDOC/Examples by the desktop app).

Needs:
- the development stack running (make run): documents are turned into the
  editor's format by the y-provider's converter (localhost:4444);
- KherveSheet's Python environment (NumPy, pycrdt): every spreadsheet
  formula is checked with KherveSheet's engine.

    ~/Documents/PycharmProjects/KherveSheet/.venv/bin/python bin/make-examples.py
"""

import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "examples"))

import docs  # noqa: E402
import sheets  # noqa: E402
import slides  # noqa: E402
from common import OUT  # noqa: E402

if __name__ == "__main__":
    if OUT.exists():
        shutil.rmtree(OUT)
    print("Documents");     docs.build()      # noqa: E702
    print("Spreadsheets");  sheets.build()    # noqa: E702
    print("Slides");        slides.build()    # noqa: E702
    print(f"→ {OUT}")
