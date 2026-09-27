/**
 * Charts: a new chart from the selected cells (the way Excel guesses
 * headers and categories), and keeping a chart's ranges right when rows or
 * columns are inserted or deleted.
 */
import {
  CHART_COLORS,
  ChartSeries,
  ChartSpec,
  ChartType,
  address,
} from './layout';
import { StructureChange, adjustFormula, moveIndex } from './structure';

export interface CellRange {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

type TextAt = (row: number, col: number) => string;

export const rangeRef = ({ top, left, bottom, right }: CellRange) =>
  top === bottom && left === right
    ? address(top, left)
    : `${address(top, left)}:${address(bottom, right)}`;

const isNumber = (text: string) =>
  text.trim() !== '' && !Number.isNaN(Number(text.replace(/,/g, '')));

/**
 * The block of filled cells around (row, col), like Excel's "current
 * region": what a chart uses when only one cell is selected.
 */
export const currentRegion = (
  textAt: TextAt,
  row: number,
  col: number,
  limit = { rows: 5000, cols: 50 },
): CellRange => {
  const r: CellRange = { top: row, bottom: row, left: col, right: col };
  const filled = (rr: number, cc: number) =>
    rr >= 0 &&
    cc >= 0 &&
    rr < limit.rows &&
    cc < limit.cols &&
    textAt(rr, cc) !== '';
  const rowHas = (rr: number) => {
    for (let c = r.left - 1; c <= r.right + 1; c++) {
      if (filled(rr, c)) {
        return true;
      }
    }
    return false;
  };
  const colHas = (cc: number) => {
    for (let rr = r.top - 1; rr <= r.bottom + 1; rr++) {
      if (filled(rr, cc)) {
        return true;
      }
    }
    return false;
  };
  for (let grew = true; grew;) {
    grew = false;
    if (rowHas(r.top - 1)) {
      r.top -= 1;
      grew = true;
    }
    if (rowHas(r.bottom + 1)) {
      r.bottom += 1;
      grew = true;
    }
    if (colHas(r.left - 1)) {
      r.left -= 1;
      grew = true;
    }
    if (colHas(r.right + 1)) {
      r.right += 1;
      grew = true;
    }
  }
  return r;
};

/**
 * What to plot from *range*: a header row when the first row is text over
 * numbers, the first column as X (categories or numbers) when there are
 * several columns, and one series per remaining column.
 */
export const suggestChart = (
  textAt: TextAt,
  range: CellRange,
): Pick<ChartSpec, 'type' | 'x' | 'series' | 'title' | 'legend'> => {
  const { top, bottom, left, right } = range;
  const width = right - left + 1;
  const dataCols = width > 1 ? left + 1 : left;
  let header = false;
  if (bottom > top) {
    for (let c = dataCols; c <= right; c++) {
      const first = textAt(top, c);
      if (first !== '' && !isNumber(first) && isNumber(textAt(top + 1, c))) {
        header = true;
      }
    }
  }
  const first = header ? top + 1 : top;
  const hasX = width > 1;
  let categories = false;
  if (hasX) {
    for (let r = first; r <= bottom; r++) {
      const text = textAt(r, left);
      if (text !== '' && !isNumber(text)) {
        categories = true;
      }
    }
  }
  const series: ChartSeries[] = [];
  for (let c = dataCols; c <= right; c++) {
    series.push({
      ref: rangeRef({ top: first, bottom, left: c, right: c }),
      name: header ? textAt(top, c) : undefined,
      color: CHART_COLORS[series.length % CHART_COLORS.length],
    });
  }
  const type: ChartType = categories ? 'Bar' : 'Line';
  return {
    type,
    x: hasX ? rangeRef({ top: first, bottom, left, right: left }) : null,
    series,
    title: series.length === 1 && series[0].name ? series[0].name : undefined,
    legend: series.length > 1,
  };
};

const adjustRef = (ref: string, chartSheet: string, change: StructureChange) =>
  adjustFormula(`=${ref}`, chartSheet, change).slice(1);

/**
 * The chart after rows/columns changed: ranges follow (or become #REF!),
 * and so does the cell it is anchored to. *chartSheet* is the name of the
 * chart's sheet.
 */
export const adjustChart = (
  spec: ChartSpec,
  chartSheet: string,
  change: StructureChange,
): ChartSpec => {
  const next: ChartSpec = {
    ...spec,
    x: spec.x ? adjustRef(spec.x, chartSheet, change) : spec.x,
    series: spec.series.map((s) => ({
      ...s,
      ref: adjustRef(s.ref, chartSheet, change),
    })),
  };
  if (change.sheet.toLowerCase() === chartSheet.toLowerCase()) {
    const key = change.axis === 'row' ? 'row' : 'col';
    next[key] = moveIndex(spec[key], change.at, change.count) ?? change.at;
  }
  return next;
};
