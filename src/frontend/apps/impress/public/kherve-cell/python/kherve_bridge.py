"""KherveCELL ↔ KherveSheet engine: JSON in, JSON out, for the web worker.

Sheets are identified by the ids of the shared document; formulas use the
sheet *names*, which the engine knows.

Copyright (C) 2026 Gwilherm Kerherve

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.
"""

import json

from khervesheet.core.engine import Workbook

_wb = Workbook()
_names = {}  # sheet id → name


def _sheet(sheet_id):
    return _wb.sheet_by_name(_names[sheet_id])


def _ids_by_name():
    return {name.lower(): sid for sid, name in _names.items()}


def _changes(changes):
    ids = _ids_by_name()
    return [[ids.get(name.lower()), r, c, text] for name, r, c, text in changes]


def _texts(sheet):
    return [[r, c, t] for (r, c), t in sheet.texts.items()]


def reset(payload):
    """Start over from the shared document: sheets and cell sources.

    payload: {"sheets": [{"id", "name", "cells": [[r, c, source]…],
                          "formats": [[r, c, number_format]…]}…]}"""
    global _wb
    data = json.loads(payload)
    _wb = Workbook()
    _names.clear()
    cells = {}
    for s in data["sheets"]:
        _names[s["id"]] = s["name"]
        _wb.add_sheet(s["name"])
        cells[s["name"]] = {(r, c): src for r, c, src in s.get("cells", [])}
        sheet = _wb.sheet_by_name(s["name"])
        for r, c, fmt in s.get("formats", []):
            sheet.cell_formats[(r, c)] = fmt
    # Type every cell in, values first, so each shows exactly what typing
    # it on the desktop shows (formats and all).
    for name, sheet_cells in cells.items():
        sheet = _wb.sheet_by_name(name)
        ordered = sorted(sheet_cells.items(),
                         key=lambda kv: str(kv[1]).startswith("="))
        for (r, c), src in ordered:
            sheet._type(r, c, src)
    # Then settle every formula in dependency order.
    for sheet in _wb.sheets:
        sheet._recalc_from_seeds(list(sheet.sources))
    _wb.refresh_cross_sheet()
    return json.dumps({sid: _texts(_sheet(sid)) for sid in _names})


def set_cells(payload):
    """payload: {"edits": [[sheet id, r, c, source]…]} → changed texts."""
    edits = json.loads(payload)["edits"]
    with _wb._collect() as changes:
        for sid, r, c, src in edits:
            sheet = _sheet(sid)
            sheet._type(r, c, src or "")
            sheet._recalc_from_seeds([(r, c)])
        _wb.refresh_cross_sheet()
    out = _changes(changes)
    return json.dumps(out)


def set_formats(payload):
    """payload: {"formats": [[sheet id, r, c, number_format or null]…]}."""
    items = json.loads(payload)["formats"]
    with _wb._collect() as changes:
        for sid, r, c, fmt in items:
            _sheet(sid).set_number_format(r, c, fmt)
    return json.dumps(_changes(changes))


def add_sheet(payload):
    data = json.loads(payload)
    _names[data["id"]] = data["name"]
    _wb.add_sheet(data["name"])
    with _wb._collect() as changes:
        _wb.refresh_cross_sheet()
    return json.dumps(_changes(changes))


def rename_sheet(payload):
    data = json.loads(payload)
    old = _names[data["id"]]
    _names[data["id"]] = data["name"]
    return json.dumps(_changes(_wb.rename_sheet(old, data["name"])))


def remove_sheet(payload):
    data = json.loads(payload)
    name = _names.pop(data["id"])
    return json.dumps(_changes(_wb.remove_sheet(name)))
