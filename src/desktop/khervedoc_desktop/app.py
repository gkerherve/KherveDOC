"""KherveDOC desktop app: native windows onto a KherveDOC server."""

import os
import sys
from pathlib import Path

from PySide6.QtCore import QSettings, Qt, QTimer, QUrl
from PySide6.QtGui import QAction, QDesktopServices, QIcon, QKeySequence
from PySide6.QtWebEngineCore import (
    QWebEngineDownloadRequest,
    QWebEngineLoadingInfo,
    QWebEnginePage,
    QWebEnginePermission,
    QWebEngineProfile,
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

APP_NAME = "KherveDOC"
DEFAULT_SERVER = "http://localhost:3000"
ICON_PATH = Path(__file__).with_name("icon.png")
NET_ERR_ABORTED = -3

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
        # The toolbar's Paste button reads the clipboard; allow that for the
        # KherveDOC server only and refuse everything else.
        if (
            permission.permissionType()
            == QWebEnginePermission.PermissionType.ClipboardReadWrite
            and is_server_url(permission.origin())
        ):
            permission.grant()
        else:
            permission.deny()

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
        self._asking_for_server = False

        self.page.titleChanged.connect(lambda t: self.setWindowTitle(t or APP_NAME))
        self.page.loadingChanged.connect(self._on_loading_changed)
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
                edit_menu.addSeparator()
            else:
                self._action(edit_menu, text, lambda _=False, a=web_action: self.page.triggerAction(a))

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

    def _zoom(self, factor: float):
        self.view.setZoomFactor(max(0.25, min(5.0, self.view.zoomFactor() * factor)))

    def _toggle_full_screen(self):
        self.showNormal() if self.isFullScreen() else self.showFullScreen()

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
