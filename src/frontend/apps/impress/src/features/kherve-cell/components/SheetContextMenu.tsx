/** The right-click menu of the grid: row/column changes, sort, freeze. */
import { useEffect, useRef } from 'react';

export interface MenuItem {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  separatorAfter?: boolean;
}

export const SheetContextMenu = ({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}) => {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const close = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) {
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', onClose);
    ref.current?.querySelector('button')?.focus();
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  // Keep the menu on screen.
  const left = Math.min(x, window.innerWidth - 240);
  const top = Math.min(y, window.innerHeight - items.length * 30 - 16);

  return (
    <div
      ref={ref}
      className="kc-menu"
      role="menu"
      style={{ left, top }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item) => (
        <div key={item.label}>
          <button
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              onClose();
              item.onClick();
            }}
          >
            {item.label}
          </button>
          {item.separatorAfter && <hr />}
        </div>
      ))}
    </div>
  );
};

export const menuCss = `
  .kc-menu {
    position: fixed;
    z-index: 1000;
    min-width: 220px;
    padding: 4px 0;
    background: #fff;
    border: 1px solid #d6d9e0;
    border-radius: 6px;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
    font: 13px var(--c--globals--font--families--base, sans-serif);
  }
  .kc-menu button {
    display: block;
    width: 100%;
    padding: 6px 14px;
    border: 0;
    background: none;
    text-align: left;
    font: inherit;
    color: #222;
    cursor: pointer;
  }
  .kc-menu button:hover:not(:disabled),
  .kc-menu button:focus-visible { background: #eef2fb; outline: none; }
  .kc-menu button:disabled { color: #aaa; cursor: default; }
  .kc-menu hr { margin: 4px 0; border: 0; border-top: 1px solid #e6e8ee; }
`;
