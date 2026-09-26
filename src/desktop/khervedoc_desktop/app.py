"""KherveDOC desktop app: native windows onto a KherveDOC server."""

import os
import sys
from pathlib import Path

import base64
import binascii
import json

from PySide6.QtCore import (
    QBuffer,
    QByteArray,
    QIODevice,
    QMarginsF,
    QSettings,
    QSize,
    QSizeF,
    Qt,
    QTimer,
    QUrl,
)
from PySide6.QtGui import (
    QAction,
    QDesktopServices,
    QIcon,
    QKeySequence,
    QPageLayout,
    QPageSize,
    QPainter,
)
from PySide6.QtPdf import QPdfDocument
from PySide6.QtPrintSupport import QPrintDialog, QPrinter
from PySide6.QtWebEngineCore import (
    QWebEngineDownloadRequest,
    QWebEngineLoadingInfo,
    QWebEnginePage,
    QWebEnginePermission,
    QWebEngineProfile,
    QWebEngineSettings,
)
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWidgets import (
    QApplication,
    QDialog,
    QDialogButtonBox,
    QFileDialog,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QVBoxLayout,
)

from khervedoc_desktop import __version__
from khervedoc_desktop.native_menus import DocumentMenus
from khervedoc_desktop.native_menus import install_marker as install_native_menu_marker

APP_NAME = "KherveDOC"
DEFAULT_SERVER = "http://localhost:3000"
ICON_PATH = Path(__file__).with_name("icon.png")
NET_ERR_ABORTED = -3
# Resolution the print preview's PDF pages are rasterised at for printing.
PRINT_DPI = 300
# KHERVEDOC_DEBUG=1 shows the web page's console messages in the terminal.
DEBUG_CONSOLE = os.environ.get("KHERVEDOC_DEBUG", "") not in ("", "0")

_windows: list["MainWindow"] = []
_profile: QWebEngineProfile | None = None


def server_url() -> str:
    return QSettings().value("serverUrl", DEFAULT_SERVER, type=str)


def origin_string(url: QUrl) -> str:
    port = f":{url.port()}" if url.port() != -1 else ""
    return f"{url.scheme()}://{url.host()}{port}"


def normalise_server_url(value: str) -> str:
    url = QUrl(value.strip())
    if url.scheme() not in ("http", "https") or not url.host():
        raise ValueError("The address must start with http:// or https://")
    return origin_string(url)


def _origin(url: QUrl) -> tuple[str, str, int]:
    default_port = {"http": 80, "https": 443}.get(url.scheme(), -1)
    return url.scheme(), url.host().lower(), url.port(default_port)


def is_server_url(url: QUrl) -> bool:
    return _origin(url) == _origin(QUrl(server_url()))


def is_server_host(url: QUrl) -> bool:
    """Same scheme and host as the server, any port: KherveCELL runs beside it."""
    return _origin(url)[:2] == _origin(QUrl(server_url()))[:2]


def open_externally(url: QUrl) -> None:
    if url.scheme() in ("http", "https", "mailto"):
        QDesktopServices.openUrl(url)


def open_window(url: QUrl | None = None) -> "MainWindow":
    window = MainWindow(url)
    _windows.append(window)
    window.destroyed.connect(lambda: _windows.remove(window))
    window.show()
    return window


class PopupPage(QWebEnginePage):
    """Target of window.open / target=_blank: routes the URL, then goes away."""

    def acceptNavigationRequest(self, url, _type, is_main_frame):
        if is_main_frame and not url.isEmpty() and url.scheme() != "about":
            if is_server_url(url):
                open_window(url)
            else:
                open_externally(url)
            self.deleteLater()
            return False
        return True


class Page(QWebEnginePage):
    def __init__(self, profile, parent=None):
        super().__init__(profile, parent)
        self.permissionRequested.connect(self._on_permission_requested)

    @staticmethod
    def _on_permission_requested(permission: QWebEnginePermission):
        # The toolbar's Paste button (and pasting in an embedded KherveCELL
        # spreadsheet) reads the clipboard; allow that for the KherveDOC host
        # only and refuse everything else.
        if (
            permission.permissionType()
            == QWebEnginePermission.PermissionType.ClipboardReadWrite
            and is_server_host(permission.origin())
        ):
            permission.grant()
        else:
            permission.deny()

    def javaScriptConsoleMessage(self, level, message, line, source):
        # Qt prints every page console message ("js: ...") by default; the
        # web app's development server is chatty, so only show them on
        # request.
        if DEBUG_CONSOLE:
            print(f"js [{level.name}] {source}:{line}: {message}", file=sys.stderr)

    def acceptNavigationRequest(self, url, _type, is_main_frame):
        if not is_main_frame:
            return True
        # Sign-in hops between the app, API and identity-provider origins, so any
        # http(s) top-level navigation stays in the window.
        if url.scheme() in ("http", "https", "about", "data", "blob"):
            return True
        open_externally(url)
        return False

    def createWindow(self, _type):
        return PopupPage(self.profile(), self)


class ServerDialog(QDialog):
    def __init__(self, parent=None, error: str = ""):
        super().__init__(parent)
        self.setWindowTitle("KherveDOC server")
        self.setMinimumWidth(460)

        header = QHBoxLayout()
        logo = QLabel()
        logo.setPixmap(QIcon(str(ICON_PATH)).pixmap(40, 40))
        title = QLabel("<b style='font-size:16px'>KherveDOC server</b>")
        header.addWidget(logo)
        header.addWidget(title, 1)

        intro = QLabel(
            "Enter the address of the KherveDOC server to connect to. "
            "For the local Docker setup use the local server."
        )
        intro.setWordWrap(True)

        self.url_edit = QLineEdit(server_url())
        self.url_edit.setPlaceholderText("https://docs.example.org")
        self.url_edit.selectAll()

        self.error_label = QLabel(error)
        self.error_label.setWordWrap(True)
        self.error_label.setStyleSheet("color: #b3261e")

        buttons = QDialogButtonBox()
        local = QPushButton("Use local server")
        local.clicked.connect(lambda: self.url_edit.setText(DEFAULT_SERVER))
        buttons.addButton(local, QDialogButtonBox.ButtonRole.ResetRole)
        buttons.addButton("Connect", QDialogButtonBox.ButtonRole.AcceptRole)
        buttons.addButton(QDialogButtonBox.StandardButton.Cancel)
        buttons.accepted.connect(self.accept)
        buttons.rejected.connect(self.reject)

        layout = QVBoxLayout(self)
        layout.addLayout(header)
        layout.addWidget(intro)
        layout.addWidget(QLabel("Server address"))
        layout.addWidget(self.url_edit)
        layout.addWidget(self.error_label)
        layout.addWidget(buttons)

    def accept(self):
        try:
            url = normalise_server_url(self.url_edit.text())
        except ValueError as exc:
            self.error_label.setText(str(exc))
            return
        QSettings().setValue("serverUrl", url)
        super().accept()


class MainWindow(QMainWindow):
    def __init__(self, url: QUrl | None = None):
        super().__init__()
        self.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
        self.setWindowTitle(APP_NAME)
        self.resize(1280, 860)
        self.setMinimumSize(720, 500)

        self.view = QWebEngineView(self)
        self.page = Page(_profile, self.view)
        self.view.setPage(self.page)
        self.setCentralWidget(self.view)

        self._devtools: QWebEngineView | None = None
        self._printer: QPrinter | None = None
        self._asking_for_server = False

        self.page.titleChanged.connect(lambda t: self.setWindowTitle(t or APP_NAME))
        self.page.loadingChanged.connect(self._on_loading_changed)
        self.page.printRequested.connect(self._on_print_requested)
        self.view.printFinished.connect(self._on_print_finished)
        self._build_menus()
        self.view.load(url or QUrl(server_url()))

    def _on_loading_changed(self, info: QWebEngineLoadingInfo):
        if (
            info.status() == QWebEngineLoadingInfo.LoadStatus.LoadFailedStatus
            and info.errorDomain() == QWebEngineLoadingInfo.ErrorDomain.ConnectionErrorDomain
            and info.errorCode() != NET_ERR_ABORTED
            and not self._asking_for_server
        ):
            message = f"Could not reach {origin_string(info.url())} ({info.errorString()})."
            QTimer.singleShot(0, lambda: self.ask_for_server(message))

    def ask_for_server(self, error: str = ""):
        self._asking_for_server = True
        try:
            if ServerDialog(self, error).exec() == QDialog.DialogCode.Accepted:
                self.view.load(QUrl(server_url()))
        finally:
            self._asking_for_server = False

    def _action(self, menu, text, slot, shortcut=None, role=None):
        action = QAction(text, self)
        action.triggered.connect(slot)
        if shortcut is not None:
            action.setShortcut(QKeySequence(shortcut))
        if role is not None:
            action.setMenuRole(role)
        menu.addAction(action)
        return action

    def _build_menus(self):
        bar = self.menuBar()
        Role = QAction.MenuRole

        file_menu = bar.addMenu("&File")
        self._action(file_menu, "New Window", lambda: open_window(), "Ctrl+Shift+N")
        self._action(
            file_menu, "Server Settings…", lambda: self.ask_for_server(),
            "Ctrl+,", Role.PreferencesRole,
        )
        file_menu.addSeparator()
        self._action(file_menu, "Close Window", self.close, QKeySequence.StandardKey.Close)
        self._action(
            file_menu, "Quit KherveDOC", QApplication.quit,
            QKeySequence.StandardKey.Quit, Role.QuitRole,
        )

        # No shortcuts here: the editor handles its own keys (its undo history
        # in particular), so menu shortcuts would intercept them.
        edit_menu = bar.addMenu("&Edit")
        native_edit_actions = []
        WebAction = QWebEnginePage.WebAction
        for text, web_action in [
            ("Undo", WebAction.Undo),
            ("Redo", WebAction.Redo),
            (None, None),
            ("Cut", WebAction.Cut),
            ("Copy", WebAction.Copy),
            ("Paste", WebAction.Paste),
            ("Paste and Match Style", WebAction.PasteAndMatchStyle),
            ("Select All", WebAction.SelectAll),
        ]:
            if text is None:
                native_edit_actions.append(edit_menu.addSeparator())
            else:
                native_edit_actions.append(self._action(
                    edit_menu, text, lambda _=False, a=web_action: self.page.triggerAction(a)))

        view_menu = bar.addMenu("&View")
        self._action(view_menu, "Back", self.view.back, QKeySequence.StandardKey.Back)
        self._action(view_menu, "Forward", self.view.forward, QKeySequence.StandardKey.Forward)
        self._action(view_menu, "Reload", self.view.reload, QKeySequence.StandardKey.Refresh)
        view_menu.addSeparator()
        self._action(view_menu, "Actual Size", lambda: self.view.setZoomFactor(1.0), "Ctrl+0")
        self._action(view_menu, "Zoom In", lambda: self._zoom(1.1), QKeySequence.StandardKey.ZoomIn)
        self._action(view_menu, "Zoom Out", lambda: self._zoom(1 / 1.1), QKeySequence.StandardKey.ZoomOut)
        view_menu.addSeparator()
        self._action(view_menu, "Toggle Full Screen", self._toggle_full_screen, QKeySequence.StandardKey.FullScreen)
        self._action(view_menu, "Developer Tools", self._open_devtools, "F12")

        help_menu = bar.addMenu("&Help")
        self._action(help_menu, "About KherveDOC", self._about, role=Role.AboutRole)

        # The open document's File, Edit, View, Insert, Format, Tools and
        # Help items join these menus (see native_menus.py).
        self.document_menus = DocumentMenus(
            self, self.page,
            {"file": file_menu, "edit": edit_menu, "view": view_menu, "help": help_menu},
            native_edit_actions,
        )

    def _zoom(self, factor: float):
        self.view.setZoomFactor(max(0.25, min(5.0, self.view.zoomFactor() * factor)))

    def _toggle_full_screen(self):
        self.showNormal() if self.isFullScreen() else self.showFullScreen()

    def _on_print_requested(self):
        # The page records its page setup (and, from the print preview, the
        # exact PDF to print) before calling window.print().
        self.page.runJavaScript(
            """(() => {
                const request = {
                    setup: window.__khervePageSetup || null,
                    pdf: window.__khervePrintPdf || null,
                };
                window.__khervePrintPdf = undefined;
                return JSON.stringify(request);
            })()""",
            0,
            self._handle_print_request,
        )

    def _handle_print_request(self, raw):
        try:
            request = json.loads(raw) if isinstance(raw, str) else {}
        except ValueError:
            request = {}
        pdf = request.get("pdf") if isinstance(request, dict) else None
        if isinstance(pdf, str) and pdf:
            try:
                self._print_pdf(base64.b64decode(pdf, validate=True))
            except (binascii.Error, ValueError):
                pass
            return
        setup = request.get("setup") if isinstance(request, dict) else None
        self._print_with_page_setup(json.dumps(setup))

    def _print_with_page_setup(self, raw):
        printer = QPrinter(QPrinter.PrinterMode.HighResolution)
        layout = page_layout_from_json(raw)
        if layout is not None:
            apply_page_layout(printer, layout)
        if QPrintDialog(printer, self).exec() != QDialog.DialogCode.Accepted:
            return
        self._printer = printer
        self.view.print(printer)

    def _print_pdf(self, data: bytes):
        """Prints the print preview's PDF page by page, as shown."""
        document = QPdfDocument(self)
        buffer = QBuffer(self)
        buffer.setData(QByteArray(data))
        buffer.open(QIODevice.OpenModeFlag.ReadOnly)
        document.load(buffer)
        if document.pageCount() == 0:
            return

        first = document.pagePointSize(0)
        landscape = first.width() > first.height()
        printer = QPrinter(QPrinter.PrinterMode.HighResolution)
        printer.setFullPage(True)
        apply_page_layout(
            printer,
            QPageLayout(
                # Paper sizes are given portrait; orientation turns them.
                QPageSize(
                    QSizeF(
                        min(first.width(), first.height()),
                        max(first.width(), first.height()),
                    ),
                    QPageSize.Unit.Point,
                ),
                QPageLayout.Orientation.Landscape
                if landscape
                else QPageLayout.Orientation.Portrait,
                QMarginsF(0, 0, 0, 0),
            )
        )
        printer.setDocName(self.windowTitle())
        if QPrintDialog(printer, self).exec() != QDialog.DialogCode.Accepted:
            return

        painter = QPainter(printer)
        try:
            for index in range(document.pageCount()):
                if index:
                    printer.newPage()
                points = document.pagePointSize(index)
                image = document.render(
                    index,
                    QSize(
                        round(points.width() * PRINT_DPI / 72),
                        round(points.height() * PRINT_DPI / 72),
                    ),
                )
                painter.drawImage(
                    printer.paperRect(QPrinter.Unit.DevicePixel), image
                )
        finally:
            painter.end()
            document.deleteLater()
            buffer.deleteLater()

    def _on_print_finished(self, _ok: bool):
        self._printer = None

    def _open_devtools(self):
        if self._devtools is None:
            self._devtools = QWebEngineView()
            self._devtools.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
            self._devtools.setWindowTitle("KherveDOC developer tools")
            self._devtools.resize(1000, 700)
            self._devtools.destroyed.connect(lambda: setattr(self, "_devtools", None))
            self.destroyed.connect(self._devtools.close)
            self.page.setDevToolsPage(self._devtools.page())
        self._devtools.show()
        self._devtools.raise_()

    def _about(self):
        QMessageBox.about(
            self,
            "About KherveDOC",
            f"<h3>KherveDOC {__version__}</h3>"
            "<p>Collaborative documents, in real time.</p>"
            f"<p>Server: {server_url()}</p>"
            "<p>Based on <a href='https://github.com/suitenumerique/docs'>Docs</a> "
            "by DINUM and ZenDiS (MIT licence).</p>",
        )


def apply_page_layout(printer: QPrinter, layout: QPageLayout) -> None:
    """Some printer drivers refuse a whole layout but take its parts."""
    if printer.setPageLayout(layout):
        return
    printer.setPageSize(layout.pageSize())
    printer.setPageOrientation(layout.orientation())
    printer.setPageMargins(layout.margins(), layout.units())


def page_layout_from_json(raw) -> QPageLayout | None:
    """Printer layout from the page setup the web page exposes, if valid."""
    try:
        setup = json.loads(raw) if isinstance(raw, str) else None
        width = float(setup["paperWidthCm"]) * 10
        height = float(setup["paperHeightCm"]) * 10
        margins = {k: float(setup["marginsCm"][k]) * 10 for k in ("left", "top", "right", "bottom")}
    except (TypeError, KeyError, ValueError):
        return None
    if not (50 <= width <= 1000 and 50 <= height <= 1000):
        return None
    orientation = (
        QPageLayout.Orientation.Landscape
        if setup.get("orientation") == "landscape"
        else QPageLayout.Orientation.Portrait
    )
    return QPageLayout(
        QPageSize(QSizeF(width, height), QPageSize.Unit.Millimeter),
        orientation,
        QMarginsF(margins["left"], margins["top"], margins["right"], margins["bottom"]),
        QPageLayout.Unit.Millimeter,
    )


def handle_download(download: QWebEngineDownloadRequest):
    suggested = Path(download.downloadDirectory()) / download.downloadFileName()
    path, _ = QFileDialog.getSaveFileName(
        QApplication.activeWindow(), "Save file", str(suggested)
    )
    if not path:
        download.cancel()
        return
    target = Path(path)
    download.setDownloadDirectory(str(target.parent))
    download.setDownloadFileName(target.name)
    download.accept()


def create_profile(parent) -> QWebEngineProfile:
    profile = QWebEngineProfile("khervedoc", parent)
    profile.setPersistentCookiesPolicy(
        QWebEngineProfile.PersistentCookiesPolicy.ForcePersistentCookies
    )
    profile.downloadRequested.connect(handle_download)
    install_native_menu_marker(profile)
    # The print preview shows its PDF in a frame.
    settings = profile.settings()
    settings.setAttribute(QWebEngineSettings.WebAttribute.PluginsEnabled, True)
    settings.setAttribute(QWebEngineSettings.WebAttribute.PdfViewerEnabled, True)
    return profile


def _schedule_capture(window: MainWindow, path: str, delay_ms: int):
    """Save a screenshot of the first window and quit (used for smoke tests)."""

    def report(summary):
        print(f"page: {summary}", flush=True)
        QApplication.quit()

    def capture():
        window.view.grab().save(path)
        window.page.runJavaScript(
            "JSON.stringify({title: document.title, url: location.href,"
            " text: document.body.innerText.slice(0, 200)})",
            0,
            report,
        )

    window.page.loadFinished.connect(lambda _ok: QTimer.singleShot(delay_ms, capture))


def main() -> int:
    global _profile
    QApplication.setApplicationName(APP_NAME)
    QApplication.setOrganizationName("Kherve")
    QApplication.setApplicationVersion(__version__)
    app = QApplication(sys.argv)
    app.setWindowIcon(QIcon(str(ICON_PATH)))

    _profile = create_profile(app)
    window = open_window()

    if capture_path := os.environ.get("KHERVEDOC_CAPTURE"):
        _schedule_capture(window, capture_path, int(os.environ.get("KHERVEDOC_CAPTURE_DELAY", "15000")))

    return app.exec()
