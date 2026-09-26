import { describe, expect, it } from 'vitest';

import {
  MAX_SNAPSHOT_ROWS,
  parseSnapshot,
  serializeSnapshot,
  snapshotOfRows,
} from '../spreadsheetSnapshot';

describe('spreadsheet snapshots', () => {
  it('uses the first row as titles, or column letters', () => {
    const rows = [['Sample', 'Mass'], ['A', '1.50'], ['B']];
    expect(snapshotOfRows(rows, true)).toEqual({
      columns: ['Sample', 'Mass'],
      rows: [
        ['A', '1.50'],
        ['B', ''],
      ],
    });
    expect(snapshotOfRows(rows, false, 2).columns).toEqual(['C', 'D']);
    expect(snapshotOfRows(rows, false).rows).toHaveLength(3);
  });

  it('caps the copy kept in the document', () => {
    const rows = Array.from({ length: MAX_SNAPSHOT_ROWS + 50 }, (_, i) => [
      String(i),
    ]);
    expect(snapshotOfRows(rows, false).rows).toHaveLength(MAX_SNAPSHOT_ROWS);
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
});
