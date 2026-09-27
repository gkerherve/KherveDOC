/**
 * The shared spreadsheet document, identical to KherveSheet's live-sharing
 * layout (khervesheet/collab/model.py), so desktop and web can share a room:
 *
 * - `sheets`  — sheet id → JSON {name, order, rows, cols}
 * - `cells`   — "<sheet id>|<row>,<col>" → what was typed (value or formula)
 * - `formats` — same keys → JSON of KherveSheet's CellFormat.to_dict()
 * - `widths`  — "<sheet id>|<col>" → column width in pixels
 * - `charts`  — chart id → JSON ChartSpec (drawn by matplotlib in the engine)
 * - `solver`  — sheet id → JSON SolverModel (the sheet's Solver settings)
 */

export const SHEETS = 'sheets';
export const CELLS = 'cells';
export const FORMATS = 'formats';
export const WIDTHS = 'widths';
export const CHARTS = 'charts';
export const SOLVER = 'solver';

export const DEFAULT_ROWS = 5000;
export const DEFAULT_COLS = 50;
export const DEFAULT_WIDTH = 100;
export const ROW_HEIGHT = 24;

export interface SheetMeta {
  name: string;
  order: number;
  rows: number;
  cols: number;
  /** Rows / columns kept in view while scrolling (freeze panes). */
  freezeRows?: number;
  freezeCols?: number;
}

export const CHART_TYPES = [
  'Line',
  'Line+Symbol',
  'Scatter',
  'Bar',
  'Step',
  'Stem',
  'Histogram',
  'Box',
  'Pie',
  'Doughnut',
  '3D Pie',
  'Heatmap',
  '3D Surface',
] as const;
export type ChartType = (typeof CHART_TYPES)[number];

export const CHART_COLORS = [
  '#1f77b4',
  '#ff7f0e',
  '#2ca02c',
  '#d62728',
  '#9467bd',
  '#8c564b',
  '#e377c2',
  '#7f7f7f',
  '#bcbd22',
  '#17becf',
];

export interface ChartSeries {
  /** Range of the values, e.g. "B2:B20" or "Sheet2!B2:B20". */
  ref: string;
  name?: string;
  color?: string;
}

/** The trendline models of khervesheet/core/fitting.py. */
export const FIT_MODELS = [
  'Linear',
  'Polynomial',
  'Exponential',
  'Exponential Decay',
  'Double Exponential',
  'Stretched Exponential',
  'Logarithmic',
  'Power',
  'Allometric (Power + c)',
  'Square Root',
  'Inverse (1/x)',
  'Hyperbolic (ax/(b+x))',
  'Reciprocal Quadratic',
  'Logistic (Sigmoid)',
  'Boltzmann Sigmoid',
  'Gaussian',
  'Lorentzian',
  'Sine Wave',
  'Hill Equation',
  'Michaelis-Menten',
  'Error Function (erf)',
  'Moving Average',
] as const;

export interface ChartTrendline {
  /** Index of the fitted series. */
  series: number;
  model: string;
  polyOrder?: number;
  maPeriod?: number;
  color?: string;
  showEquation?: boolean;
  showR2?: boolean;
  /** Extend the curve beyond the data (forecast), in X units. */
  forward?: number;
  backward?: number;
}

/** What a trendline's fit found. */
export interface ChartFit {
  model?: string;
  equation?: string;
  params?: Record<string, number | null>;
  errors?: Record<string, number | null>;
  gof?: Record<string, number | null>;
  error?: string;
}

/** A chart, as khervesheet/core/charts.py draws it. */
export interface ChartSpec {
  /** The sheet the chart sits on; ranges without a sheet name are there. */
  sheetId: string;
  /** Top-left corner: a cell, plus pixels inside it. */
  row: number;
  col: number;
  dx?: number;
  dy?: number;
  width: number;
  height: number;
  type: ChartType;
  title?: string;
  xLabel?: string;
  yLabel?: string;
  /** Range of the X values or categories; none: 1, 2, 3… */
  x?: string | null;
  series: ChartSeries[];
  legend?: boolean;
  grid?: boolean;
  logX?: boolean;
  logY?: boolean;
  trendlines?: ChartTrendline[];
}

/** An .xlsx file in the shared layout (khervesheet/core/xlsx.py). */
export interface XlsxLayout {
  sheets: {
    name: string;
    rows: number;
    cols: number;
    freezeRows: number;
    freezeCols: number;
    cells: [number, number, string][];
    formats: [number, number, CellFormat][];
    widths: [number, number][];
  }[];
  charts: (Omit<ChartSpec, 'sheetId'> & { sheet: string })[];
  error?: string;
}

export interface SolverConstraint {
  cell: string;
  op: '<=' | '>=' | '=';
  /** A number or a cell. */
  value: string;
}

/** A sheet's Solver settings, as in KherveSheet's Solver dialog. */
export interface SolverModel {
  objective: string;
  goal: 'max' | 'min' | 'value';
  target?: string;
  variables: string;
  constraints: SolverConstraint[];
  nonNegative: boolean;
  method: 'GRG Nonlinear' | 'Evolutionary';
  keepSearching: boolean;
  /** How long the search may run, in seconds. */
  seconds: number;
}

export interface SolverResult {
  solved?: boolean;
  cancelled?: boolean;
  message?: string;
  objective?: number | null;
  variables?: [number, number, string][];
  error?: string;
}

/** KherveSheet's CellFormat.to_dict() keys (the ones the web edits). */
export interface CellFormat {
  bg?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  font_family?: string;
  font_size?: number;
  font_color?: string;
  /** Qt alignment flags, as the desktop stores them. */
  alignment?: number;
  number_format?: string;
  wrap_text?: boolean;
  [key: string]: unknown;
}

/** Qt::AlignLeft|AlignVCenter, AlignHCenter|AlignVCenter, AlignRight|… */
export const ALIGN = { left: 0x81, center: 0x84, right: 0x82 } as const;
export type Alignment = keyof typeof ALIGN;

export const alignmentOf = (flags?: number): Alignment | undefined => {
  if (flags === undefined) {
    return undefined;
  }
  if (flags & 0x4) {
    return 'center';
  }
  if (flags & 0x2) {
    return 'right';
  }
  return 'left';
};

export const cellKey = (sheetId: string, row: number, col: number) =>
  `${sheetId}|${row},${col}`;

export const parseCellKey = (key: string) => {
  const [sheetId, rc] = key.split('|');
  const [row, col] = rc.split(',').map(Number);
  return { sheetId, row, col };
};

export const widthKey = (sheetId: string, col: number) => `${sheetId}|${col}`;

export const parseWidthKey = (key: string) => {
  const [sheetId, col] = key.split('|');
  return { sheetId, col: Number(col) };
};

export const newSheetId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');

/** 0 → A, 25 → Z, 26 → AA… */
export const columnName = (index: number) => {
  let name = '';
  let n = index;
  do {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return name;
};

/** "B3" → {row: 2, col: 1}; undefined if not a cell address. */
export const parseAddress = (text: string) => {
  const m = /^\s*\$?([A-Za-z]{1,3})\$?(\d{1,7})\s*$/.exec(text);
  if (!m) {
    return undefined;
  }
  let col = 0;
  for (const ch of m[1].toUpperCase()) {
    col = col * 26 + (ch.charCodeAt(0) - 64);
  }
  return { row: Number(m[2]) - 1, col: col - 1 };
};

export const address = (row: number, col: number) =>
  `${columnName(col)}${row + 1}`;

export const parseJson = <T>(raw: unknown): T | undefined => {
  if (typeof raw !== 'string') {
    return undefined;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
};
