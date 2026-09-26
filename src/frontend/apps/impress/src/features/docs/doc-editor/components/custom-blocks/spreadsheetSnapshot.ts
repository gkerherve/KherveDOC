import type { SpreadsheetTable } from '@/features/cells/api/cellsApi';
import { cellText } from '@/features/cells/api/cellsApi';

/** The copy of a spreadsheet table kept in the document, as display text. */
export interface SpreadsheetSnapshot {
  columns: string[];
  rows: string[][];
}

export const MAX_SNAPSHOT_ROWS = 200;
export const MAX_SNAPSHOT_COLUMNS = 30;

export const snapshotOf = (table: SpreadsheetTable): SpreadsheetSnapshot => {
  const columns = table.columns.slice(0, MAX_SNAPSHOT_COLUMNS);
  return {
    columns,
    rows: table.rows
      .slice(0, MAX_SNAPSHOT_ROWS)
      .map((row) => columns.map((column) => cellText(row[column]))),
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
