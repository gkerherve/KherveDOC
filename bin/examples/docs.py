"""Example text documents, written as BlockNote blocks and turned into the
editor's Yjs format by the y-provider's converter (the same code the
editor runs)."""

import json
import os
import urllib.request

from common import write_kdoc

CONVERTER = os.environ.get("KHERVE_CONVERTER", "http://localhost:4444/api/convert/")
API_KEY = os.environ.get("Y_PROVIDER_API_KEY", "yprovider-api-key")


# ── BlockNote helpers ────────────────────────────────────────────────
def r(text, *flags, color=None, bg=None):
    """A run of text: flags among bold, italic, underline, strike, code."""
    styles = {flag: True for flag in flags}
    if color:
        styles["textColor"] = color
    if bg:
        styles["backgroundColor"] = bg
    return {"type": "text", "text": text, "styles": styles}


def link(text, href):
    return {"type": "link", "href": href, "content": [r(text)]}


def runs(parts):
    return [r(p) if isinstance(p, str) else p for p in parts]


def P(*parts, align=None, color=None, bg=None):
    props = {}
    if align:
        props["textAlignment"] = align
    if color:
        props["textColor"] = color
    if bg:
        props["backgroundColor"] = bg
    return {"type": "paragraph", "props": props, "content": runs(parts)}


def H(level, *parts, align=None, color=None):
    props = {"level": level}
    if align:
        props["textAlignment"] = align
    if color:
        props["textColor"] = color
    return {"type": "heading", "props": props, "content": runs(parts)}


def UL(*items):
    return [{"type": "bulletListItem", "content": runs(i if isinstance(i, (list, tuple)) else [i])}
            for i in items]


def OL(*items):
    return [{"type": "numberedListItem", "content": runs(i if isinstance(i, (list, tuple)) else [i])}
            for i in items]


def CHECK(*items):
    """Items as (text, done)."""
    return [{"type": "checkListItem", "props": {"checked": done}, "content": runs([text])}
            for text, done in items]


def QUOTE(*parts):
    return {"type": "quote", "content": runs(parts)}


def CODE(code, language="python"):
    return {"type": "codeBlock", "props": {"language": language},
            "content": [r(code)]}


def TABLE(rows, header=True):
    return {"type": "table", "content": {
        "type": "tableContent",
        "headerRows": 1 if header else 0,
        "rows": [{"cells": [runs([c]) if isinstance(c, str) else runs(c) for c in row]}
                 for row in rows]}}


def flat(*blocks):
    out = []
    for b in blocks:
        if isinstance(b, list):
            out.extend(b)
        else:
            out.append(b)
    return out


def convert(blocks) -> bytes:
    request = urllib.request.Request(
        CONVERTER, data=json.dumps(blocks).encode(), method="POST",
        headers={"Authorization": f"Bearer {API_KEY}",
                 "Content-Type": "application/vnd.blocknote+json",
                 "Accept": "application/vnd.yjs.doc"})
    with urllib.request.urlopen(request, timeout=60) as resp:
        return resp.read()


# ── The documents ────────────────────────────────────────────────────
def welcome():
    return flat(
        H(1, "Welcome to KherveDOC 👋"),
        P(r("KherveDOC", "bold"), " is where you write documents, build spreadsheets and "
          "make slides — on your own or together, live. This folder is full of examples: "
          "open them, change them, copy what you like."),
        H(2, "What is in the Examples folder"),
        UL([r("Documents", "bold"), " — letters, notes, reports, plans… (like this one)"],
           [r("Spreadsheets", "bold"), " — budgets, calculators, charts, curve fitting, Python cells"],
           [r("Slides", "bold"), " — presentations you can present full screen or save as PowerPoint"]),
        H(2, "Writing"),
        P("Type ", r("/", "code"), " anywhere to insert a heading, a list, a table, a picture, "
          "a spreadsheet and more. Markdown shortcuts work too:"),
        TABLE([["Type…", "To get…"],
               [[r("# ", "code"), "then a space"], "A big heading (## and ### for smaller ones)"],
               [[r("- ", "code"), "or ", r("* ", "code")], "A bullet list"],
               [[r("1. ", "code")], "A numbered list"],
               [[r("[] ", "code")], "A check list"],
               [[r("> ", "code")], "A quote"],
               [[r("```", "code")], "A block of code"],
               [[r("**bold**", "code")], [r("bold", "bold")]],
               [[r("*italic*", "code")], [r("italic", "italic")]]]),
        H(2, "Working together"),
        UL("Share a document with the Share button: people you invite see changes as they happen.",
           "Select text and comment on it; mention people with @.",
           "Every change is saved on its own. Earlier versions are in the ⋯ menu, under History."),
        H(2, "Files from Word, Excel and PowerPoint"),
        P("Use ", r("New ▾ → Import a document", "bold"), " to open a ", r(".docx", "code"), ", ",
          r(".xlsx", "code"), " or ", r(".pptx", "code"), " file: it becomes a KherveDOC document, "
          "spreadsheet or slides. Going the other way, every kind can be downloaded in the same "
          "formats (Word, Excel, PowerPoint) and as PDF."),
        QUOTE("Tip: drag documents onto a folder in the list to move them there. Folders can "
              "hold folders, as many as you like."),
        H(2, "Keyboard shortcuts"),
        TABLE([["Shortcut", "Does"],
               ["⌘/Ctrl + B, I, U", "Bold, italic, underline"],
               ["⌘/Ctrl + K", "Add a link"],
               ["⌘/Ctrl + Z / ⇧⌘Z", "Undo / redo"],
               ["⌘/Ctrl + F", "Find and replace"],
               ["Tab / ⇧Tab", "Indent / outdent a list item"]]),
        P(""),
        P("Have fun! ✨", align="center", color="blue"),
    )


def meeting_notes():
    return flat(
        H(1, "Team meeting — 14 October 2026"),
        P(r("Where: ", "bold"), "Room Brocéliande and online   ", r("Time: ", "bold"), "10:00–11:00"),
        P(r("Present: ", "bold"), "Anna (chair), Bastien, Chloé, Dmitri, Élodie   ",
          r("Apologies: ", "bold"), "François"),
        H(2, "Agenda"),
        OL("Updates from each team", "Website launch: date and checklist",
           "Budget for the autumn campaign", "Any other business"),
        H(2, "Notes"),
        H(3, "1. Updates"),
        UL([r("Design", "bold"), ": the new home page mock-ups are ready for review."],
           [r("Engineering", "bold"), ": search is 40 % faster since the last release."],
           [r("Support", "bold"), ": fewer tickets this month (212, down from 260)."]),
        H(3, "2. Website launch"),
        P("We agreed to launch on ", r("Monday 3 November", "bold", bg="yellow"),
          ". The launch checklist is below; owners are in brackets."),
        H(3, "3. Budget"),
        TABLE([["Item", "Planned", "Agreed"],
               ["Online ads", "4 000 €", "3 500 €"],
               ["Printed flyers", "800 €", "800 €"],
               ["Launch event", "2 500 €", "2 000 €"],
               [[r("Total", "bold")], [r("7 300 €", "bold")], [r("6 300 €", "bold")]]]),
        H(2, "Decisions"),
        UL("Launch date fixed to 3 November.", "Campaign budget: 6 300 € (see table).",
           "Weekly check-in every Tuesday until launch."),
        H(2, "Action items"),
        CHECK(("Send the mock-ups to everyone (Chloé) — Thursday", True),
              ("Book the room for the launch event (Élodie) — next week", False),
              ("Write the press release (Anna) — 24 October", False),
              ("Test the site on phones and tablets (Dmitri) — 28 October", False),
              ("Update the help pages (Bastien) — 31 October", False)),
        H(2, "Next meeting"),
        P("Tuesday 21 October, 10:00, same place."),
    )


def project_plan():
    return flat(
        H(1, "Project plan: new customer portal"),
        P(r("Owner: ", "bold"), "Anna Le Gall   ", r("Status: ", "bold"),
          r("On track", "bold", color="green"), "   ", r("Last update: ", "bold"), "27 September 2026"),
        H(2, "Goal"),
        P("Let customers follow their orders, download invoices and ask for help in one place, "
          "so that support calls drop by a third within six months."),
        H(2, "Scope"),
        H(3, "In"),
        UL("Order tracking", "Invoices (view, download as PDF)", "Help requests with file uploads",
           "Sign-in with the existing customer account"),
        H(3, "Out (for now)"),
        UL("Online payment", "Mobile app"),
        H(2, "Milestones"),
        TABLE([["Milestone", "Date", "Owner", "Status"],
               ["Requirements signed off", "10 Oct", "Anna", "✅ Done"],
               ["Design ready", "31 Oct", "Chloé", "🟡 In progress"],
               ["First version (internal)", "5 Dec", "Dmitri", "⚪ Not started"],
               ["Pilot with 50 customers", "12 Jan", "Bastien", "⚪ Not started"],
               ["Launch", "2 Feb", "Anna", "⚪ Not started"]]),
        H(2, "Risks"),
        TABLE([["Risk", "Likelihood", "Impact", "What we do"],
               ["Invoices system is slow to connect", "Medium", "High",
                "Start the connection work first; weekly check with IT"],
               ["Too few pilot volunteers", "Low", "Medium", "Offer a discount to pilot customers"],
               ["Key developer away", "Medium", "Medium", "Pair on every feature; write things down"]]),
        H(2, "Team"),
        UL("Anna — project lead", "Chloé — design", "Dmitri, Élodie — development",
           "Bastien — support and pilot"),
        H(2, "Budget"),
        P("Total: ", r("48 000 €", "bold"), " (see the ", r("Household budget", "italic"),
          " spreadsheet for how to keep track of money in KherveDOC)."),
    )


def letter():
    return flat(
        P(r("Marie Kerjean", "bold")),
        P("12 rue des Lilas"), P("29200 Brest"), P("marie.kerjean@example.org"),
        P(""),
        P("Customer Service", align="right"), P("Maison Bleue Furniture", align="right"),
        P("4 avenue du Port", align="right"), P("56100 Lorient", align="right"),
        P(""),
        P("Brest, 27 September 2026", align="right"),
        P(""),
        P(r("Subject: ", "bold"), "Order 2026-4418 — damaged table"),
        P(""),
        P("Dear Sir or Madam,"),
        P("On 18 September I received the oak dining table I ordered on your website (order "
          "2026-4418). When unpacking it, I found a deep scratch across the top and a cracked leg. "
          "I have attached photographs of the damage."),
        P("I would be grateful if you could replace the table or, if that is not possible, refund "
          "the full price of 649 €. I am happy to keep the table packed until your carrier collects it."),
        P("Thank you in advance for your help. I look forward to hearing from you."),
        P(""),
        P("Yours faithfully,"),
        P(""),
        P(r("Marie Kerjean", "italic")),
        P(""),
        P(r("Enclosures: ", "bold"), "order confirmation, three photographs"),
    )


def cv():
    return flat(
        H(1, "Yann Morvan", align="center"),
        P("Data analyst · Rennes, France · yann.morvan@example.org · +33 6 12 34 56 78", align="center",
          color="gray"),
        H(2, "Profile"),
        P("Data analyst with six years of experience turning messy data into clear decisions. "
          "At home with spreadsheets, Python and SQL, and good at explaining numbers to people who "
          "do not love them."),
        H(2, "Experience"),
        H(3, "Senior data analyst — Breizh Energie, Rennes"),
        P(r("2022 – today", "italic")),
        UL("Built the monthly energy report used by 40 managers (saves 3 days of work a month).",
           "Forecast demand with a model 12 % more accurate than the previous one.",
           "Trained 25 colleagues in spreadsheets and data visualisation."),
        H(3, "Data analyst — Ouest Logistique, Nantes"),
        P(r("2019 – 2022", "italic")),
        UL("Cut delivery delays by 18 % by finding the routes that caused them.",
           "Automated weekly stock reports with Python."),
        H(2, "Education"),
        TABLE([["Years", "Degree", "School"],
               ["2017 – 2019", "Master's in statistics", "Université de Rennes"],
               ["2014 – 2017", "Bachelor's in mathematics", "Université de Bretagne Occidentale"]]),
        H(2, "Skills"),
        UL([r("Data: ", "bold"), "Python (pandas, NumPy), SQL, KherveSheet, curve fitting"],
           [r("Visualisation: ", "bold"), "charts, dashboards, clear slides"],
           [r("Languages: ", "bold"), "French (native), English (fluent), Breton (conversational)"]),
        H(2, "Interests"),
        P("Sailing, traditional music, and running along the coast."),
    )


def weekly_planner():
    return flat(
        H(1, "Weekly planner — week 40"),
        P("Plan the week on Monday morning, tick things off as you go, and look back on Friday."),
        H(2, "This week's three priorities"),
        OL([r("Finish the quarterly report", "bold")], "Prepare Thursday's presentation",
           "Book the holiday flights"),
        H(2, "Day by day"),
        TABLE([["Day", "Morning", "Afternoon", "Evening"],
               ["Monday", "Plan the week · emails", "Report: sales section", "Swimming"],
               ["Tuesday", "Team meeting 10:00", "Report: costs section", "—"],
               ["Wednesday", "Dentist 9:00", "Slides for Thursday", "Dinner with Léa"],
               ["Thursday", "Presentation 11:00", "Follow-up emails", "Choir"],
               ["Friday", "Finish the report", "Look back on the week", "Cinema"]]),
        H(2, "To do"),
        CHECK(("Pay the electricity bill", True), ("Call the garage about the car", False),
              ("Buy a birthday present for Paul", False), ("Renew the library books", True),
              ("Send the report to Anna", False)),
        H(2, "Looking back (Friday)"),
        QUOTE("What went well? What would I do differently? What am I grateful for?"),
        P(""),
    )


def recipe():
    return flat(
        H(1, "Breton crêpes (sweet)"),
        P(r("Makes: ", "bold"), "about 15 crêpes   ", r("Preparation: ", "bold"), "10 min + 1 h rest   ",
          r("Cooking: ", "bold"), "30 min"),
        H(2, "Ingredients"),
        UL("250 g plain flour", "4 eggs", "½ litre of milk (500 ml)", "50 g melted salted butter",
           "1 tablespoon of sugar", "1 pinch of salt", "Optional: 1 tablespoon of rum or orange-flower water"),
        H(2, "Method"),
        OL("Put the flour, sugar and salt in a large bowl and make a well in the middle.",
           "Break the eggs into the well and whisk, slowly pulling in the flour.",
           "Pour in the milk little by little, whisking all the time, until the batter is smooth.",
           "Stir in the melted butter (and the rum, if you like). Leave to rest for one hour.",
           "Heat a lightly buttered pan. Pour a small ladle of batter and tilt the pan to spread it thin.",
           "Cook about 1 minute, until the edges turn golden, then flip and cook 30 seconds more."),
        H(2, "Fillings to try"),
        TABLE([["Classic", "Fruity", "Indulgent"],
               ["Butter and sugar", "Apple and cinnamon", "Salted-butter caramel"],
               ["Lemon and sugar", "Banana and honey", "Chocolate and hazelnuts"]]),
        QUOTE("Tip: the first crêpe is always a failure — that is the cook's crêpe. Eat it!"),
    )


def lab_report():
    return flat(
        H(1, "Lab report: cooling of a cup of tea"),
        P(r("Author: ", "bold"), "Élodie Tanguy   ", r("Date: ", "bold"), "22 September 2026"),
        H(2, "Aim"),
        P("To check whether a cup of tea cools following Newton's law of cooling, "
          "T(t) = T", r("room", "italic"), " + (T₀ − T", r("room", "italic"), ") · e", r("−kt", "italic"),
          ", and to measure the constant k."),
        H(2, "Method"),
        OL("Pour 250 ml of water at 90 °C into a ceramic mug.",
           "Record the temperature every two minutes for 30 minutes with a digital thermometer.",
           "Keep the room at 21 °C and the mug away from draughts."),
        H(2, "Results"),
        TABLE([["Time (min)", "Temperature (°C)"],
               ["0", "90.0"], ["4", "76.8"], ["8", "66.2"], ["12", "57.8"], ["16", "51.0"],
               ["20", "45.6"], ["24", "41.3"], ["28", "37.8"]]),
        P("The full data and the fitted curve are in the ", r("Experiment with a trendline", "italic"),
          " spreadsheet: KherveDOC fits the curve for you (chart → trendline → Exponential Decay)."),
        H(2, "Analysis"),
        P("The same fit, done in Python:"),
        CODE("import numpy as np\nfrom scipy.optimize import curve_fit\n\n"
             "t = np.array([0, 4, 8, 12, 16, 20, 24, 28])\n"
             "T = np.array([90.0, 76.8, 66.2, 57.8, 51.0, 45.6, 41.3, 37.8])\n\n"
             "def newton(t, k):\n    return 21 + (90 - 21) * np.exp(-k * t)\n\n"
             "(k,), _ = curve_fit(newton, t, T, p0=[0.05])\n"
             "print(f\"k = {k:.4f} per minute\")   # k ≈ 0.050"),
        H(2, "Conclusion"),
        P("The tea cools as Newton's law predicts, with ", r("k ≈ 0.050 min⁻¹", "bold"),
          ". It reaches a pleasant drinking temperature (about 60 °C) after roughly 11 minutes."),
    )


def article():
    return flat(
        H(1, "Why the sea is salty"),
        P(r("A short explainer for curious minds", "italic"), color="gray"),
        P(r("Every litre of sea water holds about 35 grams of salt.", "bold"),
          " Rivers are fresh, rain is fresh — so where does all that salt come from?"),
        H(2, "Rocks, rain and rivers"),
        P("Rain is slightly acidic. As it falls on land, it slowly dissolves minerals from rocks and "
          "soil. Rivers carry those minerals to the sea. Water leaves the sea again by evaporating — "
          "but the salt stays behind."),
        QUOTE("The sea is where the rivers leave their minerals, a pinch at a time, for millions of years."),
        H(2, "Vents on the sea floor"),
        P("Hot springs on the ocean floor, called hydrothermal vents, add dissolved minerals too, "
          "and undersea volcanoes release more."),
        H(2, "Why it does not get saltier and saltier"),
        P("Salt also leaves the water: it settles into sediments on the sea floor and is locked into "
          "rocks. Over long periods, what comes in and what goes out are roughly balanced."),
        H(2, "Not all seas are equal"),
        TABLE([["Sea", "Salt (grams per litre)", "Why"],
               ["Baltic Sea", "≈ 7", "Many rivers, little evaporation"],
               ["Open ocean", "≈ 35", "Average"],
               ["Red Sea", "≈ 40", "Hot, dry, few rivers"],
               ["Dead Sea", "≈ 340", "A closed lake that only loses water by evaporation"]]),
        P(""),
        P(r("Further reading: ", "bold"), link("NOAA — Why is the ocean salty?", "https://oceanservice.noaa.gov/facts/whysalty.html")),
    )


def travel():
    return flat(
        H(1, "Four days in Brittany"),
        P("A road trip from Rennes to the tip of Finistère and back."),
        H(2, "Day 1 — Rennes and Saint-Malo"),
        UL("Morning: the old town of Rennes and the Thabor gardens.",
           "Afternoon: drive to Saint-Malo (1 h), walk on the ramparts at sunset."),
        H(2, "Day 2 — Mont-Saint-Michel and Cancale"),
        UL("Early visit to Mont-Saint-Michel before the crowds (check the tide times!).",
           "Oysters on the harbour in Cancale."),
        H(2, "Day 3 — Côte de Granit Rose"),
        UL("The pink-granite coast path from Perros-Guirec to Ploumanac'h (2 h walk).",
           "Evening in Morlaix."),
        H(2, "Day 4 — Crozon peninsula and home"),
        UL("Pointe de Pen-Hir cliffs, lunch in Camaret.", "Drive back to Rennes (3 h)."),
        H(2, "Budget"),
        TABLE([["", "Per person"], ["Car hire and fuel", "95 €"], ["Hotels (3 nights)", "210 €"],
               ["Food", "140 €"], ["Visits", "35 €"], [[r("Total", "bold")], [r("480 €", "bold")]]]),
        H(2, "Packing list"),
        CHECK(("Raincoat (it is Brittany)", True), ("Walking shoes", True), ("Swimsuit", False),
              ("Phone charger and adapter", False), ("Tide timetable", False)),
    )


def cheat_sheet():
    return flat(
        H(1, "KherveDOC cheat sheet"),
        P("Everything you can type to format as you write."),
        H(2, "Blocks"),
        TABLE([["Block", "Type at the start of a line", "Or"],
               ["Heading 1 / 2 / 3", "#  ##  ###", "/heading"],
               ["Bullet list", "-  or  *", "/bullet"],
               ["Numbered list", "1.", "/numbered"],
               ["Check list", "[]", "/check"],
               ["Quote", ">", "/quote"],
               ["Code", "```", "/code"],
               ["Table", "—", "/table"],
               ["Picture", "—", "/image, or paste / drop a picture"],
               ["Spreadsheet", "—", "/spreadsheet (a live table from a KherveDOC spreadsheet)"]]),
        H(2, "Text"),
        TABLE([["Style", "Markdown", "Shortcut"],
               [[r("Bold", "bold")], "**text**", "⌘/Ctrl + B"],
               [[r("Italic", "italic")], "*text*", "⌘/Ctrl + I"],
               [[r("Underline", "underline")], "—", "⌘/Ctrl + U"],
               [[r("Strike", "strike")], "~~text~~", "⌘/Ctrl + ⇧ + S"],
               [[r("Code", "code")], "`text`", "⌘/Ctrl + E"]]),
        H(2, "Colours"),
        P("Select text and pick a colour in the toolbar: ", r("red", color="red"), ", ",
          r("orange", color="orange"), ", ", r("green", color="green"), ", ", r("blue", color="blue"),
          ", ", r("purple", color="purple"), " — or a highlight: ", r("yellow", bg="yellow"), ", ",
          r("green", bg="green"), ", ", r("blue", bg="blue"), "."),
        H(2, "Code blocks keep their colours"),
        CODE("function greet(name) {\n  return `Hello, ${name}!`;\n}\n\nconsole.log(greet('KherveDOC'));",
             "javascript"),
    )


def reading_list():
    return flat(
        H(1, "Reading list 2026"),
        P("Books read this year, with a mark out of five and one line to remember each by."),
        TABLE([["Title", "Author", "Mark", "One line"],
               ["The Old Man and the Sea", "Ernest Hemingway", "★★★★★", "Short, simple and unforgettable."],
               ["Sapiens", "Yuval Noah Harari", "★★★★☆", "Big ideas about how we got here."],
               ["The Little Prince", "Antoine de Saint-Exupéry", "★★★★★", "What is essential is invisible to the eye."],
               ["Thinking, Fast and Slow", "Daniel Kahneman", "★★★★☆", "Why our quick judgements trick us."],
               ["Station Eleven", "Emily St. John Mandel", "★★★★☆", "Art and kindness after the end of the world."],
               ["Atomic Habits", "James Clear", "★★★☆☆", "Tiny changes, remarkable results."]]),
        H(2, "Next up"),
        CHECK(("Les Misérables — Victor Hugo", False), ("Pedro Páramo — Juan Rulfo", False),
              ("The Overstory — Richard Powers", False)),
        H(2, "Favourite quote of the year"),
        QUOTE("“It is only with the heart that one can see rightly; what is essential is invisible to the eye.”"),
        P("— Antoine de Saint-Exupéry, ", r("The Little Prince", "italic"), align="right"),
    )


def newsletter():
    return flat(
        H(1, "🌿 The Garden Club — October newsletter", color="green"),
        P(r("Autumn is here: time to plant bulbs, collect seeds and plan next year.", "italic")),
        H(2, "This month's jobs", color="orange"),
        UL("Plant tulip and daffodil bulbs before the first frost.",
           "Collect seeds from sunflowers, poppies and beans; dry them in paper bags.",
           "Rake leaves into a cage: in a year they make lovely leaf mould."),
        H(2, "Club news", color="blue"),
        P("A warm welcome to our ", r("12 new members", "bold"), "! The seed swap on 5 October raised ",
          r("186 €", "bold", bg="yellow"), " for the school garden."),
        H(2, "Dates for your diary", color="purple"),
        TABLE([["Date", "Event", "Where"],
               ["Sat 11 Oct", "Bulb-planting morning", "Community garden"],
               ["Thu 23 Oct", "Talk: composting made easy", "Village hall, 19:30"],
               ["Sun 2 Nov", "Apple pressing", "Le Bihan orchard"]]),
        QUOTE("“To plant a garden is to believe in tomorrow.” — Audrey Hepburn"),
        P("See you soon in the garden!", align="center"),
    )


DOCUMENTS = [
    ("Welcome to KherveDOC", welcome),
    ("Meeting notes", meeting_notes),
    ("Project plan", project_plan),
    ("Formal letter", letter),
    ("Curriculum vitae", cv),
    ("Weekly planner", weekly_planner),
    ("Recipe — Breton crêpes", recipe),
    ("Lab report", lab_report),
    ("Article — Why the sea is salty", article),
    ("Travel itinerary", travel),
    ("Cheat sheet — formatting and shortcuts", cheat_sheet),
    ("Reading list", reading_list),
    ("Newsletter", newsletter),
]


def build():
    for n, (title, make) in enumerate(DOCUMENTS, 1):
        content = convert(make())
        path = write_kdoc("Documents", f"{n:02d} {title.split(' — ')[0]}", title, "doc", content)
        print(f"  {path.name}  ({len(content)} bytes)")
