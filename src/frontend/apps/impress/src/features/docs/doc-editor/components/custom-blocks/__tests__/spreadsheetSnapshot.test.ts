import { describe, expect, it } from 'vitest';

import { cellText } from '@/features/cells/api/cellsApi';

import {
  MAX_SNAPSHOT_ROWS,
  parseSnapshot,
  serializeSnapshot,
  snapshotOf,
} from '../spreadsheetSnapshot';

describe('spreadsheet snapshots', () => {
  it('turns a KherveCELL table into display text', () => {
    const snapshot = snapshotOf({
      id: 'Table1',
      columns: ['Sample', 'Mass', 'Tags', 'Error'],
      rows: [
        { Sample: 'A', Mass: 1.5, Tags: ['L', 'x', 'y'], Error: ['E', 'Div'] },
        { Sample: null, Mass: 0, Tags: null, Error: '' },
      ],
    });
    expect(snapshot).toEqual({
      columns: ['Sample', 'Mass', 'Tags', 'Error'],
      rows: [
        ['A', '1.5', 'x, y', '#Div'],
        ['', '0', '', ''],
      ],
    });
  });

  it('caps the copy kept in the document', () => {
    const rows = Array.from({ length: MAX_SNAPSHOT_ROWS + 50 }, (_, i) => ({
      N: i,
    }));
    expect(snapshotOf({ id: 'T', columns: ['N'], rows }).rows).toHaveLength(
      MAX_SNAPSHOT_ROWS,
    );
  });

  it('round-trips and rejects malformed copies', () => {
    const snapshot = { columns: ['a', 'b'], rows: [['1', '2']] };
    expect(parseSnapshot(serializeSnapshot(snapshot))).toEqual(snapshot);
    expect(parseSnapshot('')).toBeUndefined();
    expect(parseSnapshot('{oops')).toBeUndefined();
    expect(parseSnapshot('{"columns": 3}')).toBeUndefined();
    // Short rows are padded to the column count.
    expect(parseSnapshot('{"columns":["a","b"],"rows":[["1"]]}')).toEqual({
      columns: ['a', 'b'],
      rows: [['1', '']],
    });
  });

  it('formats KherveCELL dates', () => {
    expect(cellText(['d', 0])).toBe(new Date(0).toLocaleDateString());
  });
});
