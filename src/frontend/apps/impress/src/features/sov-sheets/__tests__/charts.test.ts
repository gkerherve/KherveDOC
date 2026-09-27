import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { adjustChart, currentRegion, suggestChart } from '../model/charts';
import { ChartSpec } from '../model/layout';
import { SheetWorkbook } from '../model/workbook';

const grid = (rows: string[][]) => (r: number, c: number) => rows[r]?.[c] ?? '';

const engine = {
  ready: Promise.resolve(),
  call: <T>(op: string): Promise<T> =>
    Promise.resolve((op === 'reset' ? {} : []) as T),
};

describe('charts', () => {
  const table = grid([
    ['Month', 'Sales', 'Cost'],
    ['Jan', '10', '4'],
    ['Feb', '14', '6'],
    ['Mar', '9', '5'],
  ]);

  it('finds the block of data around a cell', () => {
    expect(currentRegion(table, 2, 1)).toEqual({
      top: 0,
      bottom: 3,
      left: 0,
      right: 2,
    });
  });

  it('guesses headers, categories and series like Excel', () => {
    const chart = suggestChart(table, { top: 0, bottom: 3, left: 0, right: 2 });
    expect(chart.type).toBe('Bar');
    expect(chart.x).toBe('A2:A4');
    expect(chart.series.map((s) => [s.ref, s.name])).toEqual([
      ['B2:B4', 'Sales'],
      ['C2:C4', 'Cost'],
    ]);
    expect(chart.legend).toBe(true);

    const numbers = grid([
      ['1', '2'],
      ['2', '4'],
    ]);
    const xy = suggestChart(numbers, { top: 0, bottom: 1, left: 0, right: 1 });
    expect(xy.type).toBe('Line');
    expect(xy.x).toBe('A1:A2');
    expect(xy.series[0].name).toBeUndefined();

    const one = suggestChart(table, { top: 0, bottom: 3, left: 1, right: 1 });
    expect(one.x).toBeNull();
    expect(one.series[0].ref).toBe('B2:B4');
    expect(one.title).toBe('Sales');
  });

  it('follows inserted and deleted rows', () => {
    const spec: ChartSpec = {
      sheetId: 's',
      row: 5,
      col: 4,
      width: 400,
      height: 300,
      type: 'Line',
      x: 'A2:A4',
      series: [{ ref: 'B2:B4' }, { ref: 'Other!C1:C3' }],
    };
    const moved = adjustChart(spec, 'Sheet1', {
      sheet: 'Sheet1',
      axis: 'row',
      at: 2,
      count: 1,
    });
    expect(moved.x).toBe('A2:A5');
    expect(moved.series.map((s) => s.ref)).toEqual(['B2:B5', 'Other!C1:C3']);
    expect(moved.row).toBe(6);
    const cols = adjustChart(spec, 'Sheet1', {
      sheet: 'Sheet1',
      axis: 'col',
      at: 1,
      count: -1,
    });
    expect(cols.series[0].ref).toBe('#REF!');
    expect(cols.col).toBe(3);
  });

  it('keeps charts in the shared workbook', async () => {
    const book = new SheetWorkbook(new Y.Doc(), engine);
    await book.start();
    book.ensureFirstSheet();
    const sheet = book.sheets()[0].id;
    const id = book.addChart({
      sheetId: sheet,
      row: 1,
      col: 3,
      width: 400,
      height: 300,
      type: 'Line',
      series: [{ ref: 'B1:B3' }],
    });
    expect(book.charts(sheet).map((c) => c.id)).toEqual([id]);
    book.changeStructure(sheet, 'row', 0, 2);
    expect(book.chart(id)?.series[0].ref).toBe('B3:B5');
    expect(book.chart(id)?.row).toBe(3);
    book.updateChart(id, { title: 'Hello' });
    expect(book.chart(id)?.title).toBe('Hello');
    book.undoManager.stopCapturing();
    book.removeChart(id);
    expect(book.charts(sheet)).toEqual([]);
    book.undo();
    expect(book.chart(id)?.title).toBe('Hello');

    const other = book.addSheet();
    book.addChart({ ...book.chart(id)!, sheetId: other });
    book.removeSheet(other);
    expect(book.yCharts.size).toBe(1);
  });
});
