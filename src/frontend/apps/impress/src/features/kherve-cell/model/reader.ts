/**
 * Reading a spreadsheet document without opening it: its saved content,
 * calculated by the engine, as the text each cell shows. Used by the
 * spreadsheet table block of text documents.
 */
import * as Y from 'yjs';

import { getDocContent } from '@/docs/doc-management/api/useDocContent';

import { CellEngine } from './engineClient';
import { parseAddress } from './layout';
import { SheetWorkbook } from './workbook';

export interface CellRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface SpreadsheetRead {
  sheets: { id: string; name: string }[];
  sheetId: string;
  range: CellRect;
  /** What each cell of the range shows, row by row. */
  rows: string[][];
}

/** "B2:D9" → the rectangle; undefined if it is not a range. */
export const parseRange = (text: string): CellRect | undefined => {
  const [a, b] = text.split(':');
  const from = parseAddress(a ?? '');
  const to = b === undefined ? from : parseAddress(b);
  if (!from || !to) {
    return undefined;
  }
  return {
    top: Math.min(from.row, to.row),
    bottom: Math.max(from.row, to.row),
    left: Math.min(from.col, to.col),
    right: Math.max(from.col, to.col),
  };
};

const emptyRect: CellRect = { top: 0, bottom: 0, left: 0, right: 0 };

const MAX_ROWS = 200;
const MAX_COLS = 30;

/** The saved Yjs update of a document (the API answers base64 text or
 * JSON holding it). */
const decodeContent = (raw: string) => {
  let text = raw.trim();
  if (text.startsWith('{')) {
    text = (JSON.parse(text) as { content?: string }).content ?? '';
  }
  return text ? Uint8Array.from(atob(text), (c) => c.charCodeAt(0)) : null;
};

// One engine for every table on the page, reading one spreadsheet at a
// time (each read loads a workbook into it).
let engine: CellEngine | undefined;
let queue: Promise<unknown> = Promise.resolve();

export const readSpreadsheet = (
  docId: string,
  sheetId?: string,
  range?: string,
): Promise<SpreadsheetRead> => {
  const run = async () => {
    const ydoc = new Y.Doc();
    const update = decodeContent(await getDocContent({ id: docId }));
    if (update) {
      Y.applyUpdate(ydoc, update);
    }
    engine ??= new CellEngine();
    const book = new SheetWorkbook(ydoc, engine);
    try {
      await book.start();
      const sheets = book
        .sheets()
        .map((s) => ({ id: s.id, name: s.meta.name }));
      const sheet = sheets.find((s) => s.id === sheetId) ?? sheets[0];
      if (!sheet) {
        return { sheets, sheetId: '', range: emptyRect, rows: [] };
      }
      const rect =
        (range ? parseRange(range) : undefined) ??
        book.usedRange(sheet.id, false) ??
        emptyRect;
      const bottom = Math.min(rect.bottom, rect.top + MAX_ROWS - 1);
      const right = Math.min(rect.right, rect.left + MAX_COLS - 1);
      const rows: string[][] = [];
      for (let r = rect.top; r <= bottom; r++) {
        const row: string[] = [];
        for (let c = rect.left; c <= right; c++) {
          row.push(book.text(sheet.id, r, c));
        }
        rows.push(row);
      }
      return { sheets, sheetId: sheet.id, range: rect, rows };
    } finally {
      book.dispose();
      ydoc.destroy();
    }
  };
  const next = queue.then(run, run);
  queue = next.catch(() => undefined);
  return next;
};
