import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { SheetWorkbook } from '../model/workbook';

/** A stand-in engine: shows what was typed, upper-cased, and logs calls. */
class FakeEngine {
  ready = Promise.resolve();
  calls: [string, unknown][] = [];
  async call<T>(op: string, payload: unknown): Promise<T> {
    this.calls.push([op, payload]);
    if (op === 'reset') {
      const { sheets } = payload as {
        sheets: { id: string; cells: [number, number, string][] }[];
      };
      return Object.fromEntries(
        sheets.map((s) => [
          s.id,
          s.cells.map(([r, c, src]) => [r, c, src.toUpperCase()]),
        ]),
      ) as T;
    }
    if (op === 'set_cells') {
      const { edits } = payload as {
        edits: [string, number, number, string][];
      };
      return edits.map(([id, r, c, src]) => [id, r, c, src.toUpperCase()]) as T;
    }
    return [] as T;
  }
}

/** Two users' copies of one spreadsheet, kept in sync. */
const pair = () => {
  const a = new Y.Doc();
  const b = new Y.Doc();
  a.on('update', (u: Uint8Array, origin: unknown) => {
    if (origin !== 'remote') {
      Y.applyUpdate(b, u, 'remote');
    }
  });
  b.on('update', (u: Uint8Array, origin: unknown) => {
    if (origin !== 'remote') {
      Y.applyUpdate(a, u, 'remote');
    }
  });
  return [a, b];
};

describe('SheetWorkbook', () => {
  it('starts a new spreadsheet with one 5,000 × 50 sheet', async () => {
    const book = new SheetWorkbook(new Y.Doc(), new FakeEngine());
    await book.start();
    book.ensureFirstSheet();
    const sheets = book.sheets();
    expect(sheets).toHaveLength(1);
    expect(sheets[0].meta).toMatchObject({
      name: 'Sheet1',
      rows: 5000,
      cols: 50,
    });
  });

  it('shows what the engine computes, for local and remote edits', async () => {
    const [docA, docB] = pair();
    const engineA = new FakeEngine();
    const a = new SheetWorkbook(docA, engineA);
    const b = new SheetWorkbook(docB, new FakeEngine());
    await a.start();
    a.ensureFirstSheet();
    await b.start();
    const sheet = a.sheets()[0].id;

    a.setCell(sheet, 0, 0, 'hello');
    await new Promise((r) => setTimeout(r, 0));
    await a.settled();
    await b.settled();
    expect(a.text(sheet, 0, 0)).toBe('HELLO');
    expect(b.text(sheet, 0, 0)).toBe('HELLO');
    expect(b.source(sheet, 0, 0)).toBe('hello');
    expect(engineA.calls.at(-1)).toEqual([
      'set_cells',
      { edits: [[sheet, 0, 0, 'hello']] },
    ]);
  });

  it('never mistakes an existing spreadsheet for an empty one', async () => {
    const [docA, docB] = pair();
    const a = new SheetWorkbook(docA, new FakeEngine());
    await a.start();
    a.ensureFirstSheet();
    const b = new SheetWorkbook(docB, new FakeEngine());
    await b.start();
    b.ensureFirstSheet(); // in sync: sees A's sheet, adds none
    expect(b.sheets().map((s) => s.meta.name)).toEqual(['Sheet1']);
  });

  it('resolves two sheets created with the same name at once', async () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const a = new SheetWorkbook(docA, new FakeEngine());
    const b = new SheetWorkbook(docB, new FakeEngine());
    await a.start();
    await b.start();
    a.ensureFirstSheet(); // both offline: each makes a Sheet1
    b.ensureFirstSheet();
    Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB));
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
    a.resolveNameClashes();
    b.resolveNameClashes();
    Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB));
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
    const names = (book: SheetWorkbook) =>
      book
        .sheets()
        .map((s) => s.meta.name)
        .sort();
    expect(names(a)).toEqual(['Sheet1', 'Sheet1 (2)']);
    expect(names(b)).toEqual(names(a));
  });

  it('adds, renames and removes sheets', async () => {
    const engine = new FakeEngine();
    const book = new SheetWorkbook(new Y.Doc(), engine);
    await book.start();
    book.ensureFirstSheet();
    const second = book.addSheet();
    expect(book.sheets().map((s) => s.meta.name)).toEqual(['Sheet1', 'Sheet2']);
    expect(book.renameSheet(second, 'sheet1')).toBe(false); // already used
    expect(book.renameSheet(second, 'Results')).toBe(true);
    book.setCell(second, 2, 3, 'x');
    await new Promise((r) => setTimeout(r, 0));
    await book.settled();
    book.removeSheet(second);
    await new Promise((r) => setTimeout(r, 0));
    await book.settled();
    expect(book.sheets().map((s) => s.meta.name)).toEqual(['Sheet1']);
    expect(book.source(second, 2, 3)).toBe('');
    const ops = engine.calls.map(([op]) => op);
    expect(ops).toContain('add_sheet');
    expect(ops).toContain('remove_sheet');
  });

  it('merges formats and sends number formats to the engine', async () => {
    const engine = new FakeEngine();
    const book = new SheetWorkbook(new Y.Doc(), engine);
    await book.start();
    book.ensureFirstSheet();
    const sheet = book.sheets()[0].id;
    book.setFormat(sheet, [[0, 0]], { bold: true });
    book.setFormat(sheet, [[0, 0]], { number_format: '0.0' });
    await new Promise((r) => setTimeout(r, 0));
    await book.settled();
    expect(book.format(sheet, 0, 0)).toEqual({
      bold: true,
      number_format: '0.0',
    });
    expect(engine.calls.at(-1)).toEqual([
      'set_formats',
      { formats: [[sheet, 0, 0, '0.0']] },
    ]);
    book.setFormat(sheet, [[0, 0]], { bold: false });
    expect(book.format(sheet, 0, 0)).toEqual({ number_format: '0.0' });
  });

  it('grows the sheet when editing past its edge, and undoes', async () => {
    const book = new SheetWorkbook(new Y.Doc(), new FakeEngine());
    await book.start();
    book.ensureFirstSheet();
    const sheet = book.sheets()[0].id;
    book.setCell(sheet, 6000, 60, '1');
    expect(book.sheets()[0].meta).toMatchObject({ rows: 6001, cols: 61 });
    book.undo();
    expect(book.source(sheet, 6000, 60)).toBe('');
  });
});
