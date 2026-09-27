"""Sovereign Office desktop app.

By default it works on its own, like KherveSheet: documents are ``.kdoc``
files on this Mac, edited with Sovereign Office's editor served by a small local
server inside the app (see local_mode.py). It can instead open a Sovereign Office
server (File ▸ Sovereign Office Server…), as native windows onto that server.
"""

import os
import sys
from pathlib import Path

import base64
import binascii
import json
import re
import shutil
import subprocess

from PySide6.QtCore import (
    QBuffer,
    QByteArray,
    QEvent,
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

from sovoffice_desktop import __version__, local_mode, sharing
from sovoffice_desktop.native_menus import DocumentMenus
from sovoffice_desktop.native_menus import install_marker as install_native_menu_marker

APP_NAME = "Sovereign Office"
DEFAULT_SERVER = "http://localhost:3000"
ICON_PATH = Path(__file__).with_name("icon.png")
NET_ERR_ABORTED = -3
# Resolution the print preview's PDF pages are rasterised at for printing.
PRINT_DPI = 300
# SOVOFFICE_DEBUG=1 shows the web page's console messages in the terminal.
DEBUG_CONSOLE = os.environ.get("SOVOFFICE_DEBUG", "") not in ("", "0")

_windows: list["MainWindow"] = []
_profile: QWebEngineProfile | None = None


DOC_PATH = re.compile(
    r"^/docs/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/?$")


def use_local() -> bool:
    """Documents on this Mac (the default), not a Sovereign Office server."""
    return (local_mode.server() is not None
            and QSettings().value("mode", "local", type=str) == "local")


def server_url() -> str:
    if use_local():
        return local_mode.server().origin
    return QSettings().value("serverUrl", DEFAULT_SERVER, type=str)


def doc_id_of(url: QUrl) -> str | None:
    """The document a window shows, if it is a document page."""
    if not is_server_url(url):
        return None
    match = DOC_PATH.match(url.path())
    return match.group(1) if match else None


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
    """Same scheme and host as the server, any port: SOV Sheets runs beside it."""
    return _origin(url)[:2] == _origin(QUrl(server_url()))[:2]


def open_externally(url: QUrl) -> None:
    if url.scheme() in ("http", "https", "mailto"):
        QDesktopServices.openUrl(url)


def open_window(url: QUrl | None = None) -> "MainWindow":
    # A document already open in a window: bring that window forward.
    if url is not None and (doc := doc_id_of(url)):
        for existing in _windows:
            if existing.doc_id() == doc:
                existing.raise_()
                existing.activateWindow()
                return existing
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
        # The toolbar's Paste button (and pasting in an embedded SOV Sheets
        # spreadsheet) reads the clipboard; allow that for the Sovereign Office host
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
        self.setWindowTitle("Sovereign Office server")
        self.setMinimumWidth(460)

        header = QHBoxLayout()
        logo = QLabel()
        logo.setPixmap(QIcon(str(ICON_PATH)).pixmap(40, 40))
        title = QLabel("<b style='font-size:16px'>Sovereign Office server</b>")
        header.addWidget(logo)
        header.addWidget(title, 1)

        intro = QLabel(
            "Enter the address of the Sovereign Office server to connect to. "
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
        self.on_this_mac = False
        if local_mode.server() is not None:
            mac = QPushButton("Documents on this Mac")
            mac.setToolTip("Work without a server: documents are files on this Mac")
            mac.clicked.connect(self._use_this_mac)
            buttons.addButton(mac, QDialogButtonBox.ButtonRole.ResetRole)
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

    def _use_this_mac(self):
        QSettings().setValue("mode", "local")
        self.on_this_mac = True
        super().accept()

    def accept(self):
        try:
            url = normalise_server_url(self.url_edit.text())
        except ValueError as exc:
            self.error_label.setText(str(exc))
            return
        QSettings().setValue("serverUrl", url)
        QSettings().setValue("mode", "server")
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
        self.page.urlChanged.connect(self._on_url_changed)
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

    # ── Documents on this Mac ────────────────────────────────────────
    def doc_id(self) -> str | None:
        return doc_id_of(self.view.url())

    def _local_file(self) -> Path | None:
        doc = self.doc_id()
        library = local_mode.library()
        if doc is None or library is None or not use_local():
            return None
        file = library.get(doc)
        return file.path if file else None

    def _on_url_changed(self, _url: QUrl):
        path = self._local_file()
        # macOS shows the file's icon in the title bar (⌘-click: its folder).
        self.setWindowFilePath(str(path) if path else "")
        for action in self._file_actions:
            action.setEnabled(path is not None)
        if hasattr(self, "_copy_action"):
            self._copy_action.setEnabled(
                self._server_doc() is not None and local_mode.library() is not None)

    def new_document(self, kind: str = "doc"):
        if not use_local():
            query = f"?kind={kind}" if kind in ("sheet", "slide", "folder") else ""
            self.view.load(QUrl(server_url() + "/docs/new/" + query))
            return
        if kind == "folder":
            # A folder in ~/Documents/Sovereign Office, opened here (it is a list,
            # not a document to keep a window for).
            folder = local_mode.library().create("New folder", kind="folder")
            self.view.load(QUrl(local_mode.server().doc_url(folder)))
            return
        doc = local_mode.library().create(kind=kind)
        target = QUrl(local_mode.server().doc_url(doc))
        if self.doc_id() is None:
            self.view.load(target)
        else:
            open_window(target)

    def add_examples(self):
        """Copy the examples (documents, spreadsheets, slides) into
        ~/Documents/Sovereign Office and show them."""
        server, library = local_mode.server(), local_mode.library()
        source = local_mode.examples_dir()
        if server is None or library is None or source is None:
            return
        try:
            folder = server.call(library.add_examples, source)
        except OSError as exc:
            QMessageBox.warning(self, APP_NAME, f"The examples could not be added: {exc}")
            return
        self.view.load(QUrl(server.doc_url(folder)))

    def open_document(self):
        path, _ = QFileDialog.getOpenFileName(
            self, "Open", str(local_mode.documents_dir()),
            "Sovereign Office documents (*.kdoc)")
        if path:
            open_path(path, self)

    def save_as(self):
        path = self._local_file()
        doc = self.doc_id()
        if path is None or doc is None:
            return
        target, _ = QFileDialog.getSaveFileName(
            self, "Save As", str(path), "Sovereign Office documents (*.kdoc)")
        if not target:
            return
        target_path = Path(target)
        if target_path.suffix.lower() != ".kdoc":
            target_path = target_path.with_suffix(".kdoc")
        if target_path.resolve() == path.resolve():
            return
        server = local_mode.server()
        server.call(server.rooms.flush_doc, doc)
        shutil.copy2(path, target_path)
        local_mode.library().move(doc, target_path)
        server.call(server.rooms.relocate, doc)
        self._on_url_changed(self.view.url())

    def show_in_finder(self):
        path = self._local_file()
        if path is None:
            return
        if sys.platform == "darwin":
            subprocess.run(["open", "-R", str(path)], check=False)
        elif sys.platform.startswith("win"):
            subprocess.run(["explorer", "/select,", str(path)], check=False)
        else:
            QDesktopServices.openUrl(QUrl.fromLocalFile(str(path.parent)))

    def _server_doc(self) -> tuple[str, str] | None:
        """(server origin, document id) when the window shows a document on
        a Sovereign Office server (not one on this computer)."""
        url = self.view.url()
        match = DOC_PATH.match(url.path())
        if not match or doc_id_of(url) is not None:
            return None
        return origin_string(url), match.group(1)

    def share_on_server(self):
        doc = self.doc_id()
        if doc is None or self._local_file() is None:
            return
        kd = sharing.signed_in(_profile, self)
        if kd is None:
            return
        QApplication.setOverrideCursor(Qt.CursorShape.WaitCursor)
        try:
            server_id = sharing.share(kd, local_mode.server(),
                                      local_mode.library(), doc)
        except Exception as exc:  # network, permissions…
            QApplication.restoreOverrideCursor()
            QMessageBox.warning(self, "Share on Sovereign Office",
                                f"The document could not be shared:\n{exc}")
            return
        QApplication.restoreOverrideCursor()
        window = open_window(QUrl(kd.page_url(server_id)))
        QMessageBox.information(
            window, "Shared on Sovereign Office",
            "The document is on Sovereign Office. Use Share in its window to invite "
            "people; they edit it with you, live. Your file on this Mac stays "
            "as it was (File ▸ Save a Copy on this Mac brings the shared "
            "version back).")

    def save_copy_here(self):
        found = self._server_doc()
        if found is None or local_mode.library() is None:
            return
        origin, server_id = found
        kd = sharing.saved_account()
        if kd is None or kd.server.rstrip("/") != origin:
            QSettings().setValue("sharing/server", origin)
            kd = sharing.signed_in(_profile, self, ask_address=False)
        if kd is None:
            return
        QApplication.setOverrideCursor(Qt.CursorShape.WaitCursor)
        try:
            local = sharing.save_copy(kd, local_mode.server(),
                                      local_mode.library(), server_id)
        except Exception as exc:
            QApplication.restoreOverrideCursor()
            QMessageBox.warning(self, "Save a Copy on this Mac",
                                f"The copy could not be made:\n{exc}")
            return
        QApplication.restoreOverrideCursor()
        open_window(QUrl(local_mode.server().doc_url(local)))

    def go_home(self):
        self.view.load(QUrl(server_url() + "/"))

    def ask_for_server(self, error: str = ""):
        self._asking_for_server = True
        try:
            if ServerDialog(self, error).exec() == QDialog.DialogCode.Accepted:
                self.view.load(QUrl(server_url() + "/"))
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
        self._action(file_menu, "New Document", lambda: self.new_document("doc"), "Ctrl+N")
        self._action(file_menu, "New Spreadsheet", lambda: self.new_document("sheet"))
        self._action(file_menu, "New Slides", lambda: self.new_document("slide"))
        self._action(file_menu, "New Folder", lambda: self.new_document("folder"), "Ctrl+Alt+N")
        self._action(file_menu, "Open…", self.open_document, "Ctrl+O")
        self._action(file_menu, "Home", self.go_home, "Ctrl+Shift+H")
        file_menu.addSeparator()
        self._file_actions = [
            self._action(file_menu, "Save As…", self.save_as, "Ctrl+Shift+S"),
            self._action(file_menu, "Show in Finder" if sys.platform == "darwin"
                         else "Show in Folder", self.show_in_finder),
            self._action(file_menu, "Share on Sovereign Office…", self.share_on_server),
        ]
        self._copy_action = self._action(
            file_menu, "Save a Copy on this Mac" if sys.platform == "darwin"
            else "Save a Copy on this Computer", self.save_copy_here)
        self._copy_action.setEnabled(False)
        for action in self._file_actions:
            action.setEnabled(False)
        file_menu.addSeparator()
        self._action(file_menu, "New Window", lambda: open_window(), "Ctrl+Shift+N")
        self._action(
            file_menu, "Sovereign Office Server…", lambda: self.ask_for_server(),
            "Ctrl+,", Role.PreferencesRole,
        )
        file_menu.addSeparator()
        self._action(file_menu, "Close Window", self.close, QKeySequence.StandardKey.Close)
        self._action(
            file_menu, "Quit Sovereign Office", QApplication.quit,
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
        self._action(help_menu, "About Sovereign Office", self._about, role=Role.AboutRole)
        self._action(help_menu, "Check for Updates…", check_for_updates,
                     role=Role.ApplicationSpecificRole)
        if local_mode.examples_dir() is not None:
            self._action(help_menu, "Add the Examples Folder", self.add_examples)

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
            self._devtools.setWindowTitle("Sovereign Office developer tools")
            self._devtools.resize(1000, 700)
            self._devtools.destroyed.connect(lambda: setattr(self, "_devtools", None))
            self.destroyed.connect(self._devtools.close)
            self.page.setDevToolsPage(self._devtools.page())
        self._devtools.show()
        self._devtools.raise_()

    def _about(self):
        QMessageBox.about(
            self,
            "About Sovereign Office",
            f"<h3>Sovereign Office {__version__}</h3>"
            "<p>Collaborative documents, in real time.</p>"
            + (f"<p>Documents on this Mac, in {local_mode.documents_dir()}</p>"
               if use_local() else f"<p>Server: {server_url()}</p>") +
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
    profile = QWebEngineProfile("sovoffice", parent)
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


_updater = None


def update_manager(window=None):
    """The app's updater (Sovereign Office releases on GitHub), built on demand."""
    global _updater
    if _updater is None:
        from sovoffice_desktop.updater import UpdateManager
        _updater = UpdateManager(window or (_windows[0] if _windows else None))
    return _updater


def check_for_updates():
    update_manager(QApplication.activeWindow()).check_now()


def open_path(path: str, parent=None) -> "MainWindow | None":
    """Open a .kdoc file in a window (the one already showing it, if any)."""
    library = local_mode.library()
    if library is None:
        return None
    try:
        doc = library.open_path(Path(path))
    except Exception as exc:  # not a Sovereign Office document, unreadable…
        QMessageBox.warning(parent, APP_NAME, f"Could not open {path}:\n{exc}")
        return None
    if not use_local():
        QSettings().setValue("mode", "local")
    target = QUrl(local_mode.server().doc_url(doc))
    # A window still on the home page can show it.
    for window in _windows:
        if window.doc_id() is None and is_server_url(window.view.url()):
            window.view.load(target)
            window.raise_()
            return window
    return open_window(target)


class Application(QApplication):
    """Opens the files Finder hands over (double-click, drag onto the icon)."""

    def __init__(self, argv):
        super().__init__(argv)
        self.pending_files: list[str] = []
        self.started = False

    def event(self, e):
        if e.type() == QEvent.Type.FileOpen:
            path = e.file()
            if path and local_mode.is_document_file(path):
                if self.started:
                    open_path(path)
                else:
                    self.pending_files.append(path)
            return True
        return super().event(e)


def _add_examples_once() -> None:
    """The first time the app runs, ~/Documents/Sovereign Office gets an Examples
    folder (Help ▸ Add the Examples Folder adds it again)."""
    settings = QSettings()
    library, source = local_mode.library(), local_mode.examples_dir()
    if settings.value("examplesAdded", False, type=bool) or not library or not source:
        return
    if not (library.documents_dir / "Examples").exists():
        library.add_examples(source)
    settings.setValue("examplesAdded", True)


def main() -> int:
    global _profile
    QApplication.setApplicationName(APP_NAME)
    QApplication.setOrganizationName("SovOffice")
    QApplication.setApplicationVersion(__version__)
    from sovoffice_desktop.certs import ensure_ca_bundle
    ensure_ca_bundle()
    app = Application(sys.argv)
    app.setWindowIcon(QIcon(str(ICON_PATH)))

    from sovoffice_desktop.splash import Splash
    splash = Splash()
    splash.show()
    splash.step("Starting")

    if local_mode.available():
        splash.step("Opening your documents")
        try:
            local_mode.start()
            _add_examples_once()
        except Exception as exc:  # the app still works with a server
            QMessageBox.warning(None, APP_NAME,
                                f"Documents on this Mac are unavailable: {exc}")
        app.aboutToQuit.connect(local_mode.stop)

    _profile = create_profile(app)
    files = [a for a in sys.argv[1:] if local_mode.is_document_file(a)]
    app.processEvents()   # Finder's open-file event arrives here
    files += app.pending_files
    app.started = True
    window = None
    for path in files:
        window = open_path(path) or window
    if window is None:
        window = open_window()

    # The splash goes once the first page has loaded (or after a while).
    splash.step("Loading the editor")

    def ready(*_):
        if splash.isVisible():
            splash.step("Ready")
            splash.finish(window)

    window.page.loadFinished.connect(ready)
    QTimer.singleShot(20000, ready)

    # A quiet check for a newer version (installed app only, daily at most).
    try:
        update_manager(window).start_background_check()
    except Exception:  # an updater that cannot start never blocks the app
        pass

    if capture_path := os.environ.get("SOVOFFICE_CAPTURE"):
        _schedule_capture(window, capture_path, int(os.environ.get("SOVOFFICE_CAPTURE_DELAY", "15000")))

    return app.exec()
