/**
 * A SOV Sheets workbook: the shared Yjs document (what was typed, formats,
 * sheets, widths) bound to the calculation engine (what each cell shows).
 *
 * Every change, local or from a collaborator, arrives through the Yjs
 * observers, is sent to the engine, and the texts it reports are stored for
 * the grid. Each user's browser computes its own values, like KherveSheet on
 * the desktop, so nobody's results are trusted blindly.
 */
import * as Y from 'yjs';

import { adjustChart } from './charts';
import type { TextChange } from './engineClient';
import {
  CELLS,
  CHARTS,
  CellFormat,
  ChartFit,
  ChartSpec,
  DEFAULT_COLS,
  DEFAULT_ROWS,
  DEFAULT_WIDTH,
  FORMATS,
  ROW_HEIGHT,
  SHEETS,
  SOLVER,
  SheetMeta,
  SolverModel,
  SolverResult,
  WIDTHS,
  XlsxLayout,
  cellKey,
  newSheetId,
  parseCellKey,
  parseJson,
  parseWidthKey,
  widthKey,
} from './layout';
import { shiftFormula } from './shift';
import { adjustSolverModel } from './solver';
import { Axis, StructureChange, adjustFormula, moveIndex } from './structure';

/** Transactions made by this window (undoable by this user). */
export const LOCAL_ORIGIN = 'kherve-cell-local';

const toBase64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(text);
};

const fromBase64 = (data: string) =>
  Uint8Array.from(atob(data), (ch) => ch.charCodeAt(0));

/** =PY sources this user lets run (their SHA-256), kept in the browser. */
const TRUST_KEY = 'kherve-cell-trusted-python';

export const isPython = (source: string) => /^\s*=PY(\s|$)/i.test(source);

const sha256 = async (text: string) => {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
};

const loadTrusted = () => {
  try {
    return new Set<string>(
      JSON.parse(localStorage.getItem(TRUST_KEY) ?? '[]') as string[],
    );
  } catch {
    return new Set<string>();
  }
};

export interface PythonCell {
  sheetId: string;
  row: number;
  col: number;
  source: string;
}

interface PythonOutputs {
  figures: [number, number, string][];
  errors: [number, number, string][];
  stdout: [number, number, string][];
}

export interface Engine {
  ready: Promise<void>;
  call<T>(op: string, payload: unknown, needs?: string[]): Promise<T>;
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
  readonly yCharts: Y.Map<string>;
  readonly ySolver: Y.Map<string>;
  readonly undoManager: Y.UndoManager;

  /** Monotonic counter the UI subscribes to. */
  version = 0;
  /** Changes whenever any cell shows something new (charts redraw). */
  dataVersion = 0;
  /** The engine has computed the whole workbook at least once. */
  calculated = false;
  /** This window may edit (and so resolves sheet-name clashes). */
  editable = false;
  error?: string;

  private texts = new Map<string, Map<string, string>>();
  private known = new Map<string, SheetMeta>(); // sheets the engine knows
  private numberFormats = new Map<string, string | null>();
  private fits = new Map<string, ChartFit[]>();
  /** Python: trusted source hashes, sources typed here (trusted once
   * hashed), the hash of each source seen, and what the cells produced. */
  private trusted = loadTrusted();
  private typedHere = new Set<string>();
  private hashes = new Map<string, string>();
  private pyOutputs: Record<string, PythonOutputs> = {};
  private listeners = new Set<Listener>();
  private pending = {
    sheets: new Set<string>(),
    cells: new Set<string>(),
    formats: new Set<string>(),
  };
  private flushing: Promise<void> = Promise.resolve();
  /** The first full calculation (charts and the Solver wait for it). */
  private firstCalculation: Promise<void> = Promise.resolve();
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
    this.yCharts = ydoc.getMap<string>(CHARTS);
    this.ySolver = ydoc.getMap<string>(SOLVER);
    this.undoManager = new Y.UndoManager(
      [this.ySheets, this.yCells, this.yFormats, this.yWidths, this.yCharts],
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
    const onCells = (event: Y.YMapEvent<string>) => {
      if (event.transaction.origin === LOCAL_ORIGIN) {
        // Python typed in this window runs without asking.
        (event.keysChanged as Set<string>).forEach((key) => {
          const source = this.yCells.get(key);
          if (source && isPython(source)) {
            this.typedHere.add(source);
          }
        });
      }
      this.queue('cells', event.keysChanged as Set<string>);
    };
    const onFormats = (event: Y.YMapEvent<string>) =>
      this.queue('formats', event.keysChanged as Set<string>);
    const onWidths = () => this.notify();
    this.ySheets.observe(onSheets);
    this.yCells.observe(onCells);
    this.yFormats.observe(onFormats);
    this.yWidths.observe(onWidths);
    this.yCharts.observe(onWidths);
    this.ySolver.observe(onWidths);
    this.unobserve = [
      () => this.yCharts.unobserve(onWidths),
      () => this.ySolver.unobserve(onWidths),
      () => this.ySheets.unobserve(onSheets),
      () => this.yCells.unobserve(onCells),
      () => this.yFormats.unobserve(onFormats),
      () => this.yWidths.unobserve(onWidths),
    ];
    this.firstCalculation = this.recalculateAll();
    await this.firstCalculation;
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
    await this.hashPython();
    const sheets = this.sheets();
    const names = this.engineNames();
    const payload = {
      trusted: Array.from(this.trusted),
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
      this.dataVersion += 1;
      this.error = undefined;
      await this.refreshPythonOutputs();
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

  /**
   * The rows and columns a sheet uses: cells that show something or have
   * a format, and the cells its charts cover. Undefined when empty.
   */
  usedRange(sheetId: string, withCharts = true) {
    let bottom = -1;
    let right = -1;
    const take = (row: number, col: number) => {
      bottom = Math.max(bottom, row);
      right = Math.max(right, col);
    };
    this.texts.get(sheetId)?.forEach((text, key) => {
      if (text) {
        const [row, col] = key.split(',').map(Number);
        take(row, col);
      }
    });
    this.yFormats.forEach((_raw, key) => {
      const cell = parseCellKey(key);
      if (cell.sheetId === sheetId) {
        take(cell.row, cell.col);
      }
    });
    for (const { spec } of withCharts ? this.charts(sheetId) : []) {
      let col = spec.col;
      let x = (spec.dx ?? 0) + spec.width;
      while (x > 0) {
        x -= this.width(sheetId, col);
        col += 1;
      }
      take(
        spec.row + Math.ceil(((spec.dy ?? 0) + spec.height) / ROW_HEIGHT),
        col - 1,
      );
    }
    return bottom < 0 ? undefined : { top: 0, left: 0, bottom, right };
  }

  // ── Python ───────────────────────────────────────────────────────
  /** =PY cells that have not run because this user has not approved them. */
  untrustedPython(): PythonCell[] {
    const cells: PythonCell[] = [];
    this.yCells.forEach((source, key) => {
      if (!isPython(source)) {
        return;
      }
      const hash = this.hashes.get(source);
      if (hash && !this.trusted.has(hash)) {
        cells.push({ ...parseCellKey(key), source });
      }
    });
    return cells;
  }

  /** Let these =PY cells run (remembered in this browser). */
  async trustPython(sources: string[]) {
    for (const source of sources) {
      const hash = this.hashes.get(source) ?? (await sha256(source));
      this.hashes.set(source, hash);
      this.trusted.add(hash);
    }
    this.saveTrusted();
    await this.settled();
    try {
      const changes = await this.engine.call<TextChange[]>('set_trusted', {
        trusted: Array.from(this.trusted),
      });
      this.applyChanges(changes);
      await this.refreshPythonOutputs();
    } catch (error) {
      this.error = String(error);
    }
    this.notify();
  }

  /** The figure a =PY cell drew (SVG), its error and what it printed. */
  pythonFigures(sheetId: string) {
    return this.pyOutputs[sheetId]?.figures ?? [];
  }

  pythonError(sheetId: string, row: number, col: number) {
    return this.pyOutputs[sheetId]?.errors.find(
      ([r, c]) => r === row && c === col,
    )?.[2];
  }

  pythonPrinted(sheetId: string, row: number, col: number) {
    return this.pyOutputs[sheetId]?.stdout.find(
      ([r, c]) => r === row && c === col,
    )?.[2];
  }

  private saveTrusted() {
    try {
      localStorage.setItem(TRUST_KEY, JSON.stringify(Array.from(this.trusted)));
    } catch {
      /* private browsing: trusted for this visit only */
    }
  }

  /** Hash every =PY source; those typed here become trusted. */
  private async hashPython() {
    let added = false;
    const sources = new Set<string>();
    this.yCells.forEach((source) => {
      if (isPython(source)) {
        sources.add(source);
      }
    });
    for (const source of sources) {
      if (!this.hashes.has(source)) {
        this.hashes.set(source, await sha256(source));
      }
      if (this.typedHere.has(source)) {
        const hash = this.hashes.get(source) as string;
        if (!this.trusted.has(hash)) {
          this.trusted.add(hash);
          added = true;
        }
      }
    }
    this.typedHere.clear();
    if (added) {
      this.saveTrusted();
    }
    return added;
  }

  private hasPython() {
    for (const source of this.yCells.values()) {
      if (isPython(source)) {
        return true;
      }
    }
    return false;
  }

  private async refreshPythonOutputs() {
    if (!this.hasPython() && !Object.keys(this.pyOutputs).length) {
      return;
    }
    try {
      this.pyOutputs = await this.engine.call<Record<string, PythonOutputs>>(
        'python_outputs',
        {},
      );
    } catch (error) {
      this.error = String(error);
    }
  }

  // ── Excel ──────────────────────────────────────────────────────────
  /** Read an .xlsx file (in the engine). */
  async readXlsx(file: ArrayBuffer) {
    await this.settled();
    return this.engine.call<XlsxLayout>('read_xlsx', { data: toBase64(file) }, [
      'pypi:openpyxl',
    ]);
  }

  /**
   * Add the sheets of an Excel file (with their formats, widths, frozen
   * panes and charts). A still-empty spreadsheet is replaced. Returns the
   * id of the first sheet added.
   */
  importLayout(layout: XlsxLayout): string | undefined {
    const existing = this.sheets();
    const empty =
      existing.length === 1 &&
      !Array.from(this.yCells.keys()).some((k) =>
        k.startsWith(`${existing[0].id}|`),
      ) &&
      this.charts(existing[0].id).length === 0;
    const taken = new Set(
      (empty ? [] : existing).map((s) => s.meta.name.toLowerCase()),
    );
    let order = empty
      ? 0
      : Math.max(-1, ...existing.map((s) => s.meta.order)) + 1;
    const ids = new Map<string, string>();
    this.ydoc.transact(() => {
      if (empty) {
        this.removeSheetNow(existing[0].id);
      }
      for (const sheet of layout.sheets) {
        let name = sheet.name;
        for (let n = 2; taken.has(name.toLowerCase()); n++) {
          name = `${sheet.name} (${n})`;
        }
        taken.add(name.toLowerCase());
        const id = newSheetId();
        ids.set(sheet.name.toLowerCase(), id);
        const meta: SheetMeta = {
          name,
          order: order++,
          rows: sheet.rows,
          cols: sheet.cols,
          freezeRows: sheet.freezeRows || undefined,
          freezeCols: sheet.freezeCols || undefined,
        };
        this.ySheets.set(id, JSON.stringify(meta));
        for (const [row, col, source] of sheet.cells) {
          this.yCells.set(cellKey(id, row, col), source);
        }
        for (const [row, col, format] of sheet.formats) {
          this.yFormats.set(cellKey(id, row, col), JSON.stringify(format));
        }
        for (const [col, width] of sheet.widths) {
          this.yWidths.set(widthKey(id, col), width);
        }
      }
      for (const { sheet, ...spec } of layout.charts) {
        const sheetId = ids.get(sheet.toLowerCase());
        if (sheetId) {
          this.yCharts.set(newSheetId(), JSON.stringify({ ...spec, sheetId }));
        }
      }
    }, LOCAL_ORIGIN);
    return ids.values().next().value;
  }

  /** The workbook as an .xlsx file (formats, widths, frozen panes, charts). */
  async writeXlsx() {
    await this.settled();
    const sheets: Record<
      string,
      {
        formats: [number, number, CellFormat][];
        widths: [number, number][];
        freezeRows: number;
        freezeCols: number;
      }
    > = {};
    for (const { id, meta } of this.sheets()) {
      sheets[id] = {
        formats: [],
        widths: Array.from(this.customWidths(id).entries()),
        freezeRows: meta.freezeRows ?? 0,
        freezeCols: meta.freezeCols ?? 0,
      };
    }
    this.yFormats.forEach((raw, key) => {
      const format = parseJson<CellFormat>(raw);
      const { sheetId, row, col } = parseCellKey(key);
      if (format && sheets[sheetId]) {
        sheets[sheetId].formats.push([row, col, format]);
      }
    });
    const charts: ChartSpec[] = [];
    this.yCharts.forEach((raw) => {
      const spec = parseJson<ChartSpec>(raw);
      if (spec && !spec.picture) {
        charts.push(spec);
      }
    });
    const { data } = await this.engine.call<{ data: string }>(
      'write_xlsx',
      { sheets, charts },
      ['pypi:openpyxl'],
    );
    return fromBase64(data);
  }

  /** The charts on a sheet. */
  charts(sheetId: string): { id: string; spec: ChartSpec }[] {
    const list: { id: string; spec: ChartSpec }[] = [];
    this.yCharts.forEach((raw, id) => {
      const spec = parseJson<ChartSpec>(raw);
      if (spec && spec.sheetId === sheetId) {
        list.push({ id, spec });
      }
    });
    return list.sort((a, b) => a.id.localeCompare(b.id));
  }

  chart(id: string) {
    return parseJson<ChartSpec>(this.yCharts.get(id));
  }

  /**
   * Draw a chart with matplotlib, in the engine, from the values every cell
   * shows once the edits made so far are calculated.
   */
  async renderChart(spec: ChartSpec) {
    await this.settled();
    return this.engine.call<{
      svg?: string;
      fits?: ChartFit[];
      error?: string;
    }>(
      'render_chart',
      { sheetId: spec.sheetId, spec },
      spec.trendlines?.length ? ['matplotlib', 'scipy'] : ['matplotlib'],
    );
  }

  /** What the trendlines of a chart found when it was last drawn. */
  chartFits(id: string) {
    return this.fits.get(id) ?? [];
  }

  setChartFits(id: string, fits: ChartFit[]) {
    this.fits.set(id, fits);
    this.notify();
  }

  /** The Solver settings saved with a sheet. */
  solverModel(sheetId: string) {
    return parseJson<SolverModel>(this.ySolver.get(sheetId));
  }

  setSolverModel(sheetId: string, model: SolverModel) {
    this.ydoc.transact(() => {
      this.ySolver.set(sheetId, JSON.stringify(model));
    }, 'kherve-cell-solver');
  }

  /**
   * Run the Solver in the engine. Nothing changes in the workbook: the
   * caller keeps the solution (setCells) or not.
   */
  async solve(sheetId: string, model: SolverModel) {
    await this.settled();
    return this.engine.call<SolverResult>('solve', { sheetId, ...model }, [
      'scipy',
    ]);
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
    this.ydoc.transact(() => this.removeSheetNow(id), LOCAL_ORIGIN);
  }

  /** Remove a sheet and all that is on it (inside a transaction). */
  private removeSheetNow(id: string) {
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
      for (const chart of this.charts(id)) {
        this.yCharts.delete(chart.id);
      }
      this.ySolver.delete(id);
    }, LOCAL_ORIGIN);
  }

  addChart(spec: ChartSpec): string {
    const id = newSheetId();
    this.ydoc.transact(() => {
      this.yCharts.set(id, JSON.stringify(spec));
    }, LOCAL_ORIGIN);
    return id;
  }

  updateChart(id: string, patch: Partial<ChartSpec>) {
    const spec = this.chart(id);
    if (!spec) {
      return;
    }
    this.ydoc.transact(() => {
      this.yCharts.set(id, JSON.stringify({ ...spec, ...patch }));
    }, LOCAL_ORIGIN);
  }

  removeChart(id: string) {
    this.ydoc.transact(() => {
      this.yCharts.delete(id);
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
      // Charts: their ranges follow, and so does the cell they sit on.
      for (const [id, raw] of Array.from(this.yCharts.entries())) {
        const spec = parseJson<ChartSpec>(raw);
        if (!spec) {
          continue;
        }
        const next = adjustChart(spec, names.get(spec.sheetId) ?? '', change);
        const json = JSON.stringify(next);
        if (json !== raw) {
          this.yCharts.set(id, json);
        }
      }
      const solver = this.solverModel(sheetId);
      if (solver) {
        this.ySolver.set(
          sheetId,
          JSON.stringify(adjustSolverModel(solver, meta.name, change)),
        );
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

  /** Resolves once every queued change has been calculated (including
   * changes made just before the call, whose flush is not started yet). */
  async settled() {
    await this.firstCalculation;
    let current: Promise<void>;
    do {
      await Promise.resolve(); // let a just-queued flush start
      current = this.flushing;
      await current;
    } while (current !== this.flushing);
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
      if ((await this.hashPython()) && this.calculated) {
        changes.push(
          ...(await this.engine.call<TextChange[]>('set_trusted', {
            trusted: Array.from(this.trusted),
          })),
        );
      }
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
    this.applyChanges(changes);
    if (changes.length) {
      await this.refreshPythonOutputs();
    }
    this.notify();
  }

  private applyChanges(changes: TextChange[]) {
    if (changes.length) {
      this.dataVersion += 1;
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
  }
}
