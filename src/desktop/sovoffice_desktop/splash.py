"""Startup splash screen, in the Kherve family style (cf. KherveSheet).

The picture is painted with QPainter at runtime rather than shipped as a
PNG: it stays crisp on any DPI and carries the live version string.
"""

from __future__ import annotations

from pathlib import Path

from PySide6.QtCore import QPointF, QRectF, Qt
from PySide6.QtGui import (
    QColor, QFont, QLinearGradient, QPainter, QPainterPath, QPen, QPixmap,
)
from PySide6.QtWidgets import QApplication, QSplashScreen

from sovoffice_desktop import __version__

APP_NAME = "Sovereign Office"
WIDTH, HEIGHT = 640, 380
_TOP = QColor("#2466b0")
_BOTTOM = QColor("#123a6b")
_ACCENT = QColor("#8fb6e8")
ICON = Path(__file__).with_name("icon.png")


def _page(p: QPainter, rect: QRectF) -> None:
    """A faint sheet of paper with lines of text: what the app is for."""
    corner = rect.width() * 0.22
    sheet = QPainterPath()
    sheet.moveTo(rect.left(), rect.top())
    sheet.lineTo(rect.right() - corner, rect.top())
    sheet.lineTo(rect.right(), rect.top() + corner)
    sheet.lineTo(rect.right(), rect.bottom())
    sheet.lineTo(rect.left(), rect.bottom())
    sheet.closeSubpath()
    p.setPen(Qt.PenStyle.NoPen)
    p.setBrush(QColor(255, 255, 255, 26))
    p.drawPath(sheet)
    fold = QPainterPath()
    fold.moveTo(rect.right() - corner, rect.top())
    fold.lineTo(rect.right() - corner, rect.top() + corner)
    fold.lineTo(rect.right(), rect.top() + corner)
    fold.closeSubpath()
    p.setBrush(QColor(_ACCENT.red(), _ACCENT.green(), _ACCENT.blue(), 90))
    p.drawPath(fold)
    left = rect.left() + rect.width() * 0.12
    width = rect.width() * 0.76
    y = rect.top() + corner + 18
    # A heading, then paragraphs of different lengths.
    lengths = [0.55, None, 1.0, 0.96, 1.0, 0.7, None, 1.0, 0.92, 0.98, 0.5]
    for i, length in enumerate(lengths):
        if length is not None:
            pen = QPen(QColor(255, 255, 255, 120 if i == 0 else 70),
                       5 if i == 0 else 3)
            pen.setCapStyle(Qt.PenCapStyle.RoundCap)
            p.setPen(pen)
            p.drawLine(QPointF(left, y), QPointF(left + width * length, y))
        y += 14 if i else 22


def splash_pixmap(dpr: float = 1.0) -> QPixmap:
    """Render the startup picture at *dpr* device pixels per point."""
    pm = QPixmap(int(WIDTH * dpr), int(HEIGHT * dpr))
    pm.setDevicePixelRatio(dpr)
    pm.fill(Qt.GlobalColor.transparent)
    p = QPainter(pm)
    p.setRenderHint(QPainter.RenderHint.Antialiasing)

    frame = QRectF(0, 0, WIDTH, HEIGHT)
    bg = QLinearGradient(frame.topLeft(), frame.bottomRight())
    bg.setColorAt(0.0, _TOP)
    bg.setColorAt(1.0, _BOTTOM)
    clip = QPainterPath()
    clip.addRoundedRect(frame, 14, 14)
    p.setClipPath(clip)
    p.fillRect(frame, bg)

    _page(p, QRectF(395, 46, 190, 250))

    icon = QPixmap(str(ICON))
    if not icon.isNull():
        size = int(118 * dpr)
        mark = icon.scaled(size, size, Qt.AspectRatioMode.KeepAspectRatio,
                           Qt.TransformationMode.SmoothTransformation)
        mark.setDevicePixelRatio(dpr)
        # The icon is a blue page on white: give it a light tile.
        p.setPen(Qt.PenStyle.NoPen)
        p.setBrush(QColor(255, 255, 255, 235))
        p.drawRoundedRect(QRectF(40, 48, 118, 118), 24, 24)
        p.drawPixmap(QPointF(40, 48), mark)

    p.setPen(QColor("#ffffff"))
    title = QFont()
    title.setPointSizeF(34)
    title.setBold(True)
    p.setFont(title)
    p.drawText(QRectF(40, 180, 400, 54),
               Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter,
               APP_NAME)
    sub = QFont()
    sub.setPointSizeF(12.5)
    p.setFont(sub)
    p.setPen(QColor(255, 255, 255, 215))
    p.drawText(QRectF(42, 234, 340, 44),
               Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignTop,
               "Documents and spreadsheets,\non your own or together")
    small = QFont()
    small.setPointSizeF(9.5)
    p.setFont(small)
    p.setPen(QColor(255, 255, 255, 150))
    p.drawText(QRectF(42, HEIGHT - 34, 300, 20),
               Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter,
               f"Version {__version__}")
    p.drawText(QRectF(WIDTH - 342, HEIGHT - 34, 320, 20),
               Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter,
               "© 2026 Gwilherm Kerherve · based on Docs (MIT)")
    p.end()
    return pm


#: The steps main() reports, in order; the bar advances through them.
STEPS = ("Starting", "Opening your documents", "Loading the editor", "Ready")


class Splash(QSplashScreen):
    """The start-up picture plus a status line and a progress bar."""

    def __init__(self):
        screen = QApplication.primaryScreen()
        ratio = screen.devicePixelRatio() if screen is not None else 1.0
        super().__init__(splash_pixmap(max(1.0, ratio)),
                         Qt.WindowType.WindowStaysOnTopHint)
        # Lets the rounded corners show the desktop, not a black square.
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.step_text = STEPS[0]
        self.fraction = 0.0

    def step(self, text: str) -> None:
        """Show *text* and advance the bar to its place in STEPS."""
        self.step_text = text
        if text in STEPS:
            self.fraction = STEPS.index(text) / (len(STEPS) - 1)
        self.repaint()
        QApplication.processEvents()

    def drawContents(self, p: QPainter) -> None:
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        bar = QRectF(42, HEIGHT - 62, WIDTH - 84, 5)
        p.setPen(Qt.PenStyle.NoPen)
        p.setBrush(QColor(255, 255, 255, 35))
        p.drawRoundedRect(bar, 2.5, 2.5)
        if self.fraction > 0:
            p.setBrush(_ACCENT)
            p.drawRoundedRect(QRectF(bar.x(), bar.y(),
                                     bar.width() * self.fraction,
                                     bar.height()), 2.5, 2.5)
        p.setPen(QColor(255, 255, 255, 200))
        small = QFont()
        small.setPointSizeF(10.5)
        p.setFont(small)
        dots = "" if self.step_text == STEPS[-1] else "…"
        p.drawText(QRectF(42, HEIGHT - 86, 400, 20),
                   Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter,
                   self.step_text + dots)
