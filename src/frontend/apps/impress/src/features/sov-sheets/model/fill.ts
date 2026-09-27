/**
 * The fill handle, as in Excel: dragging a selection's corner extends it.
 *
 * - two or more numbers continue their series (1, 2 → 3, 4, 5…);
 * - one number is copied (as Excel does without Ctrl);
 * - text ending in a number counts on ("Item 1" → "Item 2", "Item 3"…);
 * - anything else repeats, formulas shifting their relative references.
 */
import { shiftFormula } from './shift';

export interface FillRange {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** A tidy number: 0.1 + 0.2 as 0.3, not 0.30000000000000004. */
const tidy = (x: number) => String(Number(x.toPrecision(12)));

const isPlainNumber = (s: string) =>
  s.trim() !== '' && !s.startsWith('=') && !Number.isNaN(Number(s));

const NUMBERED = /^(.*?)(\d+)$/;

/** The value for position *k* (1, 2, … away from the source) of a line. */
const extend = (
  line: string[],
  k: number,
  forward: boolean,
  shift: (source: string, from: number) => string,
): string => {
  const n = line.length;
  const numbers = line.every(isPlainNumber) ? line.map(Number) : null;
  if (numbers && n >= 2) {
    const step = (numbers[n - 1] - numbers[0]) / (n - 1);
    return tidy(forward ? numbers[n - 1] + k * step : numbers[0] - k * step);
  }
  const numbered = line.map((s) => NUMBERED.exec(s));
  if (
    !numbers &&
    numbered.every((m) => m) &&
    numbered.every((m) => m?.[1] === numbered[0]?.[1]) &&
    !line[0].startsWith('=')
  ) {
    const values = numbered.map((m) => Number(m?.[2]));
    const step = n >= 2 ? (values[n - 1] - values[0]) / (n - 1) : 1;
    const value = forward ? values[n - 1] + k * step : values[0] - k * step;
    return value >= 0 ? `${numbered[0]?.[1]}${tidy(value)}` : line[(k - 1) % n];
  }
  const i = forward ? (k - 1) % n : n - 1 - ((k - 1) % n);
  return shift(line[i], i);
};

/**
 * Edits [row, col, source] for filling *target* from *source*, and the
 * source cell each target cell takes its format from.
 */
export const fillEdits = (
  get: (row: number, col: number) => string,
  source: FillRange,
  target: FillRange,
) => {
  const edits: {
    row: number;
    col: number;
    value: string;
    from: [number, number];
  }[] = [];
  const vertical = target.bottom > source.bottom || target.top < source.top;
  if (vertical) {
    const forward = target.bottom > source.bottom;
    const rows = forward
      ? { from: source.bottom + 1, to: target.bottom }
      : { from: target.top, to: source.top - 1 };
    const n = source.bottom - source.top + 1;
    for (let col = source.left; col <= source.right; col++) {
      const line: string[] = [];
      for (let row = source.top; row <= source.bottom; row++) {
        line.push(get(row, col));
      }
      for (let row = rows.from; row <= rows.to; row++) {
        const k = forward ? row - source.bottom : source.top - row;
        const i = forward ? (k - 1) % n : n - 1 - ((k - 1) % n);
        const value = extend(line, k, forward, (src, idx) =>
          shiftFormula(src, row - (source.top + idx), 0),
        );
        edits.push({ row, col, value, from: [source.top + i, col] });
      }
    }
  } else {
    const forward = target.right > source.right;
    const cols = forward
      ? { from: source.right + 1, to: target.right }
      : { from: target.left, to: source.left - 1 };
    const n = source.right - source.left + 1;
    for (let row = source.top; row <= source.bottom; row++) {
      const line: string[] = [];
      for (let col = source.left; col <= source.right; col++) {
        line.push(get(row, col));
      }
      for (let col = cols.from; col <= cols.to; col++) {
        const k = forward ? col - source.right : source.left - col;
        const i = forward ? (k - 1) % n : n - 1 - ((k - 1) % n);
        const value = extend(line, k, forward, (src, idx) =>
          shiftFormula(src, 0, col - (source.left + idx)),
        );
        edits.push({ row, col, value, from: [row, source.left + i] });
      }
    }
  }
  return edits;
};
