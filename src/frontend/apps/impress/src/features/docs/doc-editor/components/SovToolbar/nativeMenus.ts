import { MutableRefObject, useEffect } from 'react';

import type { Menu } from './MenuBar';

/**
 * Hands the document menus to the Sovereign Office desktop app, which shows them
 * in the native menu bar (the macOS top bar, the window's bar on Windows
 * and Linux) instead of the in-page one.
 *
 * The app marks pages with `__kherveNativeMenus`, polls the serialised
 * `__kherveMenus` model and runs items with `__kherveMenuRun(id)`.
 */

export interface NativeMenuItem {
  id: string;
  label: string;
  role?: string;
  enabled: boolean;
  checked: boolean | null;
  separatorAfter: boolean;
}

export interface NativeMenu {
  key: string;
  label: string;
  items: NativeMenuItem[];
}

declare global {
  interface Window {
    __kherveNativeMenus?: boolean;
    __kherveMenus?: string;
    __kherveMenuRun?: (id: string) => boolean;
  }
}

export const hasNativeMenus = () =>
  typeof window !== 'undefined' && window.__kherveNativeMenus === true;

const itemId = (menu: Menu, label: string) => `${menu.key}/${label}`;

export const serializeMenus = (menus: Menu[]): NativeMenu[] =>
  menus.map((menu) => ({
    key: menu.key,
    label: menu.label,
    items: menu.options
      .filter((option) => option.show !== false)
      .map((option) => ({
        id: itemId(menu, option.label),
        label: option.label,
        role: option.value,
        enabled: !option.disabled,
        checked: option.isSelected ?? null,
        separatorAfter: !!option.showSeparator,
      })),
  }));

/** Publishes `menusRef.current` after every render. */
export const useNativeMenus = (menusRef: MutableRefObject<Menu[]>) => {
  useEffect(() => {
    if (!hasNativeMenus()) {
      return;
    }
    const menus = menusRef.current;
    window.__kherveMenus = JSON.stringify(serializeMenus(menus));
    window.__kherveMenuRun = (id: string) => {
      for (const menu of menus) {
        const option = menu.options.find(
          (candidate) => itemId(menu, candidate.label) === id,
        );
        if (option) {
          if (!option.disabled) {
            void option.callback?.();
          }
          return true;
        }
      }
      return false;
    };
  });

  useEffect(
    () => () => {
      if (hasNativeMenus()) {
        window.__kherveMenus = undefined;
        window.__kherveMenuRun = undefined;
      }
    },
    [],
  );
};
