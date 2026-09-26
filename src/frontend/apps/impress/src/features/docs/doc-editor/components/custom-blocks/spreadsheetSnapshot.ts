import { columnName } from '@/features/kherve-cell/model/layout';

/** The copy of a spreadsheet table kept in the document, as display text. */
export interface SpreadsheetSnapshot {
  columns: string[];
  rows: string[][];
}

export const MAX_SNAPSHOT_ROWS = 200;
export const MAX_SNAPSHOT_COLUMNS = 30;

/**
 * A range's shown values as a table: its first row as the column titles
 * (*header*), or the column letters from *firstColumn* on.
 */
export const snapshotOfRows = (
  rows: string[][],
  header: boolean,
  firstColumn = 0,
): SpreadsheetSnapshot => {
  const width = Math.min(
    MAX_SNAPSHOT_COLUMNS,
    Math.max(0, ...rows.map((row) => row.length)),
  );
  const fit = (row: string[]) =>
    Array.from({ length: width }, (_, i) => row[i] ?? '');
  const body = header ? rows.slice(1) : rows;
  return {
    columns: header
      ? fit(rows[0] ?? [])
      : Array.from({ length: width }, (_, i) => columnName(firstColumn + i)),
    rows: body.slice(0, MAX_SNAPSHOT_ROWS).map(fit),
  };
};

export const serializeSnapshot = (snapshot: SpreadsheetSnapshot) =>
  JSON.stringify(snapshot);

/** The stored copy, or undefined if missing or malformed. */
export const parseSnapshot = (
  raw: string | undefined,
): SpreadsheetSnapshot | undefined => {
  if (!raw) {
    return undefined;
  }
  try {
    const value = JSON.parse(raw) as Partial<SpreadsheetSnapshot>;
    if (!Array.isArray(value.columns) || !Array.isArray(value.rows)) {
      return undefined;
    }
    const columns = value.columns.map(String);
    return {
      columns,
      rows: value.rows
        .filter(Array.isArray)
        .map((row) => columns.map((_, index) => String(row[index] ?? ''))),
    };
  } catch {
    return undefined;
  }
};
