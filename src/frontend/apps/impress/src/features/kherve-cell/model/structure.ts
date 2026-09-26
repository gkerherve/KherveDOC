/**
 * Inserting and deleting rows or columns, the way Excel adjusts formulas:
 * references past the change move (absolute ones too), references into
 * deleted rows/columns become #REF!, and ranges stretch or shrink.
 */
import { columnName } from './layout';

export type Axis = 'row' | 'col';

export interface StructureChange {
  /** Name of the sheet whose rows/columns change. */
  sheet: string;
  axis: Axis;
  /** First row/column (0-based) inserted or deleted. */
  at: number;
  /** Rows/columns inserted (> 0) or deleted (< 0). */
  count: number;
}

const columnIndex = (letters: string) => {
  let index = 0;
  for (const ch of letters.toUpperCase()) {
    index = index * 26 + (ch.charCodeAt(0) - 64);
  }
  return index - 1;
};

/** Where index *i* goes; null if it is deleted. */
export const moveIndex = (i: number, at: number, count: number) => {
  if (count > 0) {
    return i >= at ? i + count : i;
  }
  const n = -count;
  if (i < at) {
    return i;
  }
  if (i < at + n) {
    return null;
  }
  return i - n;
};

interface Ref {
  colAbs: string;
  col: number;
  rowAbs: string;
  row: number;
}

const CELL = /^(\$?)([A-Za-z]{1,3})(\$?)(\d+)$/;

const parseRef = (text: string): Ref | undefined => {
  const m = CELL.exec(text);
  return m
    ? {
        colAbs: m[1],
        col: columnIndex(m[2]),
        rowAbs: m[3],
        row: Number(m[4]) - 1,
      }
    : undefined;
};

const writeRef = (r: Ref) =>
  `${r.colAbs}${columnName(r.col)}${r.rowAbs}${r.row + 1}`;

// [sheet!]A1 or [sheet!]A1:B2, standing alone (not in a name, a number or
// a function call).
const REFERENCE =
  /(?<![A-Za-z0-9_.$'])((?:'[^']+'|[A-Za-z_][\w]*)!)?(\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+)?)(?![\w(!])/g;

const sheetOf = (prefix: string | undefined) =>
  prefix ? prefix.slice(0, -1).replace(/^'(.*)'$/, '$1') : undefined;

/**
 * *formula*, written on sheet *formulaSheet*, after *change*.
 * Returns the formula unchanged when it does not refer to that sheet.
 */
export const adjustFormula = (
  formula: string,
  formulaSheet: string,
  change: StructureChange,
) => {
  if (!formula.startsWith('=')) {
    return formula;
  }
  const target = change.sheet.toLowerCase();
  return formula
    .split(/("(?:[^"]|"")*")/)
    .map((part, index) =>
      index % 2 === 1
        ? part
        : part.replace(
            REFERENCE,
            (whole, prefix: string | undefined, ref: string) => {
              const sheet = (sheetOf(prefix) ?? formulaSheet).toLowerCase();
              if (sheet !== target) {
                return whole;
              }
              const [a, b] = ref.split(':');
              const start = parseRef(a);
              const end = b ? parseRef(b) : undefined;
              if (!start) {
                return whole;
              }
              const key = change.axis === 'row' ? 'row' : 'col';
              if (!end) {
                const moved = moveIndex(start[key], change.at, change.count);
                if (moved === null) {
                  return '#REF!';
                }
                return `${prefix ?? ''}${writeRef({ ...start, [key]: moved })}`;
              }
              const lo = Math.min(start[key], end[key]);
              const hi = Math.max(start[key], end[key]);
              let newLo = moveIndex(lo, change.at, change.count);
              let newHi = moveIndex(hi, change.at, change.count);
              if (newLo === null && newHi === null) {
                // The whole range was deleted, unless it only lay inside it.
                const n = -change.count;
                if (lo >= change.at && hi < change.at + n) {
                  return '#REF!';
                }
              }
              if (newLo === null) {
                newLo = change.at; // first surviving row after the gap
              }
              if (newHi === null) {
                newHi = change.at - 1; // last surviving row before the gap
              }
              if (newHi < newLo) {
                return '#REF!';
              }
              const first = { ...start, [key]: newLo };
              const last = { ...end, [key]: newHi };
              return `${prefix ?? ''}${writeRef(first)}:${writeRef(last)}`;
            },
          ),
    )
    .join('');
};
