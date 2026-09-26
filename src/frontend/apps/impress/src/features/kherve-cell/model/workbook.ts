/**
 * A KherveCELL workbook: the shared Yjs document (what was typed, formats,
 * sheets, widths) bound to the calculation engine (what each cell shows).
 *
 * Every change, local or from a collaborator, arrives through the Yjs
 * observers, is sent to the engine, and the texts it reports are stored for
 * the grid. Each user's browser computes its own values, like KherveSheet on
 * the desktop, so nobody's results are trusted blindly.
 */
import * as Y from 'yjs';

import type { TextChange } from './engineClient';
import {
  CELLS,
  CellFormat,
  DEFAULT_COLS,
  DEFAULT_ROWS,
  DEFAULT_WIDTH,
  FORMATS,
  SHEETS,
  SheetMeta,
  WIDTHS,
  cellKey,
  newSheetId,
  parseCellKey,
  parseJson,
  parseWidthKey,
  widthKey,
} from './layout';
import { shiftFormula } from './shift';
import { Axis, StructureChange, adjustFormula, moveIndex } from './structure';

/** Transactions made by this window (undoable by this user). */
export const LOCAL_ORIGIN = 'kherve-cell-local';

export interface Engine {
  ready: Promise<void>;
  call<T>(op: string, payload: unknown): Promise<T>;
}

export interface Sheet {
  id: string;
  meta: SheetMeta;
}

type Listener = () => void;

export class SheetWorkbook {
  readonly ySheets: Y.Map<string>;
  readonly yCells: Y.Map<string>;
  readonly yFormats: Y.Map<string>;
  readonly yWidths: Y.Map<number>;
  readonly undoManager: Y.UndoManager;

  /** Monotonic counter the UI subscribes to. */
  version = 0;
  /** The engine has computed the whole workbook at least once. */
  calculated = false;
  /** This window may edit (and so resolves sheet-name clashes). */
  editable = false;
  error?: string;

  private texts = new Map<string, Map<string, string>>();
  private known = new Map<string, SheetMeta>(); // sheets the engine knows
  private numberFormats = new Map<string, string | null>();
  private listeners = new Set<Listener>();
  private pending = {
    sheets: new Set<string>(),
    cells: new Set<string>(),
    formats: new Set<string>(),
  };
  private flushing: Promise<void> = Promise.resolve();
  private scheduled = false;
  private started = false;
  private unobserve: (() => void)[] = [];

  constructor(
    private ydoc: Y.Doc,
    private engine: Engine,
  ) {
    this.ySheets = ydoc.getMap<string>(SHEETS);
    this.yCells = ydoc.getMap<string>(CELLS);
    this.yFormats = ydoc.getMap<string>(FORMATS);
    this.yWidths = ydoc.getMap<number>(WIDTHS);
    this.undoManager = new Y.UndoManager(
      [this.ySheets, this.yCells, this.yFormats, this.yWidths],
      { trackedOrigins: new Set([LOCAL_ORIGIN]), captureTimeout: 400 },
    );
  }

  // ── Lifecycle ────────────────────────────────────────────────────
  /** Follow the shared document and calculate it. */
  async start() {
    if (this.started) {
      return;
    }
    this.started = true;
    const onSheets = (event: Y.YMapEvent<string>) =>
      this.queue('sheets', event.keysChanged as Set<string>);
    const onCells = (event: Y.YMapEvent<string>) =>
      this.queue('cells', event.keysChanged as Set<string>);
    const onFormats = (event: Y.YMapEvent<string>) =>
      this.queue('formats', event.keysChanged as Set<string>);
    const onWidths = () => this.notify();
    this.ySheets.observe(onSheets);
    this.yCells.observe(onCells);
    this.yFormats.observe(onFormats);
    this.yWidths.observe(onWidths);
    this.unobserve = [
      () => this.ySheets.unobserve(onSheets),
      () => this.yCells.unobserve(onCells),
      () => this.yFormats.unobserve(onFormats),
      () => this.yWidths.unobserve(onWidths),
    ];
    await this.recalculateAll();
  }

  /**
   * Give a brand-new spreadsheet its first sheet. Call only once the
   * document is in sync with the server, so an existing spreadsheet is
   * never mistaken for an empty one.
   */
  ensureFirstSheet() {
    if (this.ySheets.size === 0) {
      this.ydoc.transact(() => {
        this.ySheets.set(newSheetId(), this.metaJson('Sheet1', 0));
      }, 'kherve-cell-init');
    }
    this.resolveNameClashes();
  }

  /**
   * Two people adding a sheet at the same moment can pick the same name.
   * Every editor resolves it the same way: the sheet with the smaller id
   * keeps the name, the others get " (2)", " (3)"…
   */
  resolveNameClashes() {
    const byName = new Map<string, Sheet[]>();
    for (const sheet of this.sheets()) {
      const key = sheet.meta.name.toLowerCase();
      byName.set(key, [...(byName.get(key) ?? []), sheet]);
    }
    const taken = new Set(byName.keys());
    const renames: [string, SheetMeta][] = [];
    byName.forEach((group) => {
      group
        .sort((a, b) => a.id.localeCompare(b.id))
        .slice(1)
        .forEach((sheet) => {
          let n = 2;
          while (taken.has(`${sheet.meta.name} (${n})`.toLowerCase())) {
            n += 1;
          }
          const name = `${sheet.meta.name} (${n})`;
          taken.add(name.toLowerCase());
          renames.push([sheet.id, { ...sheet.meta, name }]);
        });
    });
    if (renames.length) {
      this.ydoc.transact(() => {
        renames.forEach(([id, meta]) =>
          this.ySheets.set(id, JSON.stringify(meta)),
        );
      }, 'kherve-cell-init');
    }
  }

  /** Names the engine can tell apart, even before a clash is resolved. */
  private engineNames() {
    const names = new Map<string, string>();
    const used = new Set<string>();
    for (const { id, meta } of this.sheets().sort((a, b) =>
      a.id.localeCompare(b.id),
    )) {
      let name = meta.name;
      if (used.has(name.toLowerCase())) {
        name = `${meta.name} [${id.slice(0, 6)}]`;
      }
      used.add(name.toLowerCase());
      names.set(id, name);
    }
    return names;
  }

  /** Stop following the shared document. */
  dispose() {
    this.unobserve.forEach((stop) => stop());
    this.unobserve = [];
    this.undoManager.destroy();
    this.listeners.clear();
  }

  /** Recompute the whole workbook from the shared document. */
  async recalculateAll() {
    await this.engine.ready;
    const sheets = this.sheets();
    const names = this.engineNames();
    const payload = {
      sheets: sheets.map(({ id, meta }) => ({
        id,
        name: names.get(id) ?? meta.name,
        cells: [] as [number, number, string][],
        formats: [] as [number, number, string][],
      })),
    };
    const byId = new Map(payload.sheets.map((s) => [s.id, s]));
    this.yCells.forEach((source, key) => {
      const { sheetId, row, col } = parseCellKey(key);
      byId.get(sheetId)?.cells.push([row, col, source]);
    });
    this.numberFormats.clear();
    this.yFormats.forEach((raw, key) => {
      const fmt = parseJson<CellFormat>(raw)?.number_format;
      if (fmt) {
        const { sheetId, row, col } = parseCellKey(key);
        byId.get(sheetId)?.formats.push([row, col, fmt]);
        this.numberFormats.set(key, fmt);
      }
    });
    try {
      const result = await this.engine.call<
        Record<string, [number, number, string][]>
      >('reset', payload);
      this.texts.clear();
      this.known = new Map(sheets.map(({ id, meta }) => [id, meta]));
      for (const [sheetId, cells] of Object.entries(result)) {
        const map = new Map<string, string>();
        for (const [row, col, text] of cells) {
          map.set(`${row},${col}`, text);
        }
        this.texts.set(sheetId, map);
      }
      this.calculated = true;
      this.error = undefined;
    } catch (error) {
      this.error = String(error);
    }
    this.notify();
  }

  // ── Reading ──────────────────────────────────────────────────────
  sheets(): Sheet[] {
    const list: Sheet[] = [];
    this.ySheets.forEach((raw, id) => {
      const meta = parseJson<SheetMeta>(raw);
      if (meta) {
        list.push({ id, meta });
      }
    });
    return list.sort(
      (a, b) => a.meta.order - b.meta.order || a.id.localeCompare(b.id),
    );
  }

  text(sheetId: string, row: number, col: number) {
    return this.texts.get(sheetId)?.get(`${row},${col}`) ?? '';
  }

  source(sheetId: string, row: number, col: number) {
    return this.yCells.get(cellKey(sheetId, row, col)) ?? '';
  }

  format(sheetId: string, row: number, col: number): CellFormat | undefined {
    return parseJson<CellFormat>(this.yFormats.get(cellKey(sheetId, row, col)));
  }

  width(sheetId: string, col: number) {
    return this.yWidths.get(widthKey(sheetId, col)) ?? DEFAULT_WIDTH;
  }

  /** Columns of a sheet with a width other than the default. */
  customWidths(sheetId: string) {
    const widths = new Map<number, number>();
    this.yWidths.forEach((width, key) => {
      const parsed = parseWidthKey(key);
      if (parsed.sheetId === sheetId) {
        widths.set(parsed.col, width);
      }
    });
    return widths;
  }

  // ── Editing ──────────────────────────────────────────────────────
  setCell(sheetId: string, row: number, col: number, source: string) {
    this.setCells([[sheetId, row, col, source]]);
  }

  setCells(edits: [string, number, number, string][]) {
    this.ydoc.transact(() => {
      for (const [sheetId, row, col, source] of edits) {
        const key = cellKey(sheetId, row, col);
        if (source === '') {
          this.yCells.delete(key);
        } else if (this.yCells.get(key) !== source) {
          this.yCells.set(key, source);
        }
        this.grow(sheetId, row, col);
      }
    }, LOCAL_ORIGIN);
  }

  /** Merge *patch* into the formats of *cells*; null clears them. */
  setFormat(
    sheetId: string,
    cells: [number, number][],
    patch: Partial<CellFormat> | null,
  ) {
    this.ydoc.transact(() => {
      for (const [row, col] of cells) {
        const key = cellKey(sheetId, row, col);
        if (patch === null) {
          this.yFormats.delete(key);
          continue;
        }
        const merged: CellFormat = {
          ...(parseJson<CellFormat>(this.yFormats.get(key)) ?? {}),
          ...patch,
        };
        for (const [name, value] of Object.entries(merged)) {
          if (value === undefined || value === null || value === false) {
            delete merged[name];
          }
        }
        if (Object.keys(merged).length) {
          this.yFormats.set(key, JSON.stringify(merged));
        } else {
          this.yFormats.delete(key);
        }
      }
    }, LOCAL_ORIGIN);
  }

  setWidth(sheetId: string, col: number, width: number) {
    this.ydoc.transact(() => {
      const key = widthKey(sheetId, col);
      if (Math.round(width) === DEFAULT_WIDTH) {
        this.yWidths.delete(key);
      } else {
        this.yWidths.set(key, Math.round(width));
      }
    }, LOCAL_ORIGIN);
  }

  addSheet(): string {
    const sheets = this.sheets();
    const names = new Set(sheets.map((s) => s.meta.name.toLowerCase()));
    let n = sheets.length + 1;
    while (names.has(`sheet${n}`)) {
      n += 1;
    }
    const id = newSheetId();
    const order = Math.max(-1, ...sheets.map((s) => s.meta.order)) + 1;
    this.ydoc.transact(() => {
      this.ySheets.set(id, this.metaJson(`Sheet${n}`, order));
    }, LOCAL_ORIGIN);
    return id;
  }

  /** Rename a sheet; false if the name is empty or already used. */
  renameSheet(id: string, name: string): boolean {
    const clean = name.trim();
    const meta = parseJson<SheetMeta>(this.ySheets.get(id));
    if (!clean || !meta) {
      return false;
    }
    if (
      this.sheets().some(
        (s) => s.id !== id && s.meta.name.toLowerCase() === clean.toLowerCase(),
      )
    ) {
      return false;
    }
    this.ydoc.transact(() => {
      this.ySheets.set(id, JSON.stringify({ ...meta, name: clean }));
    }, LOCAL_ORIGIN);
    return true;
  }

  removeSheet(id: string) {
    if (this.sheets().length <= 1) {
      return;
    }
    const prefix = `${id}|`;
    this.ydoc.transact(() => {
      this.ySheets.delete(id);
      for (const map of [this.yCells, this.yFormats, this.yWidths]) {
        for (const key of Array.from(map.keys())) {
          if (key.startsWith(prefix)) {
            map.delete(key);
          }
        }
      }
    }, LOCAL_ORIGIN);
  }

  /** Put formats as they are (paste): null removes a cell's format. */
  setFormats(sheetId: string, entries: [number, number, CellFormat | null][]) {
    this.ydoc.transact(() => {
      for (const [row, col, format] of entries) {
        const key = cellKey(sheetId, row, col);
        if (format && Object.keys(format).length) {
          this.yFormats.set(key, JSON.stringify(format));
        } else {
          this.yFormats.delete(key);
        }
      }
    }, LOCAL_ORIGIN);
  }

  /**
   * Insert (count > 0) or delete (count < 0) rows or columns at *at*.
   * Cells, formats and widths move; every formula in the workbook that
   * points at this sheet is adjusted the way Excel does.
   */
  changeStructure(sheetId: string, axis: Axis, at: number, count: number) {
    const meta = parseJson<SheetMeta>(this.ySheets.get(sheetId));
    if (!meta || count === 0) {
      return;
    }
    const change: StructureChange = { sheet: meta.name, axis, at, count };
    const names = new Map(this.sheets().map((s) => [s.id, s.meta.name]));
    const prefix = `${sheetId}|`;

    this.ydoc.transact(() => {
      // Cells and formats of the sheet move (or go).
      for (const map of [this.yCells, this.yFormats]) {
        const moved: [string, string][] = [];
        for (const [key, value] of Array.from(map.entries())) {
          if (!key.startsWith(prefix)) {
            continue;
          }
          const { row, col } = parseCellKey(key);
          const index = axis === 'row' ? row : col;
          const target = moveIndex(index, at, count);
          if (target === index) {
            continue;
          }
          map.delete(key);
          if (target !== null) {
            moved.push([
              axis === 'row'
                ? cellKey(sheetId, target, col)
                : cellKey(sheetId, row, target),
              value,
            ]);
          }
        }
        moved.forEach(([key, value]) => map.set(key, value));
      }
      // Formulas anywhere that point at the sheet follow.
      for (const [key, source] of Array.from(this.yCells.entries())) {
        if (!source.startsWith('=')) {
          continue;
        }
        const { sheetId: at2 } = parseCellKey(key);
        const adjusted = adjustFormula(source, names.get(at2) ?? '', change);
        if (adjusted !== source) {
          this.yCells.set(key, adjusted);
        }
      }
      if (axis === 'col') {
        const widths: [number, number][] = [];
        for (const [key, width] of Array.from(this.yWidths.entries())) {
          if (!key.startsWith(prefix)) {
            continue;
          }
          const { col } = parseWidthKey(key);
          const target = moveIndex(col, at, count);
          if (target !== col) {
            this.yWidths.delete(key);
            if (target !== null) {
              widths.push([target, width]);
            }
          }
        }
        widths.forEach(([col, width]) =>
          this.yWidths.set(widthKey(sheetId, col), width),
        );
      }
      const size = axis === 'row' ? 'rows' : 'cols';
      this.ySheets.set(
        sheetId,
        JSON.stringify({ ...meta, [size]: Math.max(1, meta[size] + count) }),
      );
    }, LOCAL_ORIGIN);
  }

  /**
   * Sort the rows of a range by one of its columns. Values, formulas
   * (their relative references follow the row) and formats move together.
   */
  sortRange(
    sheetId: string,
    range: { top: number; bottom: number; left: number; right: number },
    byCol: number,
    descending = false,
  ) {
    const rows: { row: number; key: string | number | null }[] = [];
    for (let row = range.top; row <= range.bottom; row++) {
      const text = this.text(sheetId, row, byCol);
      const number = Number(text.replace(/,/g, ''));
      rows.push({
        row,
        key:
          text === ''
            ? null
            : Number.isNaN(number)
              ? text.toLowerCase()
              : number,
      });
    }
    const compare = (
      a: { key: string | number | null },
      b: { key: string | number | null },
    ) => {
      // Empty cells last; numbers before text, as in Excel.
      if (a.key === null || b.key === null) {
        return a.key === b.key ? 0 : a.key === null ? 1 : -1;
      }
      if (typeof a.key !== typeof b.key) {
        return typeof a.key === 'number' ? -1 : 1;
      }
      const order = a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
      return descending ? -order : order;
    };
    const sorted = [...rows].sort(compare);
    const edits: [string, number, number, string][] = [];
    const formats: [number, number, CellFormat | null][] = [];
    sorted.forEach(({ row: from }, i) => {
      const to = range.top + i;
      for (let col = range.left; col <= range.right; col++) {
        edits.push([
          sheetId,
          to,
          col,
          shiftFormula(this.source(sheetId, from, col), to - from, 0),
        ]);
        formats.push([to, col, this.format(sheetId, from, col) ?? null]);
      }
    });
    this.ydoc.transact(() => {
      this.setCells(edits);
      this.setFormats(sheetId, formats);
    }, LOCAL_ORIGIN);
  }

  /** Keep the first *rows* rows and *cols* columns in view (0: none). */
  setFreeze(sheetId: string, rows: number, cols: number) {
    const meta = parseJson<SheetMeta>(this.ySheets.get(sheetId));
    if (!meta) {
      return;
    }
    this.ydoc.transact(() => {
      this.ySheets.set(
        sheetId,
        JSON.stringify({ ...meta, freezeRows: rows, freezeCols: cols }),
      );
    }, LOCAL_ORIGIN);
  }

  undo() {
    this.undoManager.undo();
  }

  redo() {
    this.undoManager.redo();
  }

  // ── Subscription (for useSyncExternalStore) ──────────────────────
  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getVersion = () => this.version;

  /** Resolves once every queued change has been calculated. */
  settled() {
    return this.flushing;
  }

  // ── Internals ────────────────────────────────────────────────────
  private metaJson(name: string, order: number) {
    const meta: SheetMeta = {
      name,
      order,
      rows: DEFAULT_ROWS,
      cols: DEFAULT_COLS,
    };
    return JSON.stringify(meta);
  }

  /** Editing past the sheet's edge makes the sheet bigger. */
  private grow(sheetId: string, row: number, col: number) {
    const meta = parseJson<SheetMeta>(this.ySheets.get(sheetId));
    if (meta && (row >= meta.rows || col >= meta.cols)) {
      this.ySheets.set(
        sheetId,
        JSON.stringify({
          ...meta,
          rows: Math.max(meta.rows, row + 1),
          cols: Math.max(meta.cols, col + 1),
        }),
      );
    }
  }

  private notify() {
    this.version += 1;
    this.listeners.forEach((listener) => listener());
  }

  private queue(kind: keyof SheetWorkbook['pending'], keys: Set<string>) {
    keys.forEach((key) => this.pending[kind].add(key));
    if (this.scheduled) {
      return;
    }
    this.scheduled = true;
    // One flush per burst of transactions, sheets before cells.
    queueMicrotask(() => {
      this.scheduled = false;
      this.flushing = this.flushing.then(() => this.flush());
    });
  }

  private async flush() {
    if (!this.calculated) {
      return; // the first full calculation will read everything
    }
    const sheets = Array.from(this.pending.sheets);
    if (this.pending.sheets.size && this.editable) {
      this.resolveNameClashes();
    }
    const cells = Array.from(this.pending.cells);
    const formats = Array.from(this.pending.formats);
    this.pending.sheets.clear();
    this.pending.cells.clear();
    this.pending.formats.clear();
    const changes: TextChange[] = [];
    const names = this.engineNames();
    try {
      for (const id of sheets) {
        const meta = parseJson<SheetMeta>(this.ySheets.get(id));
        const before = this.known.get(id);
        if (!meta && before) {
          this.known.delete(id);
          this.texts.delete(id);
          changes.push(
            ...(await this.engine.call<TextChange[]>('remove_sheet', { id })),
          );
        } else if (meta && !before) {
          this.known.set(id, meta);
          this.texts.set(id, new Map());
          changes.push(
            ...(await this.engine.call<TextChange[]>('add_sheet', {
              id,
              name: names.get(id) ?? meta.name,
            })),
          );
        } else if (meta && before && meta.name !== before.name) {
          this.known.set(id, meta);
          changes.push(
            ...(await this.engine.call<TextChange[]>('rename_sheet', {
              id,
              name: names.get(id) ?? meta.name,
            })),
          );
        } else if (meta) {
          this.known.set(id, meta);
        }
      }
      const numberFormats: [string, number, number, string | null][] = [];
      for (const key of formats) {
        const fmt =
          parseJson<CellFormat>(this.yFormats.get(key))?.number_format ?? null;
        if ((this.numberFormats.get(key) ?? null) !== fmt) {
          this.numberFormats.set(key, fmt);
          const { sheetId, row, col } = parseCellKey(key);
          if (this.known.has(sheetId)) {
            numberFormats.push([sheetId, row, col, fmt]);
          }
        }
      }
      if (numberFormats.length) {
        changes.push(
          ...(await this.engine.call<TextChange[]>('set_formats', {
            formats: numberFormats,
          })),
        );
      }
      const edits = cells
        .map((key) => ({ key, ...parseCellKey(key) }))
        .filter(({ sheetId }) => this.known.has(sheetId))
        .map(
          ({ key, sheetId, row, col }) =>
            [sheetId, row, col, this.yCells.get(key) ?? ''] as const,
        );
      if (edits.length) {
        changes.push(
          ...(await this.engine.call<TextChange[]>('set_cells', { edits })),
        );
      }
    } catch (error) {
      this.error = String(error);
    }
    for (const [sheetId, row, col, text] of changes) {
      if (!sheetId) {
        continue;
      }
      let map = this.texts.get(sheetId);
      if (!map) {
        map = new Map();
        this.texts.set(sheetId, map);
      }
      if (text) {
        map.set(`${row},${col}`, text);
      } else {
        map.delete(`${row},${col}`);
      }
    }
    this.notify();
  }
}
