/**
 * KherveCELL: an Excel-style spreadsheet inside KherveDOC. The toolbar goes
 * to the window's toolbar slot; below come the formula bar, the grid and the
 * sheet tabs.
 */
import type { HocuspocusProvider } from '@hocuspocus/provider';
import {
  ClipboardEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';

import { useStyleElement } from '@/docs/doc-editor/page-setup/useStyleElement';

import { useCellPresence, useSheetWorkbook } from '../hooks';
import { CellFormat, address, parseAddress } from '../model/layout';
import { fromTsv, shiftFormula, toTsv } from '../model/shift';
import type { SheetWorkbook } from '../model/workbook';

import {
  CellPos,
  Selection,
  SheetGrid,
  gridCss,
  selectionRange,
} from './SheetGrid';
import { SheetTabs, tabsCss } from './SheetTabs';
import { SheetToolbar } from './SheetToolbar';

interface SheetEditorProps {
  provider: HocuspocusProvider;
  synced: boolean;
  readOnly: boolean;
  userName: string;
  userColor: string;
}

type EditMode = 'enter' | 'edit';

interface Clip {
  tsv: string;
  sheetId: string;
  top: number;
  left: number;
  sources: string[][];
}

const START: Selection = {
  anchor: { row: 0, col: 0 },
  focus: { row: 0, col: 0 },
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export const SheetEditor = ({
  provider,
  synced,
  readOnly,
  userName,
  userColor,
}: SheetEditorProps) => {
  const { t } = useTranslation();
  const { workbook, version } = useSheetWorkbook(provider, !readOnly, synced);
  useStyleElement(gridCss + tabsCss + editorCss);

  if (!workbook) {
    return null;
  }
  return (
    <SheetWorkbookView
      workbook={workbook}
      version={version}
      provider={provider}
      synced={synced}
      readOnly={readOnly}
      userName={userName}
      userColor={userColor}
      loadingText={t('Starting the calculation engine…')}
    />
  );
};

const SheetWorkbookView = ({
  workbook,
  version,
  provider,
  readOnly,
  userName,
  userColor,
  loadingText,
}: SheetEditorProps & {
  workbook: SheetWorkbook;
  version: number;
  loadingText: string;
}) => {
  const { t } = useTranslation();
  const sheets = useMemo(
    () => workbook.sheets(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workbook, version],
  );
  const [sheetId, setSheetId] = useState<string>();
  const [selection, setSelection] = useState<Selection>(START);
  const [editing, setEditing] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<EditMode>('enter');
  const [editOrigin, setEditOrigin] = useState<'cell' | 'bar'>('cell');
  const [nameBox, setNameBox] = useState<string | null>(null);
  const editorRef = useRef<HTMLInputElement | null>(null);
  const barRef = useRef<HTMLInputElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const clip = useRef<Clip | null>(null);
  const picked = useRef<{ start: number; end: number } | null>(null);

  // The active sheet: the chosen one while it exists, else the first.
  const sheet = sheets.find((s) => s.id === sheetId) ?? sheets[0];
  const activeId = sheet?.id;
  const rows = sheet?.meta.rows ?? 1;
  const cols = sheet?.meta.cols ?? 1;
  const { focus } = selection;

  const others = useCellPresence(
    provider,
    useMemo(
      () =>
        activeId
          ? {
              sheetId: activeId,
              row: focus.row,
              col: focus.col,
              name: userName,
              color: userColor,
            }
          : undefined,
      [activeId, focus.row, focus.col, userName, userColor],
    ),
  );
  const presence = others.filter((p) => p.sheetId === activeId);

  const source = activeId
    ? workbook.source(activeId, focus.row, focus.col)
    : '';
  const format = activeId
    ? workbook.format(activeId, focus.row, focus.col)
    : undefined;

  useEffect(() => {
    if (editing !== null && editOrigin === 'cell') {
      editorRef.current?.focus();
    }
  }, [editing === null, editOrigin]); // eslint-disable-line react-hooks/exhaustive-deps

  const focusGrid = () => gridRef.current?.focus();

  // ── Selection ────────────────────────────────────────────────────
  const select = useCallback(
    (next: Selection) =>
      setSelection({
        anchor: {
          row: clamp(next.anchor.row, 0, rows - 1),
          col: clamp(next.anchor.col, 0, cols - 1),
        },
        focus: {
          row: clamp(next.focus.row, 0, rows - 1),
          col: clamp(next.focus.col, 0, cols - 1),
        },
      }),
    [rows, cols],
  );

  const moveTo = (pos: CellPos, extend = false) =>
    select({ anchor: extend ? selection.anchor : pos, focus: pos });

  const selectedCells = (): [number, number][] => {
    const r = selectionRange(selection);
    const cells: [number, number][] = [];
    for (let row = r.top; row <= r.bottom; row++) {
      for (let col = r.left; col <= r.right; col++) {
        cells.push([row, col]);
      }
    }
    return cells;
  };

  // ── Editing ──────────────────────────────────────────────────────
  const startEdit = (
    value: string,
    mode: EditMode,
    origin: 'cell' | 'bar' = 'cell',
  ) => {
    if (readOnly || !activeId) {
      return;
    }
    picked.current = null;
    setEditMode(mode);
    setEditOrigin(origin);
    setEditing(value);
  };

  const commit = (move?: CellPos) => {
    if (editing !== null && activeId) {
      if (editing !== source) {
        workbook.setCell(activeId, focus.row, focus.col, editing);
      }
    }
    setEditing(null);
    picked.current = null;
    if (move) {
      moveTo(move);
    }
    focusGrid();
  };

  const cancel = () => {
    setEditing(null);
    picked.current = null;
    focusGrid();
  };

  const onEditChange = (value: string) => {
    picked.current = null;
    setEditing(value);
  };

  /** Point mode: write the clicked cell (or range) into the formula. */
  const pickReference = (from: CellPos, to?: CellPos) => {
    if (editing === null) {
      return;
    }
    const ref =
      to && (to.row !== from.row || to.col !== from.col)
        ? `${address(Math.min(from.row, to.row), Math.min(from.col, to.col))}:${address(Math.max(from.row, to.row), Math.max(from.col, to.col))}`
        : address(from.row, from.col);
    const input = editOrigin === 'bar' ? barRef.current : editorRef.current;
    let start: number;
    let end: number;
    if (picked.current) {
      ({ start, end } = picked.current);
    } else {
      start = input?.selectionStart ?? editing.length;
      end = input?.selectionEnd ?? start;
    }
    const value = editing.slice(0, start) + ref + editing.slice(end);
    picked.current = { start, end: start + ref.length };
    setEditMode('edit');
    setEditing(value);
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + ref.length, start + ref.length);
    });
  };

  const onEditorKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const { key, shiftKey } = event;
    if (key === 'Enter') {
      event.preventDefault();
      commit({ row: focus.row + (shiftKey ? -1 : 1), col: focus.col });
    } else if (key === 'Tab') {
      event.preventDefault();
      commit({ row: focus.row, col: focus.col + (shiftKey ? -1 : 1) });
    } else if (key === 'Escape') {
      event.preventDefault();
      cancel();
    } else if (
      editMode === 'enter' &&
      !(editing ?? '').startsWith('=') &&
      key.startsWith('Arrow')
    ) {
      // Typing over a cell: arrows accept and move, as in Excel.
      event.preventDefault();
      const d = {
        ArrowUp: [-1, 0],
        ArrowDown: [1, 0],
        ArrowLeft: [0, -1],
        ArrowRight: [0, 1],
      }[key] as [number, number];
      commit({ row: focus.row + d[0], col: focus.col + d[1] });
    }
  };

  // ── Keyboard on the grid ─────────────────────────────────────────
  const usedEdge = (dRow: number, dCol: number): CellPos => {
    if (!activeId) {
      return focus;
    }
    // Ctrl+arrow: to the last filled cell in that direction, else the edge.
    let row = focus.row;
    let col = focus.col;
    let last = focus;
    while (
      row + dRow >= 0 &&
      row + dRow < rows &&
      col + dCol >= 0 &&
      col + dCol < cols
    ) {
      row += dRow;
      col += dCol;
      if (workbook.text(activeId, row, col) !== '') {
        last = { row, col };
      }
    }
    return last.row === focus.row && last.col === focus.col
      ? { row, col }
      : last;
  };

  const onGridKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (editing !== null || !activeId) {
      return;
    }
    const { key, shiftKey } = event;
    const mod = event.ctrlKey || event.metaKey;
    const arrows: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    if (arrows[key]) {
      event.preventDefault();
      const [dr, dc] = arrows[key];
      const target = mod
        ? usedEdge(dr, dc)
        : { row: focus.row + dr, col: focus.col + dc };
      moveTo(target, shiftKey);
      return;
    }
    if (mod) {
      const lower = key.toLowerCase();
      if (lower === 'z' && !shiftKey) {
        event.preventDefault();
        workbook.undo();
      } else if (lower === 'y' || (lower === 'z' && shiftKey)) {
        event.preventDefault();
        workbook.redo();
      } else if (lower === 'a') {
        event.preventDefault();
        select({
          anchor: { row: 0, col: 0 },
          focus: { row: rows - 1, col: cols - 1 },
        });
      } else if (['b', 'i', 'u'].includes(lower) && !readOnly) {
        event.preventDefault();
        const flag = ({ b: 'bold', i: 'italic', u: 'underline' } as const)[
          lower as 'b' | 'i' | 'u'
        ];
        toggleFormat(flag);
      } else if (key === 'Home') {
        event.preventDefault();
        moveTo({ row: 0, col: 0 }, shiftKey);
      }
      return;
    }
    switch (key) {
      case 'Enter':
        event.preventDefault();
        moveTo({ row: focus.row + (shiftKey ? -1 : 1), col: focus.col });
        return;
      case 'Tab':
        event.preventDefault();
        moveTo({ row: focus.row, col: focus.col + (shiftKey ? -1 : 1) });
        return;
      case 'Home':
        event.preventDefault();
        moveTo({ row: focus.row, col: 0 }, shiftKey);
        return;
      case 'PageDown':
      case 'PageUp':
        event.preventDefault();
        moveTo(
          { row: focus.row + (key === 'PageDown' ? 20 : -20), col: focus.col },
          shiftKey,
        );
        return;
      case 'F2':
        event.preventDefault();
        startEdit(source, 'edit');
        return;
      case 'Delete':
      case 'Backspace':
        event.preventDefault();
        if (readOnly) {
          return;
        }
        if (
          key === 'Backspace' &&
          selection.anchor.row === focus.row &&
          selection.anchor.col === focus.col
        ) {
          startEdit('', 'enter');
          return;
        }
        workbook.setCells(
          selectedCells().map(([r, c]) => [activeId, r, c, ''] as const),
        );
        return;
      default:
      // Printable keys reach the grid's text sink, which starts editing
      // with whatever was typed (see onTypedText).
    }
  };

  const onTypedText = (text: string) => {
    if (editing !== null) {
      setEditing(editing + text); // typed before the editor took focus
    } else {
      startEdit(text, 'enter');
    }
  };

  // ── Formatting ───────────────────────────────────────────────────
  const setFormat = (patch: Partial<CellFormat> | null) => {
    if (!readOnly && activeId) {
      workbook.setFormat(activeId, selectedCells(), patch);
    }
  };

  const toggleFormat = (flag: 'bold' | 'italic' | 'underline') =>
    setFormat({ [flag]: !format?.[flag] });

  // ── Clipboard ────────────────────────────────────────────────────
  const copy = (event: ClipboardEvent<HTMLDivElement>, cut: boolean) => {
    if (editing !== null || !activeId) {
      return;
    }
    event.preventDefault();
    const r = selectionRange(selection);
    const texts: string[][] = [];
    const sources: string[][] = [];
    for (let row = r.top; row <= r.bottom; row++) {
      texts.push([]);
      sources.push([]);
      for (let col = r.left; col <= r.right; col++) {
        texts[texts.length - 1].push(workbook.text(activeId, row, col));
        sources[sources.length - 1].push(workbook.source(activeId, row, col));
      }
    }
    const tsv = toTsv(texts);
    event.clipboardData.setData('text/plain', tsv);
    clip.current = {
      tsv,
      sheetId: activeId,
      top: r.top,
      left: r.left,
      sources,
    };
    if (cut && !readOnly) {
      workbook.setCells(
        selectedCells().map(
          ([row, col]) =>
            [activeId, row, col, ''] as [string, number, number, string],
        ),
      );
    }
  };

  const paste = (event: ClipboardEvent<HTMLDivElement>) => {
    if (editing !== null || readOnly || !activeId) {
      return;
    }
    event.preventDefault();
    const text = event.clipboardData.getData('text/plain');
    const r = selectionRange(selection);
    const edits: [string, number, number, string][] = [];
    const ours =
      clip.current && clip.current.tsv === text ? clip.current : null;
    const block = ours ? ours.sources : fromTsv(text);
    block.forEach((line, i) =>
      line.forEach((value, j) => {
        const row = r.top + i;
        const col = r.left + j;
        const src = ours
          ? shiftFormula(value, row - (ours.top + i), col - (ours.left + j))
          : value;
        edits.push([activeId, row, col, src]);
      }),
    );
    workbook.setCells(edits);
    select({
      anchor: { row: r.top, col: r.left },
      focus: {
        row: r.top + block.length - 1,
        col: r.left + Math.max(...block.map((l) => l.length)) - 1,
      },
    });
  };

  // ── Rendering ────────────────────────────────────────────────────
  if (!activeId) {
    return <div className="kc-loading">{loadingText}</div>;
  }
  const range = selectionRange(selection);
  const rangeLabel =
    range.top === range.bottom && range.left === range.right
      ? address(focus.row, focus.col)
      : `${address(range.top, range.left)}:${address(range.bottom, range.right)}`;

  return (
    <div className="kc-editor-root">
      {!readOnly && (
        <SheetToolbar
          format={format}
          canUndo={workbook.undoManager.canUndo()}
          canRedo={workbook.undoManager.canRedo()}
          onUndo={() => workbook.undo()}
          onRedo={() => workbook.redo()}
          onToggle={toggleFormat}
          onFormat={setFormat}
        />
      )}
      <div className="kc-formula-bar">
        <input
          className="kc-name-box"
          aria-label={t('Cell address')}
          value={nameBox ?? rangeLabel}
          onFocus={(e) => {
            setNameBox(rangeLabel);
            e.target.select();
          }}
          onChange={(e) => setNameBox(e.target.value)}
          onBlur={() => setNameBox(null)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const [a, b] = (nameBox ?? '').split(':');
              const from = parseAddress(a ?? '');
              const to = b ? parseAddress(b) : from;
              if (from && to) {
                select({ anchor: from, focus: to });
              }
              setNameBox(null);
              focusGrid();
            } else if (e.key === 'Escape') {
              setNameBox(null);
              focusGrid();
            }
          }}
        />
        <span className="kc-fx" aria-hidden>
          fx
        </span>
        <input
          ref={barRef}
          className="kc-formula-input"
          aria-label={t('Formula')}
          readOnly={readOnly}
          value={editing ?? source}
          onFocus={() => {
            if (editing === null && !readOnly) {
              startEdit(source, 'edit', 'bar');
            }
          }}
          onChange={(e) => onEditChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit({ row: focus.row + 1, col: focus.col });
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancel();
            }
          }}
        />
      </div>
      {!workbook.calculated && (
        <div className="kc-loading-bar">{loadingText}</div>
      )}
      <div
        className="kc-grid-wrap"
        onCopy={(e) => copy(e, false)}
        onCut={(e) => copy(e, true)}
        onPaste={paste}
      >
        <SheetGrid
          workbook={workbook}
          version={version}
          sheetId={activeId}
          rows={rows}
          cols={cols}
          selection={selection}
          editing={editOrigin === 'cell' ? editing : null}
          editorRef={editorRef}
          gridRef={gridRef}
          presence={presence}
          readOnly={readOnly}
          onSelect={(next) => {
            if (editing !== null) {
              commit();
            }
            select(next);
          }}
          onStartEdit={() => startEdit(source, 'edit')}
          onEditChange={onEditChange}
          onEditorKeyDown={onEditorKeyDown}
          onGridKeyDown={onGridKeyDown}
          onTypedText={onTypedText}
          onPickReference={pickReference}
        />
      </div>
      <SheetTabs
        sheets={sheets}
        activeId={activeId}
        readOnly={readOnly}
        onSelect={(id) => {
          if (editing !== null) {
            commit();
          }
          setSheetId(id);
          setSelection(START);
        }}
        onAdd={() => {
          const id = workbook.addSheet();
          setSheetId(id);
          setSelection(START);
        }}
        onRename={(id, name) => workbook.renameSheet(id, name)}
        onRemove={(id) => workbook.removeSheet(id)}
        status={
          workbook.error
            ? t('Calculation problem: {{error}}', { error: workbook.error })
            : undefined
        }
      />
    </div>
  );
};

const editorCss = `
  .kc-editor-root {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    width: 100%;
  }
  .kc-formula-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    border-bottom: 1px solid #d6d9e0;
    background: var(--c--contextuals--background--surface--primary, #fff);
  }
  .kc-name-box {
    width: 110px;
    height: 26px;
    box-sizing: border-box;
    border: 1px solid #d6d9e0;
    border-radius: 3px;
    padding: 0 6px;
    font: 13px var(--c--globals--font--families--base, sans-serif);
  }
  .kc-fx {
    font-style: italic;
    font-weight: 600;
    color: #6b7080;
    padding: 0 4px;
  }
  .kc-formula-input {
    flex: 1;
    height: 26px;
    box-sizing: border-box;
    border: 1px solid #d6d9e0;
    border-radius: 3px;
    padding: 0 8px;
    font: 13px var(--c--globals--font--families--code, monospace);
  }
  .kc-grid-wrap {
    display: flex;
    flex: 1;
    min-height: 0;
  }
  .kc-loading, .kc-loading-bar {
    padding: 6px 12px;
    font-size: 13px;
    color: #6b7080;
  }
`;
