"""Example presentations, in KherveDOC Slides' layout (see the web app's
kherve-slides/model/types.ts): Yjs maps of JSON strings, on a 960 × 540
slide."""

import hashlib
import json

from pycrdt import Doc, Map

from common import write_kdoc

W, H = 960, 540
M = 60


def T(text, x, y, w, h, size=24, role="body", **style):
    """A text box."""
    st = {"size": size, **style}
    return {"type": "text", "role": role, "x": x, "y": y, "w": w, "h": h, "text": text, "style": st}


def title(text, y=40, h=90, size=44, **style):
    return T(text, M, y, W - 2 * M, h, size, "title", bold=True, valign="middle", **style)


def bullets(text, x=M, y=150, w=W - 2 * M, h=H - 200, size=26, **style):
    return T(text, x, y, w, h, size, "body", bullets=True, **style)


def S(shape, x, y, w, h, fill=None, text=None, size=22, color="#ffffff", stroke="none", **extra):
    """A shape (with text in it, optionally)."""
    el = {"type": "shape", "shape": shape, "x": x, "y": y, "w": w, "h": h, "stroke": stroke}
    if fill:
        el["fill"] = fill
    if text is not None:
        el["text"] = text
        el["style"] = {"size": size, "align": "center", "valign": "middle", "color": color,
                       **extra.pop("style", {})}
    el.update(extra)
    return el


def line(x, y, w, h=4, arrow=False, color="#555555", width=3):
    return {"type": "shape", "shape": "arrow" if arrow else "line", "x": x, "y": y, "w": w, "h": h,
            "stroke": color, "strokeWidth": width}


def slide(*elements, notes=None, background=None):
    return {"elements": list(elements), "notes": notes, "background": background}


def title_slide(main, sub, notes=None, **kw):
    return slide(T(main, M, 150, W - 2 * M, 140, 56, "title", bold=True, align="center", valign="bottom"),
                 T(sub, M * 2, 310, W - 4 * M, 70, 26, "subtitle", align="center"),
                 notes=notes, **kw)


def section(main, sub, accent, notes=None, **kw):
    return slide(T(main, M, 190, W - 2 * M, 110, 54, "title", bold=True, valign="bottom"),
                 S("rect", M, 310, 120, 8, accent),
                 T(sub, M, 330, W - 2 * M, 60, 24, "subtitle"), notes=notes, **kw)


class Deck:
    def __init__(self, name, theme):
        self.name = name
        self.theme = theme
        self.slides = []

    def add(self, *slides):
        self.slides.extend(slides)
        return self

    def ydoc(self) -> bytes:
        doc = Doc()
        ys = doc.get("slides", type=Map)
        ye = doc.get("elements", type=Map)
        yd = doc.get("deck", type=Map)
        with doc.transaction():
            yd["theme"] = self.theme
            for i, sl in enumerate(self.slides):
                sid = hashlib.sha1(f"{self.name}/{i}".encode()).hexdigest()[:16]
                meta = {"order": i}
                if sl["notes"]:
                    meta["notes"] = sl["notes"]
                if sl["background"]:
                    meta["background"] = sl["background"]
                ys[sid] = json.dumps(meta)
                for z, el in enumerate(sl["elements"]):
                    eid = hashlib.sha1(f"{self.name}/{i}/{z}".encode()).hexdigest()[:16]
                    ye[eid] = json.dumps({**el, "slide": sid, "z": z})
        return doc.get_update()


# ── The presentations ────────────────────────────────────────────────
def welcome():
    blue, orange = "#2466b0", "#f0a030"
    d = Deck("Welcome to KherveDOC Slides", "kherve")
    shapes = ["rect", "roundRect", "ellipse", "triangle", "diamond", "arrowRight", "star"]
    colors = ["#2466b0", "#3aa0d8", "#20bf55", "#f0a030", "#ee4266", "#8c5e3c", "#9467bd"]
    d.add(
        title_slide("Welcome to KherveDOC Slides", "Presentations you make together — and show anywhere",
                    notes="Press F5 (or the Present button) to show this presentation full screen. "
                          "Use the arrow keys to move, Esc to stop."),
        slide(title("Getting around"),
              bullets("The slides are listed on the left: click one to edit it\n"
                      "Drag a slide in the list to change the order\n"
                      "Double-click a box to write in it; drag it to move it\n"
                      "Pull the small squares to resize, the round handle to turn\n"
                      "Speaker notes go under the slide — only you see them"),
              notes="Everything you do is saved automatically, and people you share with see it live."),
        slide(title("Add things with the toolbar"),
              T("New slide\nText box\nShape\nPicture", M, 150, 390, 300, 28, bullets=True),
              T("Bold, italic, underline\nColours and fill\nAlignment and lists\nBring to front / send to back",
                M + 440, 150, 400, 300, 28, bullets=True),
              S("roundRect", M, 440, W - 2 * M, 50, "#e8eef8", "Tip: ⌘/Ctrl + D duplicates what is selected",
                size=20, color="#1d3f73")),
        slide(title("Shapes"),
              *[S(shape, 70 + i * 122, 200, 100, 100, colors[i]) for i, shape in enumerate(shapes)],
              *[T(name, 60 + i * 122, 310, 120, 40, 16, align="center")
                for i, name in enumerate(["Rectangle", "Rounded", "Ellipse", "Triangle", "Diamond", "Arrow", "Star"])],
              line(120, 400, 300, arrow=True, color=blue),
              T("Lines and arrows too", 450, 380, 300, 40, 20),
              notes="Shapes can hold text: double-click one and type."),
        slide(title("Presenting"),
              S("roundRect", M, 160, 260, 120, blue, "F5\nfrom the start", 26),
              S("roundRect", M + 290, 160, 260, 120, orange, "⇧F5\nfrom this slide", 26),
              S("roundRect", M + 580, 160, 260, 120, "#20bf55", "Esc\nto stop", 26),
              T("→ or space: next slide     ← : previous slide     B: black screen", M, 320, W - 2 * M, 50, 22,
                align="center"),
              notes="In the desktop app the presentation fills the screen; in a browser too, if it allows."),
        slide(title("PowerPoint in, PowerPoint out"),
              bullets("File → Import PowerPoint (.pptx) adds the slides of a PowerPoint file\n"
                      "File → Download as PowerPoint (.pptx) makes a file anyone can open\n"
                      "File → Print / Save as PDF prints one slide per page"),
              S("rect", M, 420, 380, 70, "#d9622b", ".pptx", 30, style={"bold": True}),
              line(M + 400, 453, 120, arrow=True, color="#333333"),
              S("rect", M + 540, 420, 300, 70, blue, "KherveDOC", 30, style={"bold": True})),
        slide(title("Themes"),
              bullets("Design → pick a theme: colours and fonts change on every slide\n"
                      "Each slide can also have its own background colour\n"
                      "Colours you choose yourself stay as they are"),
              *[S("rect", M + i * 120, 400, 100, 60, c) for i, c in
                enumerate(["#1d3f73", "#141a2e", "#0b4f6c", "#b23a48", "#2d5a27", "#8c5e3c", "#ffd23f"])]),
        section("Your turn!", "Make a copy of this presentation and change anything you like.", orange),
    )
    return d


def kickoff():
    d = Deck("Project kickoff", "ocean")
    teal, green = "#01baef", "#20bf55"
    d.add(
        title_slide("Customer portal", "Project kickoff · October 2026",
                    notes="Welcome everyone. The goal today: agree on what we build, when, and who does what."),
        slide(title("Agenda"),
              T("1.  Why this project\n2.  What we will build\n3.  Timeline\n4.  The team\n5.  Risks\n6.  Next steps",
                M, 150, 500, 330, 28),
              S("ellipse", 640, 170, 240, 240, teal, "60\nminutes", 40, style={"bold": True})),
        slide(title("Why"),
              S("roundRect", M, 170, 260, 220, "#0b4f6c", "35 %\nof support calls ask “where is my order?”", 24),
              S("roundRect", M + 290, 170, 260, 220, teal, "3 days\nto get a copy of an invoice", 24),
              S("roundRect", M + 580, 170, 260, 220, green, "1 place\nfor everything a customer needs", 24),
              notes="These figures come from the support tickets of the last six months."),
        slide(title("What we will build"),
              bullets("Order tracking, live\nInvoices to view and download\nHelp requests with attachments\n"
                      "Sign-in with the existing account", w=520),
              S("roundRect", 640, 170, 240, 260, "#e8f4f8", "Not now:\n\nonline payment\nmobile app", 24,
                color="#1b3a4b", stroke="#01baef", strokeWidth=2)),
        slide(title("Timeline"),
              line(M, 300, W - 2 * M, color="#0b4f6c", width=4),
              *[x for i, (label, date) in enumerate([("Requirements", "10 Oct"), ("Design", "31 Oct"),
                                                    ("First version", "5 Dec"), ("Pilot", "12 Jan"),
                                                    ("Launch", "2 Feb")])
                for x in (S("ellipse", M + 20 + i * 190, 282, 36, 36, green if i == 0 else teal),
                          T(label, M - 30 + i * 190, 200, 140, 70, 20, align="center", valign="bottom", bold=True),
                          T(date, M - 30 + i * 190, 330, 140, 40, 18, align="center"))]),
        slide(title("The team"),
              *[x for i, (initials, name, job, color) in enumerate([
                  ("AL", "Anna", "Project lead", "#0b4f6c"), ("CB", "Chloé", "Design", teal),
                  ("DK", "Dmitri", "Development", green), ("BR", "Bastien", "Support & pilot", "#f0a030")])
                for x in (S("ellipse", 90 + i * 210, 170, 140, 140, color, initials, 40, style={"bold": True}),
                          T(name, 60 + i * 210, 320, 200, 40, 24, align="center", bold=True),
                          T(job, 60 + i * 210, 360, 200, 40, 18, align="center"))]),
        slide(title("Risks and what we do about them"),
              bullets("Invoice system slow to connect → start with it, weekly check with IT\n"
                      "Too few pilot customers → a discount for volunteers\n"
                      "Someone away → pair on every feature, write things down")),
        slide(title("Next steps"),
              bullets("Chloé: first screens by Friday\nDmitri: access to the invoice system\n"
                      "Anna: invite the pilot customers\nEveryone: weekly check-in, Tuesdays 10:00"),
              notes="Thank everyone and ask for questions."),
    )
    return d


def quarterly():
    d = Deck("Quarterly review", "midnight")
    blue, red, green = "#5b8def", "#f25f5c", "#3bceac"
    values = [(420, "Jul"), (465, "Aug"), (510, "Sep")]
    d.add(
        title_slide("Q3 2026 review", "Sales, customers and what comes next"),
        slide(title("The quarter in numbers"),
              *[x for i, (big, label, color) in enumerate([("1.4 M€", "revenue (+12 %)", blue),
                                                         ("3 280", "active customers", green),
                                                         ("4.6 / 5", "customer rating", "#f0a030")])
                for x in (S("roundRect", M + i * 290, 170, 260, 200, "#1f2842", stroke=color, strokeWidth=3),
                          T(big, M + i * 290, 190, 260, 100, 54, align="center", valign="middle", bold=True,
                            color=color),
                          T(label, M + i * 290, 290, 260, 60, 22, align="center"))],
              notes="Revenue grew for the fifth quarter in a row."),
        slide(title("Monthly revenue (k€)"),
              line(160, 460, 640, color="#8891aa", width=2),
              *[x for i, (v, month) in enumerate(values)
                for x in (S("rect", 200 + i * 200, 460 - v * 0.55, 120, v * 0.55, blue),
                          T(str(v), 200 + i * 200, 460 - v * 0.55 - 44, 120, 40, 22, align="center", bold=True),
                          T(month, 200 + i * 200, 470, 120, 40, 20, align="center"))],
              notes="The chart is made of shapes — select a bar and change its height."),
        slide(title("What went well"),
              bullets("New pricing page: +18 % sign-ups\nSupport answers in 2 hours on average\n"
                      "Two big customers renewed for three years")),
        slide(title("What was hard"),
              bullets("Delivery delays in August (supplier strike)\nHiring: two positions still open\n"
                      "Website slow on phones"),
              S("rect", W - M - 10, 160, 10, 300, red)),
        slide(title("Q4 priorities"),
              S("arrowRight", M, 200, 260, 120, blue, "Launch the\ncustomer portal", 22),
              S("arrowRight", M + 280, 200, 260, 120, green, "Hire\ntwo people", 22),
              S("arrowRight", M + 560, 200, 260, 120, "#f0a030", "Faster site\non phones", 22)),
        section("Questions?", "Thank you", blue),
    )
    return d


def water_cycle():
    d = Deck("The water cycle", "ocean")
    blue, sky = "#1f78c1", "#01baef"
    d.add(
        title_slide("The water cycle", "Where does the rain come from? · Science, year 5"),
        slide(title("The big picture"),
              S("ellipse", 780, 110, 110, 110, "#f5c04a", "Sun", 22, color="#6a4a00"),
              S("roundRect", 360, 130, 240, 90, "#dfe8ef", "Clouds", 26, color="#1b3a4b"),
              S("rect", M, 400, 380, 90, blue, "Sea and lakes", 24),
              S("triangle", 620, 290, 280, 200, "#5c946e", "Mountains", 20),
              line(250, 390, 140, h=170, arrow=True, color=sky),
              T("1. Evaporation", 90, 250, 200, 40, 20, bold=True),
              line(600, 175, 150, arrow=True, color="#7f8c99"),
              T("2. Condensation", 590, 130, 200, 40, 18, bold=True),
              line(560, 230, 100, h=90, arrow=True, color=blue),
              T("3. Precipitation", 640, 240, 200, 40, 18, bold=True),
              line(620, 480, 170, arrow=False, color=blue),
              T("4. Collection", 470, 490, 200, 40, 18, bold=True),
              notes="Follow the arrows with the class: the water goes round and round."),
        slide(title("1. Evaporation"),
              bullets("The sun warms the sea, lakes and rivers\nWater turns into an invisible gas: water vapour\n"
                      "The vapour rises into the air", w=560),
              S("ellipse", 700, 170, 180, 180, "#f5c04a")),
        slide(title("2. Condensation"),
              bullets("High up, the air is cold\nThe vapour cools and turns back into tiny droplets\n"
                      "Billions of droplets together make a cloud", w=560),
              S("roundRect", 660, 190, 240, 120, "#dfe8ef")),
        slide(title("3. Precipitation"),
              bullets("Droplets bump into each other and grow\nWhen they are too heavy, they fall\n"
                      "Rain, snow, sleet or hail", w=560),
              *[line(700 + i * 40, 200 + (i % 2) * 30, 30, h=60, color=sky, width=4) for i in range(5)]),
        slide(title("4. Collection"),
              bullets("Water gathers in rivers, lakes and the sea\nSome soaks into the ground\n"
                      "…and the sun starts the cycle again!", w=560),
              S("rect", 660, 330, 240, 90, blue)),
        slide(title("Quiz time"),
              T("1. What turns water into vapour?\n2. What is a cloud made of?\n3. Name two kinds of precipitation.\n"
                "4. Where does the water go after it rains?", M, 150, W - 2 * M, 300, 28, numbered=False),
              notes="Answers: the sun's heat; tiny water droplets; rain, snow, sleet, hail; rivers, lakes, sea, ground."),
    )
    return d


def pitch():
    d = Deck("Startup pitch", "bold")
    pink, teal, dark = "#ee4266", "#3bceac", "#111111"
    d.add(
        title_slide("Kompost", "Turning city food waste into soil — and money",
                    notes="Hi, I'm Léa, co-founder of Kompost. We have two minutes: let's go."),
        slide(title("The problem"),
              T("⅓", M, 150, 300, 220, 150, align="center", valign="middle", bold=True, color=pink),
              T("of household rubbish is food waste. Cities pay to burn it.", 380, 180, 520, 160, 34,
                valign="middle")),
        slide(title("Our solution"),
              S("roundRect", M, 170, 250, 200, dark, "Collect\nby bike", 30, color="#ffd23f"),
              S("arrowRight", M + 270, 240, 60, 60, pink),
              S("roundRect", M + 350, 170, 250, 200, dark, "Compost\nin the city", 30, color="#ffd23f"),
              S("arrowRight", M + 620, 240, 60, 60, pink),
              S("ellipse", M + 700, 170, 200, 200, teal, "Sell\nsoil", 30, color=dark)),
        slide(title("The market"),
              S("ellipse", 330, 130, 380, 380, "#ffe680", "", 20),
              S("ellipse", 400, 200, 240, 240, "#ffb347", ""),
              S("ellipse", 460, 260, 120, 120, pink, "Brest\n2 M€", 20),
              T("France: 1.1 bn€ spent on food waste", 690, 170, 250, 60, 18),
              T("Brittany cities: 60 M€", 690, 260, 250, 60, 18),
              T("Year 1: Brest", 690, 350, 250, 60, 18),
              notes="TAM / SAM / SOM shown as circles."),
        slide(title("Traction"),
              line(M + 40, 450, 780, color=dark, width=2),
              *[S("rect", M + 80 + i * 140, 450 - h, 90, h, pink if i == 5 else teal) for i, h in
                enumerate([30, 55, 90, 140, 200, 270])],
              T("Households signed up, month by month: 60 → 540", M, 150, W - 2 * M, 50, 24)),
        slide(title("The ask"),
              T("250 k€", M, 160, W - 2 * M, 150, 110, align="center", valign="middle", bold=True, color=pink),
              T("to open two more sites and reach 5 000 households", M, 320, W - 2 * M, 60, 28, align="center")),
        section("Thank you!", "lea@kompost.example · kompost.example", pink),
    )
    return d


def roadmap():
    d = Deck("Product roadmap", "forest")
    green, gold, soft = "#5c946e", "#c9a227", "#dfeadb"
    quarters = ["Q1", "Q2", "Q3", "Q4"]
    items = [(0, 0, 2, "Search, faster", green), (1, 1, 2, "Offline mode", gold),
             (2, 0, 1, "Dark theme", green), (3, 2, 2, "Mobile app", gold), (4, 3, 1, "AI help", green)]
    d.add(
        title_slide("Product roadmap 2027", "What we plan to build, quarter by quarter"),
        slide(title("The year at a glance"),
              *[x for i, q in enumerate(quarters)
                for x in (S("rect", 140 + i * 190, 150, 180, 44, soft, q, 22, color="#2d5a27",
                            style={"bold": True}),)],
              *[S("roundRect", 140 + start * 190, 210 + row * 58, span * 190 - 10, 46, color, label, 18)
                for row, start, span, label, color in items],
              notes="Green: things we are sure of. Gold: things that depend on hiring."),
        slide(title("Q1 — Search, faster"),
              bullets("Results in under 100 ms\nSearch inside spreadsheets and slides\nFilters by kind and date")),
        slide(title("Q2 — Offline mode"),
              bullets("Keep working without a connection\nChanges merge when you are back online\n"
                      "Works in the desktop app first")),
        slide(title("How we decide"),
              S("diamond", 380, 150, 200, 200, gold, "Does it\nhelp users?", 20),
              line(580, 250, 120, arrow=True, color="#2d5a27"),
              S("roundRect", 710, 210, 190, 80, green, "Build it", 24),
              line(478, 350, 4, h=80, arrow=True, color="#2d5a27"),
              S("roundRect", 390, 430, 180, 60, "#b0b8ad", "Not now", 20, color="#2f3a2c")),
    )
    return d


def agenda():
    d = Deck("Team meeting", "paper")
    brown = "#8c5e3c"
    d.add(
        title_slide("Team meeting", "Tuesday 14 October · 10:00"),
        slide(title("Agenda"),
              T("10:00   Welcome and news\n10:10   Website launch\n10:30   Autumn campaign budget\n"
                "10:50   Any other business", M, 160, W - 2 * M, 280, 30)),
        slide(title("Website launch"),
              bullets("Date: Monday 3 November\nChecklist in the shared document\nTesting on phones: Dmitri")),
        slide(T("“Plans are nothing; planning is everything.”", M * 2, 140, W - 4 * M, 220, 40, "title",
                italic=True, align="center", valign="middle"),
              T("— Dwight D. Eisenhower", M * 2, 370, W - 4 * M, 50, 22, "subtitle", align="center")),
        section("Thanks, everyone", "Next meeting: Tuesday 21 October", brown),
    )
    return d


def numbers():
    d = Deck("Big numbers", "sunset")
    red, orange = "#b23a48", "#fc9e4f"
    d.add(
        title_slide("Our year in numbers", "A design example: one idea per slide"),
        slide(T("12 000", M, 120, W - 2 * M, 200, 140, "title", bold=True, align="center", valign="middle",
                color=red),
              T("trees planted by volunteers", M, 330, W - 2 * M, 60, 32, align="center")),
        slide(T("98 %", M, 120, W - 2 * M, 200, 140, "title", bold=True, align="center", valign="middle",
                color=orange),
              T("of our visitors would come back", M, 330, W - 2 * M, 60, 32, align="center"),
              background="#4a2c2a"),
        slide(title("Three things we learned"),
              S("ellipse", 110, 180, 180, 180, red, "Start\nsmall", 26),
              S("ellipse", 390, 180, 180, 180, orange, "Ask\nearly", 26),
              S("ellipse", 670, 180, 180, 180, "#6d9f71", "Say\nthank you", 26)),
        section("Next year: 20 000", "Join us!", red),
    )
    return d


DECKS = [welcome, kickoff, quarterly, water_cycle, pitch, roadmap, agenda, numbers]


def build():
    for n, make in enumerate(DECKS, 1):
        deck = make()
        content = deck.ydoc()
        path = write_kdoc("Slides", f"{n:02d} {deck.name}", deck.name, "slide", content)
        print(f"  {path.name}  ({len(deck.slides)} slides, {len(content)} bytes)")
