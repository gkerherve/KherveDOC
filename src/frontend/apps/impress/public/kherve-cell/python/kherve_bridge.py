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
from khervesheet.core.python import PythonRuntime

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
                          "formats": [[r, c, number_format]…]}…],
              "trusted": [hash of each =PY source the user lets run]}"""
    global _wb
    data = json.loads(payload)
    old = _wb
    _wb = Workbook()
    # Python keeps its namespace; only trusted code runs.
    _wb.python = old.python or PythonRuntime()
    _wb.trusted = set(data.get("trusted") or [])
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


def render_chart(payload):
    """payload: {"sheetId", "spec"} → {"svg", "fits"} or {"error"}.

    Ranges without a sheet name are on the chart's own sheet; "fits" holds
    what each trendline's fit found (equation, parameters, R²…)."""
    from khervesheet.core.charts import render_chart as render

    data = json.loads(payload)
    name = _names.get(data.get("sheetId"))

    def read(ref):
        return _wb.range_values(ref, name)

    try:
        return json.dumps(render(data["spec"], read))
    except Exception as exc:  # a bad range, a matplotlib error…
        return json.dumps({"error": str(exc)})


def solve(payload):
    """Run the Solver on a sheet without changing it.

    payload: {"sheetId", "objective": "B5", "variables": "A1:A3,C1",
              "goal": "min" | "max" | "value", "target": "12" or "D1",
              "constraints": [{"cell": "A1", "op": "<=", "value": "5"}…],
              "nonNegative", "method", "keepSearching", "seconds"}
    → {"solved", "cancelled", "message", "objective": value,
       "variables": [[r, c, source]…]} or {"error"}.

    The engine is put back as it was; the caller writes the solution into
    the shared workbook, so everyone gets it (and it can be undone)."""
    import time

    from khervesheet.core import solver

    data = json.loads(payload)
    sheet = _sheet(data["sheetId"])

    def number(text, what):
        text = str(text if text is not None else "").strip()
        rc = solver.parse_ref(text)
        if rc is not None:
            v = solver.EngineHost(sheet).value(rc)
            if v is None:
                raise ValueError(f"{what}: {text} does not hold a number.")
            return v
        try:
            return float(text)
        except ValueError:
            raise ValueError(f"{what}: {text or '(empty)'} is not a number "
                             "or a cell.") from None

    try:
        objective = solver.parse_ref(data.get("objective", ""))
        if objective is None:
            raise ValueError("Choose the objective cell (e.g. B10).")
        variables = list(dict.fromkeys(
            solver.parse_range(data.get("variables", ""))))
        if not variables:
            raise ValueError("Choose the variable cells (e.g. A1:A3).")
        goal = data.get("goal") or "min"
        target = number(data.get("target"), "Target") \
            if goal == "value" else 0.0
        constraints = []
        for con in data.get("constraints") or []:
            cell = solver.parse_ref(con.get("cell", ""))
            if cell is None or con.get("op") not in solver.OPERATORS:
                raise ValueError(f"Constraint {con.get('cell')!r} "
                                 f"{con.get('op')} {con.get('value')!r} "
                                 "is not valid.")
            constraints.append(solver.Constraint(
                cell, con["op"], number(con.get("value"), "Constraint")))
        problem = solver.Problem(
            objective=objective, variables=variables, goal=goal,
            target=target, constraints=constraints,
            non_negative=bool(data.get("nonNegative")),
            method=data.get("method") or "GRG Nonlinear",
            keep_searching=bool(data.get("keepSearching")))
    except ValueError as exc:
        return json.dumps({"error": str(exc)})

    # The browser cannot press Stop inside the engine: a time limit does.
    deadline = time.monotonic() + float(data.get("seconds") or 30)

    def pump():
        if time.monotonic() > deadline:
            raise solver.Cancelled

    host = solver.EngineHost(sheet)
    original = {rc: sheet.source(*rc) for rc in variables}
    try:
        outcome = solver.solve(host, problem, pump)
        value = None
        if outcome.x is not None:
            host.try_values(variables, outcome.x)
            value = host.value(objective)
    except Exception as exc:  # a formula error, scipy giving up…
        outcome, value = None, None
        error = str(exc)
    finally:
        for (r, c), src in original.items():
            sheet._type(r, c, src)
        sheet._recalc_from_seeds(variables)
        _wb.refresh_cross_sheet()
    if outcome is None:
        return json.dumps({"error": f"The Solver failed: {error}"})
    if outcome.x is None:
        return json.dumps({"solved": False, "cancelled": outcome.cancelled,
                           "message": outcome.message})
    return json.dumps({
        "solved": outcome.success,
        "cancelled": outcome.cancelled,
        "message": outcome.message,
        "objective": value,
        "variables": [[r, c, f"{x:.15g}"]
                      for (r, c), x in zip(variables, outcome.x)],
    })


def set_trusted(payload):
    """payload: {"trusted": [hashes]} — run the =PY cells now trusted."""
    data = json.loads(payload)
    _wb.python = _wb.python or PythonRuntime()
    return json.dumps(_changes(_wb.enable_python(
        trusted=set(data.get("trusted") or []))))


def python_outputs(payload):
    """What =PY cells produced besides their text, by sheet id:
    {id: {"figures": [[r, c, svg]…], "errors": [[r, c, traceback]…],
          "stdout": [[r, c, text]…]}} (sheets without any are left out)."""
    out = {}
    for sid in _names:
        sheet = _sheet(sid)
        if not (sheet.py_figures or sheet.py_errors or sheet.py_stdout):
            continue
        out[sid] = {
            "figures": [[r, c, svg] for (r, c), svg in sheet.py_figures.items()],
            "errors": [[r, c, e] for (r, c), e in sheet.py_errors.items()],
            "stdout": [[r, c, t] for (r, c), t in sheet.py_stdout.items()],
        }
    return json.dumps(out)


def read_xlsx(payload):
    """payload: {"data": base64 of an .xlsx file} → the shared layout (see
    khervesheet.core.xlsx.read_xlsx) or {"error"}."""
    import base64

    from khervesheet.core.xlsx import read_xlsx as read

    try:
        return json.dumps(read(base64.b64decode(json.loads(payload)["data"])))
    except Exception as exc:  # not an Excel file, a damaged one…
        return json.dumps({"error": f"This file could not be read: {exc}"})


def write_xlsx(payload):
    """payload: {"sheets": {sheet id: {"formats", "widths", "freezeRows",
    "freezeCols"}}, "charts": [spec…]} → {"data": base64 of the .xlsx}."""
    import base64

    from khervesheet.core.xlsx import write_xlsx as write

    data = json.loads(payload)
    layout = {
        "sheets": {_names[sid]: extra
                   for sid, extra in (data.get("sheets") or {}).items()
                   if sid in _names},
        "charts": [dict(spec, sheet=_names.get(spec.get("sheetId"), ""))
                   for spec in data.get("charts") or []],
    }
    return json.dumps({"data": base64.b64encode(write(_wb, layout)).decode()})
