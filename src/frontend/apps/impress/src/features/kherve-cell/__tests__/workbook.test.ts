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

  it('inserts and deletes rows, moving cells and adjusting formulas', async () => {
    const book = new SheetWorkbook(new Y.Doc(), new FakeEngine());
    await book.start();
    book.ensureFirstSheet();
    const data = book.sheets()[0].id;
    const results = book.addSheet();
    book.setCells([
      [data, 0, 0, '1'],
      [data, 1, 0, '2'],
      [data, 2, 0, '=SUM(A1:A2)'],
      [results, 0, 0, '=Sheet1!A3*10'],
    ]);
    book.setFormat(data, [[1, 0]], { bold: true });

    book.changeStructure(data, 'row', 1, 1); // insert above row 2
    expect(book.source(data, 1, 0)).toBe('');
    expect(book.source(data, 2, 0)).toBe('2');
    expect(book.format(data, 2, 0)).toEqual({ bold: true });
    expect(book.source(data, 3, 0)).toBe('=SUM(A1:A3)');
    expect(book.source(results, 0, 0)).toBe('=Sheet1!A4*10');
    expect(book.sheets()[0].meta.rows).toBe(5001);

    book.changeStructure(data, 'row', 0, -1); // delete row 1
    expect(book.source(data, 2, 0)).toBe('=SUM(A1:A2)');
    expect(book.source(results, 0, 0)).toBe('=Sheet1!A3*10');
  });

  it('inserts columns and keeps widths with their column', async () => {
    const book = new SheetWorkbook(new Y.Doc(), new FakeEngine());
    await book.start();
    book.ensureFirstSheet();
    const sheet = book.sheets()[0].id;
    book.setCells([
      [sheet, 0, 1, 'b'],
      [sheet, 0, 2, '=B1'],
    ]);
    book.setWidth(sheet, 1, 150);
    book.changeStructure(sheet, 'col', 0, 2);
    expect(book.source(sheet, 0, 3)).toBe('b');
    expect(book.source(sheet, 0, 4)).toBe('=D1');
    expect(book.width(sheet, 3)).toBe(150);
    expect(book.width(sheet, 1)).toBe(100);
  });

  it('sorts rows by a column, formulas following their row', async () => {
    const engine = new FakeEngine();
    const book = new SheetWorkbook(new Y.Doc(), engine);
    await book.start();
    book.ensureFirstSheet();
    const sheet = book.sheets()[0].id;
    book.setCells([
      [sheet, 0, 0, 'pear'],
      [sheet, 0, 1, '=A1'],
      [sheet, 1, 0, 'apple'],
      [sheet, 1, 1, '=A2'],
      [sheet, 2, 0, 'fig'],
      [sheet, 2, 1, '=A3'],
    ]);
    await new Promise((r) => setTimeout(r, 0));
    await book.settled();
    book.sortRange(sheet, { top: 0, bottom: 2, left: 0, right: 1 }, 0);
    expect([0, 1, 2].map((r) => book.source(sheet, r, 0))).toEqual([
      'apple',
      'fig',
      'pear',
    ]);
    // Each formula still reads the cell on its own row.
    expect([0, 1, 2].map((r) => book.source(sheet, r, 1))).toEqual([
      '=A1',
      '=A2',
      '=A3',
    ]);
  });

  it('remembers frozen rows and columns', async () => {
    const book = new SheetWorkbook(new Y.Doc(), new FakeEngine());
    await book.start();
    book.ensureFirstSheet();
    const sheet = book.sheets()[0].id;
    book.setFreeze(sheet, 1, 2);
    expect(book.sheets()[0].meta).toMatchObject({
      freezeRows: 1,
      freezeCols: 2,
    });
  });
});

describe('python cells', () => {
  it('trusts code typed here, asks for code from others', async () => {
    localStorage.clear();
    const engine = new FakeEngine();
    const docA = new Y.Doc();
    const a = new SheetWorkbook(docA, engine);
    await a.start();
    a.ensureFirstSheet();
    const sheet = a.sheets()[0].id;
    a.setCell(sheet, 0, 0, '=PY 1+1');
    await a.settled();
    expect(a.untrustedPython()).toEqual([]);
    expect(engine.calls.some(([op]) => op === 'set_trusted')).toBe(true);

    // Someone else's code arrives: it waits for approval.
    docA.transact(() => {
      a.yCells.set(`${sheet}|1,0`, '=PY 2+2');
    }, 'remote');
    await a.settled();
    expect(a.untrustedPython()).toEqual([
      { sheetId: sheet, row: 1, col: 0, source: '=PY 2+2' },
    ]);
    await a.trustPython(['=PY 2+2']);
    expect(a.untrustedPython()).toEqual([]);
    expect(
      JSON.parse(localStorage.getItem('kherve-cell-trusted-python') ?? '[]'),
    ).toHaveLength(2);
  });
});
