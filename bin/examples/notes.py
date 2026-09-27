"""Example notes: text (lists, checklists) written as BlockNote blocks and
converted like the documents, with handwriting drawn over it — the pen
strokes the Notes app keeps in the "note-ink" map (see the web app's
features/sov-notes/model/ink.ts; the page is 800 units wide)."""

import json
import math

from pycrdt import Doc, Map

from common import write_kdoc
from docs import CHECK, H, OL, P, UL, convert, flat, r

INK = "note-ink"
BLACK, BLUE, RED, GREEN, YELLOW = "#1f1f1f", "#1a5fd0", "#d0312d", "#1e8a3c", "#f2c200"

# Where each block of text sits on the page (page units), as measured in
# the editor: the centre of each line, and where its text starts and ends.
CHAR = 9.2
INDENT = {"paragraph": 48, "heading": 48, "bulletListItem": 76,
          "numberedListItem": 76, "checkListItem": 86}


def _text(block):
    return "".join(run.get("text", "") for run in block.get("content", [])
                   if isinstance(run, dict))


def layout(blocks):
    """(x start, x end, y centre) of each block, in page units."""
    places, y, previous = [], 0, None
    for block in blocks:
        kind = block["type"]
        level = block.get("props", {}).get("level")
        if previous is None:
            y = 25
        elif kind == "heading":
            y += 59
        elif previous == "heading":
            y += 43 if previous_level == 2 else 39
        else:
            y += 36
        x0 = INDENT.get(kind, 48)
        size = {2: 1.6, 3: 1.28}.get(level, 1) if kind == "heading" else 1
        places.append((x0, x0 + len(_text(block)) * CHAR * size, y))
        previous, previous_level = kind, level
    return places


def stroke(points, color=BLACK, width=2, tool="pen"):
    flat_points = [round(v, 1) for p in points for v in p]
    return {"tool": tool, "color": color, "width": width, "points": flat_points}


def wobble(points, amount=0.6, seed=1):
    """A hand-drawn feel: small regular wiggles."""
    return [(x + amount * math.sin(i * 1.7 + seed), y + amount * math.cos(i * 1.3 + seed))
            for i, (x, y) in enumerate(points)]


def underline(x0, x1, y, color=RED, width=2):
    n = max(2, int((x1 - x0) / 8))
    return stroke(wobble([(x0 + (x1 - x0) * i / n, y + 1.2 * math.sin(i / 2)) for i in range(n + 1)]),
                  color, width)


def highlight(x0, x1, y, color=YELLOW):
    n = max(2, int((x1 - x0) / 10))
    return stroke([(x0 + (x1 - x0) * i / n, y) for i in range(n + 1)], color, 18, "highlighter")


def circle(cx, cy, rx, ry, color=RED, width=2):
    pts = [(cx + rx * math.cos(a / 36 * 2 * math.pi - 0.3), cy + ry * math.sin(a / 36 * 2 * math.pi - 0.3))
           for a in range(40)]
    return stroke(wobble(pts, 1.0), color, width)


def arrow(x0, y0, x1, y1, color=BLUE, width=2):
    angle = math.atan2(y1 - y0, x1 - x0)
    head = [(x1 - 12 * math.cos(angle - 0.5), y1 - 12 * math.sin(angle - 0.5)), (x1, y1),
            (x1 - 12 * math.cos(angle + 0.5), y1 - 12 * math.sin(angle + 0.5))]
    n = 12
    bend = 18
    body = [(x0 + (x1 - x0) * i / n - bend * math.sin(math.pi * i / n) * math.sin(angle),
             y0 + (y1 - y0) * i / n + bend * math.sin(math.pi * i / n) * math.cos(angle))
            for i in range(n + 1)]
    return [stroke(wobble(body, 0.8), color, width), stroke(head, color, width)]


def tick(x, y, color=GREEN, width=3):
    return stroke([(x, y), (x + 5, y + 6), (x + 16, y - 9)], color, width)


def star(cx, cy, size=12, color=YELLOW, width=2):
    pts = [(cx + (size if i % 2 == 0 else size * 0.45) * math.cos(-math.pi / 2 + i * math.pi / 5),
            cy + (size if i % 2 == 0 else size * 0.45) * math.sin(-math.pi / 2 + i * math.pi / 5))
           for i in range(11)]
    return stroke(pts, color, width)


def scribble_text(x, y, word, color=BLUE, width=2):
    """A hand-written looking wave standing for a short word."""
    pts = [(x + i * 3, y + 5 * math.sin(i * 0.9) - (i % 7 == 0) * 6) for i in range(len(word) * 4)]
    return stroke(wobble(pts, 0.5), color, width)


# ── The notes ─────────────────────────────────────────────────────────
# Each note is its text, and the drawing over it given where each block of
# text sits (``at[i]`` = x start, x end, y centre of block i).
def shopping():
    text = flat(
        H(2, "Courses du samedi"),
        P("Pour le repas de dimanche (6 personnes)."),
        CHECK(("Farine de sarrasin", True), ("Œufs (une douzaine)", True),
              ("Beurre demi-sel", False), ("Jambon, emmental", False),
              ("Cidre brut", False), ("Pommes pour la compote", False)),
        P(r("Ne pas oublier :", "bold"), " le pain du boulanger avant 12 h."),
    )

    def ink(at):
        x0, x1, y = at[8]
        bx0, bx1, by = at[4]
        return [circle((x0 + x1) / 2, y, (x1 - x0) / 2 + 14, 17, RED),
                *arrow(x1 + 90, y - 30, x1 + 22, y - 8, RED),
                scribble_text(x1 + 95, y - 34, "urgent", RED),
                highlight(bx0 - 4, bx1 + 4, by)]
    return text, ink


def meeting():
    text = flat(
        H(2, "Réunion d'équipe — lundi"),
        P("Présents : Anne, Marc, Sofia, Tom."),
        H(3, "Ordre du jour"),
        OL("Bilan du trimestre", "Lancement du site", "Budget de la campagne d'automne",
           "Questions diverses"),
        H(3, "Décisions"),
        UL("Le site sort le 14 octobre.", "Sofia prépare le budget pour vendredi.",
           "Réunion suivante : lundi prochain, 10 h."),
        H(3, "À faire"),
        CHECK(("Envoyer le compte-rendu", False), ("Réserver la salle", True)),
    )

    def ink(at):
        x0, x1, y = at[8]
        sx0, sx1, sy = at[9]
        cx0, cx1, cy = at[12]
        return [underline(x1 - 90, x1 - 4, y + 12, RED, 3),
                star(x1 + 18, y, 11, RED),
                *arrow(sx1 + 120, sy, sx1 + 26, sy, BLUE),
                scribble_text(sx1 + 128, sy + 4, "Sofia ok", BLUE),
                tick(cx1 + 24, cy)]
    return text, ink


def lecture():
    text = flat(
        H(2, "Cours de physique — la lumière"),
        UL("La lumière se propage en ligne droite dans un milieu homogène.",
           "Sa vitesse dans le vide : c ≈ 300 000 km/s.",
           "Indice de réfraction : n = c / v."),
        H(3, "Loi de Snell-Descartes"),
        P("n₁ · sin(i₁) = n₂ · sin(i₂)"),
        P("Quand la lumière entre dans l'eau, elle est déviée vers la normale."),
        H(3, "À retenir"),
        OL("La lumière blanche est un mélange de couleurs.",
           "Un prisme sépare ces couleurs (dispersion).",
           "L'arc-en-ciel : dispersion dans les gouttes de pluie."),
    )

    def ink(at):
        fx0, fx1, fy = at[5]
        vx0, vx1, vy = at[2]
        top = at[-1][2] + 50
        cx = 400
        return [
            highlight(vx0 - 4, vx1 + 4, vy),
            circle((fx0 + fx1) / 2, fy, (fx1 - fx0) / 2 + 16, 18, RED),
            # A little diagram of refraction, below the text.
            stroke([(200, top + 110), (600, top + 110)], BLACK, 2),       # the surface
            stroke([(cx, top + 20), (cx, top + 200)], "#888888", 1),       # the normal
            stroke(wobble([(cx - 110, top + 20), (cx, top + 110)], 0.4), YELLOW, 4),
            stroke(wobble([(cx, top + 110), (cx + 55, top + 210)], 0.4), YELLOW, 4),
            scribble_text(220, top + 90, "air", BLUE),
            scribble_text(220, top + 140, "eau", BLUE),
            stroke([(cx - 30, top + 80), (cx - 22, top + 90), (cx - 14, top + 96)], RED, 2),
            scribble_text(cx - 70, top + 70, "i1", RED),
            stroke([(cx + 10, top + 138), (cx + 18, top + 132)], RED, 2),
            scribble_text(cx + 26, top + 148, "i2", RED),
        ]
    return text, ink


def ideas():
    text = flat(
        H(2, "Idées pour les vacances"),
        UL("Bretagne : Crozon, les Glénan", "Écosse : Édimbourg et l'île de Skye",
           "Pays basque : randonnée de la Rhune", "Lisbonne en train de nuit ?"),
        H(3, "Budget"),
        OL("Transport : 400 €", "Logement : 600 €", "Sur place : 300 €"),
        P(r("Total : 1 300 €", "bold")),
    )

    def ink(at):
        bx0, bx1, by = at[1]
        ex0, ex1, ey = at[2]
        tx0, tx1, ty = at[9]
        return [star(bx1 + 20, by, 11, YELLOW),
                star(bx1 + 46, by, 11, YELLOW),
                circle((ex0 + ex1) / 2, ey, (ex1 - ex0) / 2 + 16, 17, GREEN),
                scribble_text(ex1 + 30, ey + 4, "oui !", GREEN),
                underline(tx0, tx1 + 8, ty + 12, RED, 3),
                underline(tx0, tx1 + 8, ty + 17, RED, 2)]
    return text, ink


def sketch():
    """Mostly drawing: a garden plan, below the text."""
    text = flat(
        H(2, "Plan du potager"),
        P("Esquisse au crayon — à compléter sur place."),
        UL("Tomates au sud, contre le mur", "Salades à l'ombre du pommier",
           "Composteur au fond, près du portail"),
    )

    def ink(at):
        top = at[-1][2] + 60
        return [
            stroke(wobble([(100, top), (700, top), (700, top + 330), (100, top + 330),
                           (100, top)], 1.2), BLACK, 3),
            stroke(wobble([(110, top + 12), (690, top + 12)], 0.8), RED, 6),      # the wall
            *[circle(160 + 70 * i, top + 50, 18, 18, RED, 2) for i in range(8)],  # tomatoes
            circle(520, top + 200, 70, 60, GREEN, 3),                            # apple tree
            *[circle(390 + 30 * (i % 3), top + 170 + 32 * (i // 3), 10, 10, GREEN, 2)
              for i in range(6)],                                                # salads
            stroke(wobble([(620, top + 330), (620, top + 270), (690, top + 270),
                           (690, top + 330)], 0.6), BLACK, 2),                   # compost
            stroke([(300, top + 330), (300, top + 300)], BLUE, 2),               # the gate
            stroke([(360, top + 330), (360, top + 300)], BLUE, 2),
            scribble_text(160, top + 90, "tomates", RED),
            scribble_text(390, top + 290, "salades", GREEN),
            scribble_text(560, top + 290, "compost", BLACK),
            *arrow(250, top + 395, 330, top + 340, BLUE),
            scribble_text(150, top + 400, "portail", BLUE),
        ]
    return text, ink


NOTES = [
    ("Courses du samedi", shopping),
    ("Réunion d'équipe", meeting),
    ("Cours de physique", lecture),
    ("Idées pour les vacances", ideas),
    ("Plan du potager", sketch),
]


def with_ink(content: bytes, strokes) -> bytes:
    """The converted text plus the handwriting, as one Yjs document."""
    doc = Doc()
    doc.apply_update(content)
    ink = doc.get(INK, type=Map)
    with doc.transaction():
        for i, s in enumerate(strokes):
            sid = f"example-{i:03d}"
            ink[sid] = json.dumps({**s, "id": sid, "at": 1_790_000_000_000 + i})
    return doc.get_update()


def build():
    for n, (title, make) in enumerate(NOTES, 1):
        text, ink = make()
        strokes = ink(layout(text))
        content = with_ink(convert(text), strokes)
        path = write_kdoc("Notes", f"{n:02d} {title}", title, "note", content)
        print(f"  {path.name}  ({len(strokes)} strokes, {len(content)} bytes)")
