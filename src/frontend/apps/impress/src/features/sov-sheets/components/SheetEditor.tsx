/**
 * SOV Sheets: an Excel-style spreadsheet inside Sovereign Office. The toolbar goes
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

import type { DropdownMenuOption } from '@/components';
import type { Menu } from '@/docs/doc-editor/components/SovToolbar/MenuBar';
import { useNativeMenus } from '@/docs/doc-editor/components/SovToolbar/nativeMenus';
import { useStyleElement } from '@/docs/doc-editor/page-setup/useStyleElement';
import { takePendingImport } from '@/docs/doc-import/pendingImport';

import { useCellPresence, useSheetWorkbook } from '../hooks';
import { currentRegion, rangeRef, suggestChart } from '../model/charts';
import { fillEdits } from '../model/fill';
import { CellFormat, address, parseAddress } from '../model/layout';
import { fromTsv, shiftFormula, toTsv } from '../model/shift';
import { type SheetWorkbook, isPython } from '../model/workbook';

import { ChartLayer, chartCss } from './ChartLayer';
import { ChartPanel, chartPanelCss } from './ChartPanel';
import {
  PythonApproval,
  PythonFigures,
  PythonInfo,
  pythonCss,
} from './PythonCells';
import { MenuItem, SheetContextMenu, menuCss } from './SheetContextMenu';
import {
  CellPos,
  ContextTarget,
  Range,
  Selection,
  SheetGrid,
  gridCss,
  selectionRange,
} from './SheetGrid';
import { PrintDialog, printCss } from './SheetPrint';
import { SheetTabs, tabsCss } from './SheetTabs';
import { SheetToolbar } from './SheetToolbar';
import { SolverPanel, solverCss } from './SolverPanel';

interface SheetEditorProps {
  provider: HocuspocusProvider;
  synced: boolean;
  readOnly: boolean;
  userName: string;
  userColor: string;
  /** The document's title (the name of a downloaded .xlsx). */
  title?: string;
}

type EditMode = 'enter' | 'edit';

interface Clip {
  tsv: string;
  sheetId: string;
  top: number;
  left: number;
  sources: string[][];
  formats: (CellFormat | null)[][];
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
  title,
}: SheetEditorProps) => {
  const { t } = useTranslation();
  const { workbook, version } = useSheetWorkbook(provider, !readOnly, synced);
  useStyleElement(
    gridCss +
      tabsCss +
      menuCss +
      chartCss +
      chartPanelCss +
      solverCss +
      pythonCss +
      printCss +
      editorCss,
  );

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
      title={title}
      loadingText={t('Starting the calculation engine…')}
    />
  );
};

const SheetWorkbookView = ({
  workbook,
  version,
  provider,
  synced,
  readOnly,
  userName,
  userColor,
  title,
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
  const [chartId, setChartId] = useState<string | null>(null);
  const [chartPanel, setChartPanel] = useState<string | null>(null);
  const [solverOpen, setSolverOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const xlsxInput = useRef<HTMLInputElement | null>(null);
  const nativeMenus = useRef<Menu[]>([]);
  useNativeMenus(nativeMenus);

  // Ctrl/Cmd+P prints the spreadsheet, not the page around the grid.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setPrinting(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const editorRef = useRef<HTMLInputElement | null>(null);
  const barRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
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
    } else if (editing !== null && editOrigin === 'bar') {
      const bar = barRef.current;
      if (bar && document.activeElement !== bar) {
        bar.focus();
        bar.setSelectionRange(bar.value.length, bar.value.length);
      }
    }
  }, [editing === null, editOrigin, isPython(editing ?? '')]); // eslint-disable-line react-hooks/exhaustive-deps

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
    // Python is written in the formula bar, which takes several lines.
    setEditOrigin(isPython(value) ? 'bar' : origin);
    setEditing(value);
  };

  const commit = (move?: CellPos) => {
    if (editing !== null && /^\s*=PY\s*$/i.test(editing)) {
      // "=PY" alone: now write the code, in the formula bar.
      startEdit('=PY\n', 'edit', 'bar');
      return;
    }
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
          anchor: { row: rows - 1, col: cols - 1 },
          focus: { row: 0, col: 0 },
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
        // Back to the top-left, frozen panes or not.
        gridRef.current?.scrollTo({ top: 0, left: 0 });
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
    const formats: (CellFormat | null)[][] = [];
    for (let row = r.top; row <= r.bottom; row++) {
      texts.push([]);
      sources.push([]);
      formats.push([]);
      for (let col = r.left; col <= r.right; col++) {
        texts[texts.length - 1].push(workbook.text(activeId, row, col));
        sources[sources.length - 1].push(workbook.source(activeId, row, col));
        formats[formats.length - 1].push(
          workbook.format(activeId, row, col) ?? null,
        );
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
      formats,
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
    if (ours) {
      // Copied here: the formats come along, as in Excel.
      workbook.setFormats(
        activeId,
        ours.formats.flatMap((line, i) =>
          line.map(
            (fmt, j) =>
              [r.top + i, r.left + j, fmt] as [
                number,
                number,
                CellFormat | null,
              ],
          ),
        ),
      );
    }
    select({
      anchor: { row: r.top, col: r.left },
      focus: {
        row: r.top + block.length - 1,
        col: r.left + Math.max(...block.map((l) => l.length)) - 1,
      },
    });
  };

  // ── Rows, columns, fill, sort, freeze ────────────────────────────
  const freezeRows = sheet?.meta.freezeRows ?? 0;
  const freezeCols = sheet?.meta.freezeCols ?? 0;

  const insertRows = (before: boolean) => {
    const r = selectionRange(selection);
    const count = r.bottom - r.top + 1;
    if (activeId) {
      workbook.changeStructure(
        activeId,
        'row',
        before ? r.top : r.bottom + 1,
        count,
      );
    }
  };
  const insertCols = (before: boolean) => {
    const r = selectionRange(selection);
    const count = r.right - r.left + 1;
    if (activeId) {
      workbook.changeStructure(
        activeId,
        'col',
        before ? r.left : r.right + 1,
        count,
      );
    }
  };
  const deleteRows = () => {
    const r = selectionRange(selection);
    if (activeId) {
      workbook.changeStructure(activeId, 'row', r.top, -(r.bottom - r.top + 1));
      moveTo({ row: r.top, col: focus.col });
    }
  };
  const deleteCols = () => {
    const r = selectionRange(selection);
    if (activeId) {
      workbook.changeStructure(
        activeId,
        'col',
        r.left,
        -(r.right - r.left + 1),
      );
      moveTo({ row: focus.row, col: r.left });
    }
  };

  /** Sort the selection, or the whole column's data if one cell is chosen. */
  const sort = (descending: boolean) => {
    if (!activeId) {
      return;
    }
    let r = selectionRange(selection);
    if (r.top === r.bottom) {
      // One row selected: sort the block of filled rows around it.
      let top = r.top;
      let bottom = r.top;
      while (top > 0 && workbook.text(activeId, top - 1, focus.col) !== '') {
        top -= 1;
      }
      while (
        bottom < rows - 1 &&
        workbook.text(activeId, bottom + 1, focus.col) !== ''
      ) {
        bottom += 1;
      }
      let left = focus.col;
      let right = focus.col;
      while (left > 0 && workbook.text(activeId, top, left - 1) !== '') {
        left -= 1;
      }
      while (
        right < cols - 1 &&
        workbook.text(activeId, top, right + 1) !== ''
      ) {
        right += 1;
      }
      r = { top, bottom, left, right };
    }
    if (r.bottom - r.top >= 1) {
      workbook.sortRange(activeId, r, focus.col, descending);
    }
  };

  const toggleFreeze = () => {
    if (!activeId) {
      return;
    }
    if (freezeRows || freezeCols) {
      workbook.setFreeze(activeId, 0, 0);
    } else {
      // Freeze the rows above and the columns left of the active cell.
      workbook.setFreeze(activeId, focus.row, focus.col);
    }
  };

  // ── Charts ───────────────────────────────────────────────────────
  /** The selection, or the block of data around the cell (like Excel). */
  const chartSource = () => {
    const r = selectionRange(selection);
    if (!activeId || r.top !== r.bottom || r.left !== r.right) {
      return r;
    }
    return currentRegion(
      (row, col) => workbook.text(activeId, row, col),
      r.top,
      r.left,
      { rows, cols },
    );
  };

  const insertChart = () => {
    if (!activeId || readOnly) {
      return;
    }
    const r = chartSource();
    const empty =
      !workbook.text(activeId, r.top, r.left) &&
      r.top === r.bottom &&
      r.left === r.right;
    const guess = empty
      ? { type: 'Line' as const, series: [] }
      : suggestChart((row, col) => workbook.text(activeId, row, col), r);
    const id = workbook.addChart({
      sheetId: activeId,
      row: r.top,
      col: Math.min(cols - 1, r.right + 2),
      width: 480,
      height: 300,
      ...guess,
    });
    setChartId(id);
    setSolverOpen(false);
    setChartPanel(id);
  };

  const chartFromSelection = () => {
    if (!activeId || !chartPanel) {
      return;
    }
    const { type: _type, ...guess } = suggestChart(
      (row, col) => workbook.text(activeId, row, col),
      chartSource(),
    );
    workbook.updateChart(chartPanel, {
      ...guess,
      title: workbook.chart(chartPanel)?.title || guess.title,
    });
  };

  // ── Excel files ──────────────────────────────────────────────────
  const importXlsx = async (file: File) => {
    setNotice(t('Reading {{name}}…', { name: file.name }));
    try {
      const layout = await workbook.readXlsx(await file.arrayBuffer());
      if (layout.error) {
        setNotice(layout.error);
        return;
      }
      const first = workbook.importLayout(layout);
      if (first) {
        setSheetId(first);
        setSelection(START);
      }
      setNotice(null);
    } catch (error) {
      setNotice(String(error));
    }
  };

  // An Excel file chosen with "Import a file…" before this document existed.
  const pendingChecked = useRef(false);
  useEffect(() => {
    if (pendingChecked.current || readOnly || !synced || !activeId) {
      return;
    }
    pendingChecked.current = true;
    const file = takePendingImport(provider.configuration.name ?? '');
    if (file) {
      void importXlsx(file);
    }
  });

  const downloadXlsx = async () => {
    setNotice(t('Preparing the Excel file…'));
    try {
      const bytes = await workbook.writeXlsx();
      const url = URL.createObjectURL(
        new Blob([bytes], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = `${(title || 'spreadsheet').replace(/[\\/:*?"<>|]/g, '-')}.xlsx`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 10000);
      setNotice(null);
    } catch (error) {
      setNotice(String(error));
    }
  };

  const fill = (source: Range, target: Range) => {
    if (!activeId || readOnly) {
      return;
    }
    const edits = fillEdits(
      (row, col) => workbook.source(activeId, row, col),
      source,
      target,
    );
    workbook.setCells(edits.map((e) => [activeId, e.row, e.col, e.value]));
    workbook.setFormats(
      activeId,
      edits.map((e) => [
        e.row,
        e.col,
        workbook.format(activeId, e.from[0], e.from[1]) ?? null,
      ]),
    );
    select({
      anchor: { row: target.top, col: target.left },
      focus: { row: target.bottom, col: target.right },
    });
  };

  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    target: ContextTarget;
  } | null>(null);

  const menuItems = (target: ContextTarget): MenuItem[] => {
    const r = selectionRange(selection);
    const nRows = r.bottom - r.top + 1;
    const nCols = r.right - r.left + 1;
    const rowItems: MenuItem[] = [
      {
        label: t('Insert {{count}} row(s) above', { count: nRows }),
        onClick: () => insertRows(true),
      },
      {
        label: t('Insert {{count}} row(s) below', { count: nRows }),
        onClick: () => insertRows(false),
      },
      {
        label: t('Delete {{count}} row(s)', { count: nRows }),
        onClick: deleteRows,
        separatorAfter: true,
      },
    ];
    const colItems: MenuItem[] = [
      {
        label: t('Insert {{count}} column(s) left', { count: nCols }),
        onClick: () => insertCols(true),
      },
      {
        label: t('Insert {{count}} column(s) right', { count: nCols }),
        onClick: () => insertCols(false),
      },
      {
        label: t('Delete {{count}} column(s)', { count: nCols }),
        onClick: deleteCols,
        separatorAfter: true,
      },
    ];
    const common: MenuItem[] = [
      { label: t('Sort A → Z'), onClick: () => sort(false) },
      {
        label: t('Sort Z → A'),
        onClick: () => sort(true),
        separatorAfter: true,
      },
      {
        label:
          freezeRows || freezeCols
            ? t('Unfreeze panes')
            : t('Freeze panes here'),
        onClick: toggleFreeze,
      },
      {
        label: t('Clear contents'),
        onClick: () =>
          activeId &&
          workbook.setCells(
            selectedCells().map(
              ([row, col]) =>
                [activeId, row, col, ''] as [string, number, number, string],
            ),
          ),
      },
      {
        label: t('Clear formatting'),
        onClick: () => setFormat(null),
      },
    ];
    if (target === 'row') {
      return [...rowItems, ...common];
    }
    if (target === 'col') {
      return [...colItems, ...common];
    }
    return [...rowItems, ...colItems, ...common];
  };

  // ── Rendering ────────────────────────────────────────────────────
  if (!activeId) {
    return <div className="kc-loading">{loadingText}</div>;
  }
  // The desktop app shows these in its native menu bar.
  const option = (
    label: string,
    callback: () => void,
    extra: Partial<DropdownMenuOption> = {},
  ): DropdownMenuOption => ({ label, callback, ...extra });
  nativeMenus.current = [
    {
      key: 'file',
      label: t('File'),
      options: [
        option(t('Import an Excel file…'), () => xlsxInput.current?.click(), {
          disabled: readOnly,
        }),
        option(t('Download as Excel (.xlsx)'), () => void downloadXlsx(), {
          showSeparator: true,
        }),
        option(t('Print…'), () => setPrinting(true)),
      ],
    },
    {
      key: 'edit',
      label: t('Edit'),
      options: [
        option(t('Undo'), () => workbook.undo(), {
          disabled: readOnly || !workbook.undoManager.canUndo(),
        }),
        option(t('Redo'), () => workbook.redo(), {
          disabled: readOnly || !workbook.undoManager.canRedo(),
          showSeparator: true,
        }),
        option(t('Sort A → Z'), () => sort(false), { disabled: readOnly }),
        option(t('Sort Z → A'), () => sort(true), { disabled: readOnly }),
      ],
    },
    {
      key: 'insert',
      label: t('Insert'),
      options: [
        option(t('Row above'), () => insertRows(true), { disabled: readOnly }),
        option(t('Row below'), () => insertRows(false), { disabled: readOnly }),
        option(t('Column left'), () => insertCols(true), {
          disabled: readOnly,
        }),
        option(t('Column right'), () => insertCols(false), {
          disabled: readOnly,
          showSeparator: true,
        }),
        option(t('Chart'), insertChart, { disabled: readOnly }),
        option(
          t('Sheet'),
          () => {
            setSheetId(workbook.addSheet());
            setSelection(START);
          },
          { disabled: readOnly },
        ),
      ],
    },
    {
      key: 'format',
      label: t('Format'),
      options: [
        option(t('Bold'), () => toggleFormat('bold'), {
          disabled: readOnly,
          isSelected: !!format?.bold,
        }),
        option(t('Italic'), () => toggleFormat('italic'), {
          disabled: readOnly,
          isSelected: !!format?.italic,
        }),
        option(t('Underline'), () => toggleFormat('underline'), {
          disabled: readOnly,
          isSelected: !!format?.underline,
          showSeparator: true,
        }),
        option(
          freezeRows || freezeCols ? t('Unfreeze panes') : t('Freeze panes'),
          toggleFreeze,
          { disabled: readOnly },
        ),
        option(t('Clear formatting'), () => setFormat(null), {
          disabled: readOnly,
        }),
      ],
    },
    {
      key: 'tools',
      label: t('Tools'),
      options: [
        option(
          t('Solver…'),
          () => {
            setChartPanel(null);
            setSolverOpen(true);
          },
          { disabled: readOnly },
        ),
      ],
    },
  ];

  const untrusted = workbook.untrustedPython();
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
          frozen={Boolean(freezeRows || freezeCols)}
          onSort={sort}
          onFreeze={toggleFreeze}
          onInsertChart={insertChart}
          onSolver={() => {
            setChartPanel(null);
            setSolverOpen((open) => !open);
          }}
          solverOpen={solverOpen}
          onImportXlsx={() => xlsxInput.current?.click()}
          onDownloadXlsx={() => void downloadXlsx()}
          onPrint={() => setPrinting(true)}
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
        {isPython(editing ?? source) ? (
          <>
            <textarea
              ref={barRef as React.RefObject<HTMLTextAreaElement | null>}
              className="kc-formula-input"
              aria-label={t('Python code')}
              readOnly={readOnly}
              spellCheck={false}
              rows={Math.min(12, (editing ?? source).split('\n').length)}
              value={editing ?? source}
              onFocus={() => {
                if (editing === null && !readOnly) {
                  startEdit(source, 'edit', 'bar');
                }
              }}
              onChange={(e) => onEditChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  commit({ row: focus.row + 1, col: focus.col });
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  cancel();
                } else if (e.key === 'Tab') {
                  e.preventDefault();
                  const el = e.currentTarget;
                  const at = el.selectionStart;
                  const value = el.value;
                  onEditChange(
                    value.slice(0, at) + '    ' + value.slice(el.selectionEnd),
                  );
                  requestAnimationFrame(() =>
                    el.setSelectionRange(at + 4, at + 4),
                  );
                }
              }}
            />
            <span className="kc-py-hint">{t('Ctrl+Enter to run')}</span>
          </>
        ) : (
          <input
            ref={barRef as React.RefObject<HTMLInputElement | null>}
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
        )}
      </div>
      {editing === null && isPython(source) && (
        <PythonInfo
          error={workbook.pythonError(activeId, focus.row, focus.col)}
          printed={workbook.pythonPrinted(activeId, focus.row, focus.col)}
        />
      )}
      <PythonApproval
        workbook={workbook}
        cells={untrusted}
        sheetName={(id) => sheets.find((s) => s.id === id)?.meta.name ?? id}
      />
      {notice && (
        <div className="kc-loading-bar" role="status">
          {notice}
          <button
            type="button"
            className="kc-notice-close"
            aria-label={t('Close')}
            onClick={() => setNotice(null)}
          >
            ×
          </button>
        </div>
      )}
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
            setChartId(null);
            select(next);
          }}
          onStartEdit={() => startEdit(source, 'edit')}
          onEditChange={onEditChange}
          onEditorKeyDown={onEditorKeyDown}
          onGridKeyDown={onGridKeyDown}
          onTypedText={onTypedText}
          onPickReference={pickReference}
          freezeRows={freezeRows}
          freezeCols={freezeCols}
          onFill={fill}
          onContextMenu={(x, y, target) =>
            !readOnly && setMenu({ x, y, target })
          }
          overlay={(geometry) => (
            <>
              <PythonFigures
                workbook={workbook}
                sheetId={activeId}
                geometry={geometry}
              />
              <ChartLayer
                workbook={workbook}
                sheetId={activeId}
                geometry={geometry}
                rows={rows}
                selectedId={chartId}
                readOnly={readOnly}
                onSelect={(id) => {
                  setChartId(id);
                  if (id === null) {
                    focusGrid();
                  }
                }}
                onEdit={(id) => {
                  setSolverOpen(false);
                  setChartPanel(id);
                }}
              />
            </>
          )}
        />
        {solverOpen && (
          <SolverPanel
            workbook={workbook}
            sheetId={activeId}
            selectionRef={rangeRef(range)}
            activeRef={address(focus.row, focus.col)}
            readOnly={readOnly}
            onClose={() => {
              setSolverOpen(false);
              focusGrid();
            }}
          />
        )}
        {chartPanel && workbook.chart(chartPanel)?.sheetId === activeId && (
          <ChartPanel
            workbook={workbook}
            chartId={chartPanel}
            selectionRef={rangeRef(range)}
            onUseSelection={chartFromSelection}
            onClose={() => {
              setChartPanel(null);
              focusGrid();
            }}
          />
        )}
      </div>
      <input
        ref={xlsxInput}
        type="file"
        hidden
        accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) {
            void importXlsx(file);
          }
        }}
      />
      {printing && (
        <PrintDialog
          workbook={workbook}
          sheetId={activeId}
          selection={range}
          onClose={() => {
            setPrinting(false);
            focusGrid();
          }}
        />
      )}
      {menu && (
        <SheetContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems(menu.target)}
          onClose={() => {
            setMenu(null);
            focusGrid();
          }}
        />
      )}
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
  .kc-notice-close {
    margin-left: 8px;
    border: none;
    background: none;
    cursor: pointer;
  }
  .kc-loading, .kc-loading-bar {
    padding: 6px 12px;
    font-size: 13px;
    color: #6b7080;
  }
`;
