"""The document's menus (File, Edit, View, Insert, Format, Tools, Help) in
the native menu bar: the top bar on macOS, the window's bar elsewhere.

The page publishes its menu model as JSON in ``window.__kherveMenus``
(see ``KherveToolbar/nativeMenus.ts``) once the app has marked it with
``window.__kherveNativeMenus``; this module polls that model, mirrors it
into QMenus, and runs items with ``window.__kherveMenuRun(id)``.
"""

from __future__ import annotations

import json

from PySide6.QtCore import QObject, QTimer
from PySide6.QtGui import QAction
from PySide6.QtWebEngineCore import QWebEngineScript
from PySide6.QtWidgets import QMenu

POLL_MS = 500

# Tells the page to hand its menus over instead of drawing its own bar.
MARKER_SCRIPT = "window.__kherveNativeMenus = true;"

# Page menus merged into the app's own menus of the same name; the others
# get a menu of their own, placed before Help.
MERGED = ("file", "edit", "view", "help")
# Page items the app already provides natively.
SKIPPED_ROLES = {"about", "fullscreen"}


def install_marker(profile) -> None:
    script = QWebEngineScript()
    script.setName("kherve-native-menus")
    script.setSourceCode(MARKER_SCRIPT)
    script.setInjectionPoint(QWebEngineScript.InjectionPoint.DocumentCreation)
    script.setWorldId(QWebEngineScript.ScriptWorldId.MainWorld)
    script.setRunsOnSubFrames(False)
    profile.scripts().insert(script)


def menu_text(label: str) -> str:
    """Qt reads "&" as a mnemonic marker."""
    return label.replace("&", "&&")


class DocumentMenus(QObject):
    """Keeps a window's menu bar in step with the open document's menus."""

    def __init__(self, window, page, app_menus: dict[str, QMenu],
                 native_edit_actions: list[QAction]):
        super().__init__(window)
        self.window = window
        self.page = page
        self.bar = window.menuBar()
        self.app_menus = app_menus
        self.native_edit_actions = native_edit_actions
        self._raw = None
        self._sections: dict[str, list[QAction]] = {}
        self._own_menus: dict[str, QMenu] = {}
        self._signatures: dict[str, tuple] = {}

        self._timer = QTimer(self, interval=POLL_MS)
        self._timer.timeout.connect(self.refresh)
        self._timer.start()
        page.loadStarted.connect(lambda: self._apply([]))

    def refresh(self) -> None:
        self.page.runJavaScript("window.__kherveMenus || null", 0, self._on_model)

    def _on_model(self, raw) -> None:
        if raw == self._raw:
            return
        self._raw = raw
        try:
            menus = json.loads(raw) if raw else []
        except (TypeError, ValueError):
            menus = []
        self._apply(menus if isinstance(menus, list) else [])

    def run(self, item_id: str) -> None:
        self.page.runJavaScript(
            f"window.__kherveMenuRun && window.__kherveMenuRun({json.dumps(item_id)})"
        )

    # ── Building ─────────────────────────────────────────────────────
    def _apply(self, menus: list[dict]) -> None:
        by_key = {menu.get("key"): menu for menu in menus}
        help_action = self.app_menus["help"].menuAction()

        for key in MERGED:
            self._sync_section(key, by_key.get(key))
        for action in self.native_edit_actions:
            # The document's own Undo/Redo know its history; show the
            # browser's generic ones only when there is no document.
            action.setVisible("edit" not in by_key)

        for key in [menu.get("key") for menu in menus]:
            if key in MERGED:
                continue
            menu = by_key[key]
            own = self._own_menus.get(key)
            if own is None:
                own = QMenu(menu_text(menu.get("label", key)), self.bar)
                self.bar.insertMenu(help_action, own)
                self._own_menus[key] = own
            own.setTitle(menu_text(menu.get("label", key)))
            self._sync_items(key, own, menu.get("items", []), before=None)
        for key in list(self._own_menus):
            if key not in by_key:
                own = self._own_menus.pop(key)
                self.bar.removeAction(own.menuAction())
                own.deleteLater()
                self._signatures.pop(key, None)
                self._sections.pop(key, None)

    def _sync_section(self, key: str, menu: dict | None) -> None:
        """The page's items at the top of one of the app's own menus."""
        target = self.app_menus[key]
        items = menu.get("items", []) if menu else []
        items = [item for item in items if item.get("role") not in SKIPPED_ROLES]
        if not items:
            self._clear(key, target)
            return
        own_actions = [a for a in target.actions() if a not in self._sections.get(key, [])]
        before = own_actions[0] if own_actions else None
        # Edit's own items are hidden while a document is open.
        self._sync_items(key, target, items, before=before,
                         trailing_separator=key != "edit")

    def _sync_items(self, key, target: QMenu, items: list[dict], before,
                    trailing_separator: bool = False) -> None:
        signature = tuple(
            (item.get("id"), item.get("label"), item.get("checked") is not None,
             bool(item.get("separatorAfter")))
            for item in items
        )
        actions = self._sections.get(key)
        if actions is not None and self._signatures.get(key) == signature:
            # Same items: only their state changed.
            live = [a for a in actions if not a.isSeparator()]
            for action, item in zip(live, items):
                self._set_state(action, item)
            return

        self._clear(key, target)
        actions = []
        for index, item in enumerate(items):
            action = QAction(menu_text(item.get("label", "")), target)
            item_id = item.get("id", "")
            action.triggered.connect(lambda _=False, i=item_id: self.run(i))
            self._set_state(action, item)
            target.insertAction(before, action)
            actions.append(action)
            last = index == len(items) - 1
            if (item.get("separatorAfter") and not last) or (last and trailing_separator):
                separator = QAction(target)
                separator.setSeparator(True)
                target.insertAction(before, separator)
                actions.append(separator)
        self._sections[key] = actions
        self._signatures[key] = signature

    @staticmethod
    def _set_state(action: QAction, item: dict) -> None:
        checked = item.get("checked")
        action.setCheckable(checked is not None)
        if checked is not None:
            action.setChecked(bool(checked))
        action.setEnabled(bool(item.get("enabled", True)))

    def _clear(self, key: str, target: QMenu) -> None:
        for action in self._sections.pop(key, []):
            target.removeAction(action)
            action.deleteLater()
        self._signatures.pop(key, None)
