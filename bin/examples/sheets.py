"""Example spreadsheets, in SOV Sheets's shared layout (see the web app's
kherve-cell/model/layout.ts): Yjs maps of JSON strings. Every formula is
checked with KherveSheet's own engine before the file is written."""

import hashlib
import json
import math
import os
import re
import sys
from pathlib import Path

from pycrdt import Doc, Map

from common import write_kdoc

KHERVESHEET = Path(os.environ.get(
    "KHERVESHEET_DIR", Path.home() / "Documents/PycharmProjects/KherveSheet"))

ALIGN = {"left": 0x81, "center": 0x84, "right": 0x82}
HEAD = {"bold": True, "bg": "#1d3f73", "font_color": "#ffffff"}
TITLE = {"bold": True, "font_size": 16, "font_color": "#1d3f73"}
NOTE = {"italic": True, "font_color": "#6b7080"}
TOTAL = {"bold": True, "bg": "#e8eef8"}
EURO = {"number_format": "Currency:€"}
PCT = {"number_format": "Percentage"}


def col_index(letters):
    n = 0
    for ch in letters.upper():
        n = n * 26 + ord(ch) - 64
    return n - 1


def parse_ref(ref):
    m = re.fullmatch(r"([A-Za-z]+)(\d+)", ref)
    return int(m.group(2)) - 1, col_index(m.group(1))


def cells_of(rng):
    a, _, b = rng.partition(":")
    r1, c1 = parse_ref(a)
    r2, c2 = parse_ref(b or a)
    for r in range(r1, r2 + 1):
        for c in range(c1, c2 + 1):
            yield r, c


class Sheet:
    def __init__(self, book, name, order):
        self.book = book
        self.name = name
        self.order = order
        self.id = hashlib.sha1(f"{book.title}/{name}".encode()).hexdigest()[:12]
        self.cells = {}
        self.formats = {}
        self.widths = {}
        self.freeze = (0, 0)

    def put(self, ref, *values, down=False):
        r, c = parse_ref(ref)
        for i, v in enumerate(values):
            if v is None:
                continue
            key = (r + i, c) if down else (r, c + i)
            self.cells[key] = v if isinstance(v, str) else repr(v) if isinstance(v, float) else str(v)
        return self

    def rows(self, ref, rows):
        r, c = parse_ref(ref)
        for i, row in enumerate(rows):
            for j, v in enumerate(row):
                if v is not None:
                    self.put(ref_of(r + i, c + j), v)
        return self

    def fmt(self, rng, **f):
        for key in cells_of(rng):
            self.formats[key] = {**self.formats.get(key, {}), **f}
        return self

    def width(self, **widths):
        for letters, px in widths.items():
            self.widths[col_index(letters)] = float(px)
        return self


def ref_of(r, c):
    name = ""
    n = c
    while True:
        name = chr(65 + n % 26) + name
        n = n // 26 - 1
        if n < 0:
            break
    return f"{name}{r + 1}"


class Book:
    def __init__(self, title):
        self.title = title
        self.sheets = []
        self.charts = []
        self.solver = {}

    def sheet(self, name):
        s = Sheet(self, name, len(self.sheets))
        self.sheets.append(s)
        return s

    def chart(self, sheet, at, **spec):
        r, c = parse_ref(at)
        spec.setdefault("width", 480)
        spec.setdefault("height", 300)
        spec.setdefault("legend", True)
        spec.setdefault("grid", True)
        self.charts.append({"sheetId": sheet.id, "row": r, "col": c, "dx": 0, "dy": 0, **spec})

    # ── Output ───────────────────────────────────────────────────────
    def check(self):
        """Evaluate with KherveSheet's engine: no formula may fail."""
        sys.path.insert(0, str(KHERVESHEET))
        from khervesheet.core.engine import Workbook  # noqa: PLC0415
        from khervesheet.core.python import is_python_source  # noqa: PLC0415

        wb = Workbook()
        for s in self.sheets:
            wb.add_sheet(s.name, 1000, 26)
        for s in self.sheets:
            sheet = wb.sheet_by_name(s.name)
            for (r, c), fmt in s.formats.items():
                if fmt.get("number_format"):
                    sheet.cell_formats[(r, c)] = fmt["number_format"]
            for (r, c), text in sorted(s.cells.items()):
                if not text.startswith("="):
                    sheet.set_cell(r, c, text)
        for s in self.sheets:
            sheet = wb.sheet_by_name(s.name)
            for (r, c), text in sorted(s.cells.items()):
                if text.startswith("=") and not is_python_source(text):
                    sheet.set_cell(r, c, text)
        wb.refresh_cross_sheet()
        bad = []
        for s in self.sheets:
            sheet = wb.sheet_by_name(s.name)
            for (r, c), text in s.cells.items():
                if text.startswith("=") and not is_python_source(text):
                    shown = sheet.text(r, c)
                    if shown.startswith("#") or not shown:
                        bad.append(f"{s.name}!{ref_of(r, c)} {text} → {shown!r}")
        if bad:
            raise SystemExit(f"{self.title}: formulas failing:\n  " + "\n  ".join(bad))
        return wb

    def ydoc(self) -> bytes:
        doc = Doc()
        sheets = doc.get("sheets", type=Map)
        cells = doc.get("cells", type=Map)
        formats = doc.get("formats", type=Map)
        widths = doc.get("widths", type=Map)
        charts = doc.get("charts", type=Map)
        solver = doc.get("solver", type=Map)
        with doc.transaction():
            for s in self.sheets:
                meta = {"name": s.name, "order": s.order, "rows": 1000, "cols": 26}
                if s.freeze[0]:
                    meta["freezeRows"] = s.freeze[0]
                if s.freeze[1]:
                    meta["freezeCols"] = s.freeze[1]
                sheets[s.id] = json.dumps(meta)
                for (r, c), text in s.cells.items():
                    cells[f"{s.id}|{r},{c}"] = text
                for (r, c), f in s.formats.items():
                    formats[f"{s.id}|{r},{c}"] = json.dumps(f)
                for c, px in s.widths.items():
                    widths[f"{s.id}|{c}"] = px
            for i, spec in enumerate(self.charts):
                charts[hashlib.sha1(f"{self.title}/chart{i}".encode()).hexdigest()[:12]] = json.dumps(spec)
            for sheet_id, model in self.solver.items():
                solver[sheet_id] = json.dumps(model)
        return doc.get_update()


# ── The workbooks ────────────────────────────────────────────────────
def budget():
    b = Book("Household budget")
    s = b.sheet("Budget")
    s.put("A1", "Household budget — monthly").fmt("A1", **TITLE)
    s.put("A2", "Type what you plan and what you spent: the differences, totals and chart follow.").fmt("A2", **NOTE)
    s.put("A4", "Category", "Planned", "Actual", "Difference", "Share of spending").fmt("A4:E4", **HEAD)
    items = [("Rent", 850, 850), ("Groceries", 400, 436), ("Electricity and gas", 120, 104),
             ("Internet and phone", 45, 45), ("Transport", 150, 172), ("Insurance", 60, 60),
             ("Leisure", 150, 198), ("Clothes", 80, 55), ("Savings", 300, 300), ("Other", 70, 42)]
    for i, (name, plan, actual) in enumerate(items):
        row = 5 + i
        s.put(f"A{row}", name, plan, actual, f"=B{row}-C{row}", f"=C{row}/$C$15")
    s.put("A15", "Total", "=SUM(B5:B14)", "=SUM(C5:C14)", "=SUM(D5:D14)", "=SUM(E5:E14)").fmt("A15:E15", **TOTAL)
    s.fmt("B5:D15", **EURO).fmt("E5:E15", **PCT)
    s.put("A17", "Monthly income", 2600).fmt("A17", bold=True).fmt("B17", **EURO)
    s.put("A18", "Left over", "=B17-C15").fmt("A18", bold=True).fmt("B18", **EURO, bold=True, font_color="#2d7a3a")
    s.put("A19", "Share of income spent", "=C15/B17").fmt("B19", **PCT)
    s.width(A=170, B=100, C=100, D=100, E=130)
    s.freeze = (4, 0)
    b.chart(s, "G4", type="Pie", title="Where the money goes", x="A5:A14",
            series=[{"ref": "C5:C14", "name": "Actual"}], width=460, height=340)
    b.chart(s, "G22", type="Bar", title="Planned and actual", x="A5:A14",
            series=[{"ref": "B5:B14", "name": "Planned"}, {"ref": "C5:C14", "name": "Actual"}],
            width=560, height=300)
    return b


def loan():
    b = Book("Loan calculator")
    s = b.sheet("Loan")
    s.put("A1", "Loan calculator").fmt("A1", **TITLE)
    s.put("A2", "Change the blue cells: the payment and the schedule follow.").fmt("A2", **NOTE)
    s.put("A4", "Amount borrowed", 180000).fmt("B4", **EURO, bg="#e3f0ff")
    s.put("A5", "Yearly interest rate", 0.032).fmt("B5", **PCT, bg="#e3f0ff")
    s.put("A6", "Years", 20).fmt("B6", bg="#e3f0ff")
    s.put("A8", "Monthly payment", "=PMT(B5/12,B6*12,-B4)").fmt("A8:B8", bold=True).fmt("B8", **EURO)
    s.put("A9", "Number of payments", "=B6*12")
    s.put("A10", "Total paid", "=B8*B9").fmt("B10", **EURO)
    s.put("A11", "Total interest", "=B10-B4").fmt("B11", **EURO, font_color="#b23a48")
    s.width(A=180, B=120)
    t = b.sheet("Schedule")
    t.put("A1", "Month", "Payment", "Interest", "Principal", "Balance").fmt("A1:E1", **HEAD)
    t.put("A2", 1, "=Loan!B8", "=Loan!B4*Loan!B5/12", "=B2-C2", "=Loan!B4-D2")
    for row in range(3, 3 + 59):
        t.put(f"A{row}", f"=A{row - 1}+1", "=Loan!B8", f"=E{row - 1}*Loan!B5/12",
              f"=B{row}-C{row}", f"=E{row - 1}-D{row}")
    t.fmt("B2:E61", **EURO)
    t.width(A=70, B=100, C=100, D=100, E=120)
    t.freeze = (1, 0)
    b.chart(t, "G2", type="Line", title="Balance over the first five years", x="A2:A61",
            series=[{"ref": "E2:E61", "name": "Balance"}], xLabel="Month", yLabel="€")
    b.chart(t, "G20", type="Line", title="Interest and principal in each payment", x="A2:A61",
            series=[{"ref": "C2:C61", "name": "Interest"}, {"ref": "D2:D61", "name": "Principal"}],
            xLabel="Month")
    return b


def grades():
    b = Book("Grade book")
    s = b.sheet("Grades")
    s.put("A1", "Grade book — class 3B (marks out of 20)").fmt("A1", **TITLE)
    s.put("A3", "Student", "Test 1", "Test 2", "Test 3", "Exam", "Final mark", "Result").fmt("A3:G3", **HEAD)
    students = [("Alice", 14, 16, 15, 17), ("Baptiste", 9, 11, 8, 10), ("Camille", 18, 17, 19, 18),
                ("Dylan", 12, 10, 13, 11), ("Emma", 15, 14, 16, 13), ("Félix", 7, 9, 10, 8),
                ("Gaëlle", 16, 18, 17, 19), ("Hugo", 11, 13, 12, 14), ("Inès", 13, 12, 14, 15),
                ("Jules", 10, 8, 9, 12)]
    for i, (name, *marks) in enumerate(students):
        row = 4 + i
        s.put(f"A{row}", name, *marks,
              f"=ROUND(AVERAGE(B{row}:D{row})*0.4+E{row}*0.6,1)",
              f'=IF(F{row}>=10,"Pass","Resit")')
    s.fmt("F4:F13", bold=True)
    s.put("A15", "Class average", "=AVERAGE(B4:B13)", "=AVERAGE(C4:C13)", "=AVERAGE(D4:D13)",
          "=AVERAGE(E4:E13)", "=AVERAGE(F4:F13)").fmt("A15:G15", **TOTAL)
    s.put("A16", "Highest", "=MAX(B4:B13)", "=MAX(C4:C13)", "=MAX(D4:D13)", "=MAX(E4:E13)", "=MAX(F4:F13)")
    s.put("A17", "Lowest", "=MIN(B4:B13)", "=MIN(C4:C13)", "=MIN(D4:D13)", "=MIN(E4:E13)", "=MIN(F4:F13)")
    s.put("A18", "Spread (std. dev.)", "=STDEV(B4:B13)", "=STDEV(C4:C13)", "=STDEV(D4:D13)",
          "=STDEV(E4:E13)", "=STDEV(F4:F13)")
    s.fmt("B15:F18", number_format="0.0")
    s.put("A20", "Passed", '=COUNTIF(G4:G13,"Pass")').fmt("A20", bold=True)
    s.put("A21", "To resit", '=COUNTIF(G4:G13,"Resit")').fmt("A21", bold=True)
    s.width(A=150, G=80)
    s.freeze = (3, 1)
    b.chart(s, "I3", type="Bar", title="Final marks", x="A4:A13",
            series=[{"ref": "F4:F13", "name": "Final mark"}], yLabel="/20")
    return b


def sales():
    b = Book("Sales dashboard")
    s = b.sheet("Sales")
    s.put("A1", "Sales by region — 2026 (thousands of €)").fmt("A1", **TITLE)
    s.put("A3", "Month", "North", "South", "East", "West", "Total", "Growth").fmt("A3:G3", **HEAD)
    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    for i, month in enumerate(months):
        row = 4 + i
        wave = math.sin(i / 11 * math.pi)
        vals = [round(42 + 9 * wave + i * 1.1, 1), round(55 + 14 * wave + i * 0.6, 1),
                round(31 + 5 * wave + i * 1.6, 1), round(38 + 8 * math.cos(i / 3) + i, 1)]
        s.put(f"A{row}", month, *vals, f"=SUM(B{row}:E{row})",
              f"=(F{row}-F{row - 1})/F{row - 1}" if i else None)
    s.put("A16", "Year", "=SUM(B4:B15)", "=SUM(C4:C15)", "=SUM(D4:D15)", "=SUM(E4:E15)",
          "=SUM(F4:F15)").fmt("A16:G16", **TOTAL)
    s.put("A17", "Best month", "=MAX(B4:B15)", "=MAX(C4:C15)", "=MAX(D4:D15)", "=MAX(E4:E15)", "=MAX(F4:F15)")
    s.put("A18", "Share of year", "=B16/$F$16", "=C16/$F$16", "=D16/$F$16", "=E16/$F$16").fmt("B18:E18", **PCT)
    s.fmt("B4:F17", number_format="0.0").fmt("G5:G15", **PCT)
    s.freeze = (3, 1)
    b.chart(s, "I3", type="Line+Symbol", title="Monthly sales by region", x="A4:A15",
            series=[{"ref": "B4:B15", "name": "North"}, {"ref": "C4:C15", "name": "South"},
                    {"ref": "D4:D15", "name": "East"}, {"ref": "E4:E15", "name": "West"}],
            yLabel="k€", width=560)
    b.chart(s, "I21", type="Doughnut", title="Share of the year", x="B3:E3",
            series=[{"ref": "B16:E16", "name": "Year"}], width=400, height=300)
    return b


def invoice():
    b = Book("Invoice")
    s = b.sheet("Invoice")
    s.put("A1", "INVOICE").fmt("A1", bold=True, font_size=22, font_color="#1d3f73")
    s.put("A3", "Atelier Kerne — web design").fmt("A3", bold=True)
    s.put("A4", "8 quai de l'Odet, 29000 Quimper")
    s.put("A5", "SIRET 123 456 789 00012")
    s.put("E3", "Invoice no.", "2026-117").fmt("E3", bold=True)
    s.put("E4", "Date", "27/09/2026").fmt("E4", bold=True)
    s.put("E5", "Due", "27/10/2026").fmt("E5", bold=True)
    s.put("A7", "Bill to:").fmt("A7", bold=True)
    s.put("A8", "Café du Port, 2 place du Marché, 29900 Concarneau")
    s.put("A10", "Description", None, "Quantity", "Unit price", "Amount").fmt("A10:E10", **HEAD)
    lines = [("Website design (home + 5 pages)", 1, 1800), ("Photos of the menu", 12, 25),
             ("Online booking module", 1, 450), ("Hosting (12 months)", 12, 9.9),
             ("Training session (2 h)", 2, 60)]
    for i, (desc, qty, price) in enumerate(lines):
        row = 11 + i
        s.put(f"A{row}", desc, None, qty, price, f"=C{row}*D{row}")
    s.fmt("D11:E15", **EURO)
    s.put("D17", "Subtotal", "=SUM(E11:E15)").fmt("D17", bold=True)
    s.put("D18", "VAT 20 %", "=E17*0.2").fmt("D18", bold=True)
    s.put("D19", "Total due", "=E17+E18").fmt("D19:E19", **TOTAL, font_size=13)
    s.fmt("E17:E19", **EURO)
    s.put("A22", "Payment by bank transfer — IBAN FR76 0000 0000 0000 0000 0000 000").fmt("A22", **NOTE)
    s.put("A23", "Thank you for your business!").fmt("A23", italic=True)
    s.width(A=260, B=20, C=80, D=110, E=110)
    return b


def inventory():
    b = Book("Inventory")
    s = b.sheet("Stock")
    s.put("A1", "Shop inventory").fmt("A1", **TITLE)
    s.put("A3", "Code", "Item", "In stock", "Reorder at", "Unit cost", "Stock value", "Status").fmt("A3:G3", **HEAD)
    items = [("A-101", "Notebook A5", 140, 50, 2.4), ("A-102", "Notebook A4", 35, 40, 3.1),
             ("B-204", "Ballpoint pen (blue)", 520, 200, 0.35), ("B-205", "Ballpoint pen (black)", 180, 200, 0.35),
             ("C-310", "Stapler", 22, 10, 7.9), ("C-311", "Staples (box)", 64, 30, 1.2),
             ("D-420", "Sticky notes", 18, 40, 1.8), ("D-421", "Highlighters (4)", 75, 25, 4.5),
             ("E-530", "Ring binder", 41, 20, 3.6), ("E-531", "Document wallet", 9, 15, 0.9)]
    for i, (code, name, stock, level, cost) in enumerate(items):
        row = 4 + i
        s.put(f"A{row}", code, name, stock, level, cost, f"=C{row}*E{row}",
              f'=IF(C{row}<=D{row},"Reorder","OK")')
    s.fmt("E4:F13", **EURO)
    s.put("A15", "Total value", None, None, None, None, "=SUM(F4:F13)").fmt("A15:G15", **TOTAL).fmt("F15", **EURO)
    s.put("A16", "Items to reorder", None, None, None, None, '=COUNTIF(G4:G13,"Reorder")').fmt("A16", bold=True)
    s.put("I3", "Look up an item").fmt("I3", bold=True, font_size=13)
    s.put("I4", "Code", "B-204").fmt("J4", bg="#e3f0ff")
    s.put("I5", "Item", "=VLOOKUP(J4,A4:G13,2,0)")
    s.put("I6", "In stock", "=VLOOKUP(J4,A4:G13,3,0)")
    s.put("I7", "Status", "=VLOOKUP(J4,A4:G13,7,0)")
    s.width(A=70, B=180, F=110, I=80, J=150)
    s.freeze = (3, 0)
    b.chart(s, "I10", type="Bar", title="Stock against reorder level", x="B4:B13",
            series=[{"ref": "C4:C13", "name": "In stock"}, {"ref": "D4:D13", "name": "Reorder at"}],
            width=560)
    return b


def timesheet():
    b = Book("Time sheet")
    s = b.sheet("Week 40")
    s.put("A1", "Time sheet — week 40").fmt("A1", **TITLE)
    s.put("A2", "Hours are decimal: 8.5 = 8:30, 17.25 = 17:15.").fmt("A2", **NOTE)
    s.put("A4", "Day", "Start", "End", "Break (h)", "Hours", "Overtime").fmt("A4:F4", **HEAD)
    days = [("Monday", 8.5, 17.25, 0.75), ("Tuesday", 8.75, 18.0, 1.0), ("Wednesday", 9.0, 16.5, 0.5),
            ("Thursday", 8.5, 19.0, 1.0), ("Friday", 8.0, 15.5, 0.5)]
    for i, (day, start, end, pause) in enumerate(days):
        row = 5 + i
        s.put(f"A{row}", day, start, end, pause, f"=C{row}-B{row}-D{row}", f"=MAX(0,E{row}-7.5)")
    s.put("A10", "Total", None, None, None, "=SUM(E5:E9)", "=SUM(F5:F9)").fmt("A10:F10", **TOTAL)
    s.fmt("B5:F10", number_format="0.00")
    s.put("A12", "Hourly rate", 18).fmt("B12", **EURO, bg="#e3f0ff")
    s.put("A13", "Overtime bonus", 0.25).fmt("B13", **PCT, bg="#e3f0ff")
    s.put("A14", "Pay this week", "=E10*B12+F10*B12*B13").fmt("A14:B14", bold=True).fmt("B14", **EURO)
    s.width(A=120)
    b.chart(s, "H4", type="Bar", title="Hours worked", x="A5:A9",
            series=[{"ref": "E5:E9", "name": "Hours"}], yLabel="h")
    return b


def experiment():
    b = Book("Experiment with a trendline")
    s = b.sheet("Spring")
    s.put("A1", "Hooke's law: stretching a spring").fmt("A1", **TITLE)
    s.put("A2", "The chart fits a straight line (Linear trendline) and shows its equation and R².").fmt("A2", **NOTE)
    s.put("A4", "Mass (g)", "Force (N)", "Extension (cm)").fmt("A4:C4", **HEAD)
    noise = [0.12, -0.08, 0.05, -0.15, 0.1, 0.02, -0.06, 0.14, -0.1, 0.04, -0.03]
    for i in range(11):
        row = 5 + i
        mass = i * 50
        s.put(f"A{row}", mass, f"=A{row}/1000*9.81", round(mass * 0.0981 / 2.5 + noise[i], 2))
    s.fmt("B5:B15", number_format="0.000")
    s.put("E4", "Spring stiffness").fmt("E4", bold=True, font_size=13)
    s.put("E5", "Slope (cm per N)", "=SLOPE(C5:C15,B5:B15)")
    s.put("E6", "Intercept (cm)", "=INTERCEPT(C5:C15,B5:B15)")
    s.put("E7", "R²", "=RSQ(C5:C15,B5:B15)")
    s.put("E8", "Stiffness k (N/m)", "=100/F5").fmt("E8:F8", bold=True)
    s.fmt("F5:F8", number_format="0.000")
    s.width(A=90, B=90, C=110, E=150)
    b.chart(s, "E11", type="Scatter", title="Extension against force", x="B5:B15",
            series=[{"ref": "C5:C15", "name": "Measured"}], xLabel="Force (N)", yLabel="Extension (cm)",
            trendlines=[{"series": 0, "model": "Linear", "showEquation": True, "showR2": True}])
    c = b.sheet("Cooling")
    c.put("A1", "Newton's law of cooling: a cup of tea").fmt("A1", **TITLE)
    c.put("A2", "Fitted with the Exponential Decay trendline (see the Lab report document).").fmt("A2", **NOTE)
    c.put("A4", "Time (min)", "Temperature (°C)").fmt("A4:B4", **HEAD)
    wobble = [0.3, -0.2, 0.4, -0.3, 0.1, 0.2, -0.4, 0.3, -0.1, 0.2, -0.2, 0.1, 0.3, -0.3, 0.2, -0.1]
    for i in range(16):
        t_min = i * 2
        c.put(f"A{5 + i}", t_min, round(21 + 69 * math.exp(-0.05 * t_min) + wobble[i], 1))
    c.put("D4", "Room temperature", 21)
    c.put("D5", "Time to reach 60 °C (min)", "=LN((60-21)/(90-21))/-0.05").fmt("E5", number_format="0.0")
    c.width(A=90, B=130, D=190)
    b.chart(c, "D8", type="Scatter", title="Temperature of the tea", x="A5:A20",
            series=[{"ref": "B5:B20", "name": "Measured"}], xLabel="Time (min)", yLabel="°C",
            trendlines=[{"series": 0, "model": "Exponential Decay", "showEquation": True, "showR2": True}])
    return b


def spectrum():
    b = Book("Peak fitting")
    s = b.sheet("Spectrum")
    s.put("A1", "Absorption spectrum with a peak to fit").fmt("A1", **TITLE)
    s.put("A2", "The chart fits a Gaussian to the peak: centre, width and height appear with the equation.").fmt("A2", **NOTE)
    s.put("A4", "Wavelength (nm)", "Absorbance").fmt("A4:B4", **HEAD)
    for i in range(61):
        wl = 400 + i * 5
        peak = 0.82 * math.exp(-((wl - 540) ** 2) / (2 * 28 ** 2))
        wiggle = 0.012 * math.sin(i * 1.7) + 0.008 * math.cos(i * 2.9)
        s.put(f"A{5 + i}", wl, round(0.05 + peak + wiggle, 4))
    s.put("D4", "Highest absorbance", "=MAX(B5:B65)")
    s.put("D5", "At wavelength (nm)", "=INDEX(A5:A65,MATCH(E4,B5:B65,0))")
    s.width(A=130, B=100, D=160)
    b.chart(s, "D8", type="Line", title="Absorbance", x="A5:A65",
            series=[{"ref": "B5:B65", "name": "Sample"}], xLabel="Wavelength (nm)", yLabel="A",
            trendlines=[{"series": 0, "model": "Gaussian", "showEquation": True, "showR2": True}],
            width=560, height=340)
    return b


def python_cells():
    b = Book("Python cells")
    s = b.sheet("Python")
    s.put("A1", "Python cells: real Python in the sheet").fmt("A1", **TITLE)
    s.put("A2", "A cell starting with =PY holds a Python script; its last line is what the cell shows. "
          "Approve them once (the banner above the grid) to let them run.").fmt("A2", **NOTE)
    s.put("A4", "Numbers to work on").fmt("A4", bold=True)
    for i, v in enumerate([12, 15, 11, 19, 14, 17, 13, 16]):
        s.put(f"A{5 + i}", v)
    s.put("C4", "Mean and spread (NumPy)").fmt("C4", bold=True)
    s.put("C5", "=PY\nimport numpy as np\ndata = np.array(ks(\"A5:A12\"), dtype=float)\n"
          "[[\"mean\", data.mean()], [\"std\", data.std(ddof=1)], [\"max\", data.max()]]")
    s.put("F4", "A list spills down").fmt("F4", bold=True)
    s.put("F5", "=PY\n[n ** 2 for n in range(1, 9)]")
    s.put("H4", "A chart made with matplotlib").fmt("H4", bold=True)
    s.put("H5", "=PY\nimport numpy as np\nimport matplotlib.pyplot as plt\n"
          "x = np.linspace(0, 2 * np.pi, 200)\nfig, ax = plt.subplots(figsize=(4, 2.6))\n"
          "ax.plot(x, np.sin(x), label=\"sin\")\nax.plot(x, np.cos(x), label=\"cos\")\n"
          "ax.legend()\nax.grid(alpha=0.3)\nfig")
    s.put("A15", "Ordinary formulas still work next to them:").fmt("A15", **NOTE)
    s.put("A16", "Sum", "=SUM(A5:A12)")
    s.width(A=110, C=110, D=110, F=110)
    return b


def solver():
    b = Book("Solver — production plan")
    s = b.sheet("Plan")
    s.put("A1", "How many chairs and tables should the workshop make?").fmt("A1", **TITLE)
    s.put("A2", "Tools → Solver: it changes the yellow cells to make the profit as big as possible "
          "without using more wood or hours than there are.").fmt("A2", **NOTE)
    s.put("A4", "", "Chairs", "Tables").fmt("A4:C4", **HEAD)
    s.put("A5", "How many to make", 10, 5).fmt("B5:C5", bg="#fff4b3", bold=True)
    s.put("A6", "Profit each", 45, 110).fmt("B6:C6", **EURO)
    s.put("A7", "Wood each (kg)", 5, 15)
    s.put("A8", "Hours each", 3, 5)
    s.put("A10", "", "Used", "Available").fmt("A10:C10", **HEAD)
    s.put("A11", "Wood (kg)", "=SUMPRODUCT(B5:C5,B7:C7)", 450)
    s.put("A12", "Hours", "=SUMPRODUCT(B5:C5,B8:C8)", 210)
    s.put("A14", "Profit", "=SUMPRODUCT(B5:C5,B6:C6)").fmt("A14:B14", bold=True, font_size=13).fmt("B14", **EURO)
    s.put("A16", "Answer: 45 chairs and 15 tables (profit 3 675 €).").fmt("A16", **NOTE)
    s.width(A=150, B=100, C=100)
    b.solver[s.id] = {"objective": "B14", "goal": "max", "variables": "B5:C5",
                      "constraints": [{"cell": "B11", "op": "<=", "value": "C11"},
                                      {"cell": "B12", "op": "<=", "value": "C12"}],
                      "nonNegative": True, "method": "GRG Nonlinear", "keepSearching": False,
                      "seconds": 10}
    return b


def statistics():
    b = Book("Statistics")
    s = b.sheet("Heights")
    s.put("A1", "Heights of 30 students (cm)").fmt("A1", **TITLE)
    s.put("A3", "Height").fmt("A3", **HEAD)
    heights = [162, 171, 168, 175, 159, 180, 166, 172, 169, 177, 164, 170, 173, 158, 181,
               167, 174, 165, 178, 170, 163, 176, 169, 171, 160, 172, 168, 175, 166, 179]
    for i, h in enumerate(heights):
        s.put(f"A{4 + i}", h)
    stats = [("Count", "=COUNT(A4:A33)"), ("Mean", "=AVERAGE(A4:A33)"), ("Median", "=MEDIAN(A4:A33)"),
             ("Mode", "=MODE(A4:A33)"), ("Smallest", "=MIN(A4:A33)"), ("Largest", "=MAX(A4:A33)"),
             ("Range", "=D9-D8"), ("Standard deviation", "=STDEV(A4:A33)"), ("Variance", "=VAR(A4:A33)"),
             ("First quartile", "=QUARTILE(A4:A33,1)"), ("Third quartile", "=QUARTILE(A4:A33,3)"),
             ("90th percentile", "=PERCENTILE(A4:A33,0.9)")]
    s.put("C3", "Statistic", "Value").fmt("C3:D3", **HEAD)
    for i, (name, formula) in enumerate(stats):
        s.put(f"C{4 + i}", name, formula)
    s.fmt("D5:D15", number_format="0.0")
    s.width(C=170, D=90)
    b.chart(s, "F3", type="Histogram", title="How heights are spread", x=None,
            series=[{"ref": "A4:A33", "name": "Height"}], xLabel="cm", yLabel="Students")
    b.chart(s, "F21", type="Box", title="Box plot", x=None, series=[{"ref": "A4:A33", "name": "Height"}],
            width=320, height=280)
    return b


def converter():
    b = Book("Unit converter")
    s = b.sheet("Convert")
    s.put("A1", "Unit converter").fmt("A1", **TITLE)
    s.put("A2", "Uses CONVERT(value, from, to). Change a value in the blue column.").fmt("A2", **NOTE)
    s.put("A4", "Value", "From", "To", "Result").fmt("A4:D4", **HEAD)
    rows = [(10, "km", "mi"), (26.2, "mi", "km"), (100, "C", "F"), (70, "kg", "lbm"),
            (1, "gal", "l"), (180, "cm", "ft"), (1, "hr", "sec"), (50, "mph", "km/h")]
    for i, (value, src, dst) in enumerate(rows):
        row = 5 + i
        s.put(f"A{row}", value, src, dst, f"=CONVERT(A{row},B{row},C{row})")
    s.fmt("A5:A12", bg="#e3f0ff").fmt("D5:D12", number_format="0.00", bold=True)
    s.width(A=80, B=80, C=80, D=110)
    return b


def savings():
    b = Book("Savings growth")
    s = b.sheet("Savings")
    s.put("A1", "How savings grow with compound interest").fmt("A1", **TITLE)
    s.put("A3", "Put in each month", 150).fmt("B3", **EURO, bg="#e3f0ff")
    s.put("A4", "Yearly interest", 0.03).fmt("B4", **PCT, bg="#e3f0ff")
    s.put("A5", "Years", 25).fmt("B5", bg="#e3f0ff")
    s.put("A6", "After those years", "=FV(B4/12,B5*12,-B3)").fmt("A6:B6", bold=True).fmt("B6", **EURO)
    s.put("A7", "Of which interest", "=B6-B3*12*B5").fmt("B7", **EURO, font_color="#2d7a3a")
    s.put("A9", "Year", "Put in so far", "Balance").fmt("A9:C9", **HEAD)
    s.put("A10", 0, 0, 0)
    for row in range(11, 11 + 25):
        s.put(f"A{row}", f"=A{row - 1}+1", f"=B{row - 1}+$B$3*12",
              f"=C{row - 1}*(1+$B$4/12)^12+$B$3*((1+$B$4/12)^12-1)/($B$4/12)")
    s.fmt("B10:C35", **EURO)
    s.width(A=150, B=120, C=120)
    b.chart(s, "E9", type="Line", title="Put in and balance", x="A10:A35",
            series=[{"ref": "B10:B35", "name": "Put in"}, {"ref": "C10:C35", "name": "Balance"}],
            xLabel="Years", yLabel="€")
    return b


WORKBOOKS = [budget, loan, grades, sales, invoice, inventory, timesheet, experiment,
             spectrum, python_cells, solver, statistics, converter, savings]


def build():
    for n, make in enumerate(WORKBOOKS, 1):
        book = make()
        book.check()
        content = book.ydoc()
        path = write_kdoc("Spreadsheets", f"{n:02d} {book.title.split(' — ')[0]}", book.title,
                          "sheet", content)
        print(f"  {path.name}  ({len(content)} bytes)")
