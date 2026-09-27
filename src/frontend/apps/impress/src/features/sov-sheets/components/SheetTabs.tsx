/** The sheet tabs under the grid: switch, add, rename (double-click),
 * delete; and a status line. */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Sheet } from '../model/workbook';

interface SheetTabsProps {
  sheets: Sheet[];
  activeId: string;
  readOnly: boolean;
  status?: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, name: string) => boolean;
  onRemove: (id: string) => void;
}

export const SheetTabs = ({
  sheets,
  activeId,
  readOnly,
  status,
  onSelect,
  onAdd,
  onRename,
  onRemove,
}: SheetTabsProps) => {
  const { t } = useTranslation();
  const [renaming, setRenaming] = useState<{
    id: string;
    name: string;
    invalid?: boolean;
  }>();
  const [confirmDelete, setConfirmDelete] = useState<string>();

  const finishRename = () => {
    if (!renaming) {
      return;
    }
    if (onRename(renaming.id, renaming.name)) {
      setRenaming(undefined);
    } else {
      // Empty or already used: keep the box open and say so.
      setRenaming({ ...renaming, invalid: true });
    }
  };

  return (
    <div className="kc-tabs" role="tablist" aria-label={t('Sheets')}>
      {sheets.map(({ id, meta }) =>
        renaming?.id === id ? (
          <input
            key={id}
            className={`kc-tab kc-tab-rename${renaming.invalid ? ' kc-tab-invalid' : ''}`}
            autoFocus
            value={renaming.name}
            aria-label={t('Sheet name')}
            aria-invalid={renaming.invalid}
            title={
              renaming.invalid
                ? t('That sheet name is empty or already used.')
                : undefined
            }
            onChange={(e) => setRenaming({ id, name: e.target.value })}
            onBlur={finishRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                finishRename();
              } else if (e.key === 'Escape') {
                setRenaming(undefined);
              }
            }}
          />
        ) : (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={id === activeId}
            className={`kc-tab${id === activeId ? ' kc-tab-active' : ''}`}
            onClick={() => onSelect(id)}
            onMouseLeave={() => setConfirmDelete(undefined)}
            onDoubleClick={() =>
              !readOnly && setRenaming({ id, name: meta.name })
            }
            title={readOnly ? meta.name : t('Double-click to rename')}
          >
            {meta.name}
            {!readOnly && id === activeId && sheets.length > 1 && (
              <span
                className={`kc-tab-close${confirmDelete === id ? ' kc-tab-confirm' : ''}`}
                role="button"
                aria-label={
                  confirmDelete === id
                    ? t('Click again to delete the sheet {{name}}', {
                        name: meta.name,
                      })
                    : t('Delete sheet {{name}}', { name: meta.name })
                }
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirmDelete === id) {
                    setConfirmDelete(undefined);
                    onRemove(id);
                  } else {
                    setConfirmDelete(id);
                  }
                }}
              >
                {confirmDelete === id ? t('Delete?') : '×'}
              </span>
            )}
          </button>
        ),
      )}
      {!readOnly && (
        <button
          type="button"
          className="kc-tab kc-tab-add"
          aria-label={t('Add a sheet')}
          title={t('Add a sheet')}
          onClick={onAdd}
        >
          +
        </button>
      )}
      {status && <span className="kc-status">{status}</span>}
    </div>
  );
};

export const tabsCss = `
  .kc-tabs {
    display: flex;
    align-items: stretch;
    gap: 2px;
    padding: 0 8px;
    min-height: 32px;
    border-top: 1px solid #d6d9e0;
    background: #f3f4f7;
    overflow-x: auto;
  }
  .kc-tab {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 14px;
    border: 0;
    border-bottom: 3px solid transparent;
    background: transparent;
    font: 13px var(--c--globals--font--families--base, sans-serif);
    color: #444955;
    cursor: pointer;
    white-space: nowrap;
  }
  .kc-tab:hover { background: #e8eaf0; }
  .kc-tab-active {
    background: #fff;
    color: #1f7a4d;
    font-weight: 600;
    border-bottom-color: #1f7a4d;
  }
  .kc-tab-rename {
    width: 120px;
    border: 1px solid #1f4fa3;
    background: #fff;
    cursor: text;
  }
  .kc-tab-close {
    font-size: 15px;
    line-height: 1;
    color: #888;
  }
  .kc-tab-close:hover { color: #c0392b; }
  .kc-tab-confirm {
    font-size: 12px;
    color: #fff;
    background: #c0392b;
    padding: 2px 6px;
    border-radius: 3px;
  }
  .kc-tab-confirm:hover { color: #fff; }
  .kc-tab-invalid { border-color: #c0392b; background: #fdecea; }
  .kc-tab-add { font-size: 18px; padding: 0 10px; }
  .kc-status {
    margin-left: auto;
    align-self: center;
    font-size: 12px;
    color: #b03a2e;
  }
  .kc-color-button {
    position: relative;
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border-radius: 4px;
    cursor: pointer;
  }
  .kc-color-button:hover { background: rgba(0, 0, 0, 0.06); }
  .kc-color-button .material-icons { font-size: 19px; }
  .kc-color-swatch {
    width: 16px;
    height: 3px;
    margin-top: -2px;
    border: 1px solid rgba(0, 0, 0, 0.15);
  }
  .kc-color-button input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }
  .kc-text-button {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: -0.2px;
  }
  .kc-number-format {
    height: 28px;
    border: 1px solid #d6d9e0;
    border-radius: 4px;
    padding: 0 4px;
    font: 13px var(--c--globals--font--families--base, sans-serif);
  }
`;
