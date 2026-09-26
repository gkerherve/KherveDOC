/**
 * The shared spreadsheet document, identical to KherveSheet's live-sharing
 * layout (khervesheet/collab/model.py), so desktop and web can share a room:
 *
 * - `sheets`  — sheet id → JSON {name, order, rows, cols}
 * - `cells`   — "<sheet id>|<row>,<col>" → what was typed (value or formula)
 * - `formats` — same keys → JSON of KherveSheet's CellFormat.to_dict()
 * - `widths`  — "<sheet id>|<col>" → column width in pixels
 */

export const SHEETS = 'sheets';
export const CELLS = 'cells';
export const FORMATS = 'formats';
export const WIDTHS = 'widths';

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
