import { columnName } from './layout';

const REF = /(?<![A-Za-z0-9_.])(\$?)([A-Za-z]{1,3})(\$?)(\d+)(?![\w(])/g;

const columnIndex = (letters: string) => {
  let index = 0;
  for (const ch of letters.toUpperCase()) {
    index = index * 26 + (ch.charCodeAt(0) - 64);
  }
  return index - 1;
};

/**
 * Move a formula's relative references by (dRow, dCol), as pasting does in
 * Excel and KherveSheet: A1 moves, $A$1 stays, $A1 / A$1 move one way.
 * Text in quotes is left alone.
 */
export const shiftFormula = (formula: string, dRow: number, dCol: number) => {
  if (!formula.startsWith('=') || (dRow === 0 && dCol === 0)) {
    return formula;
  }
  return formula
    .split(/("(?:[^"]|"")*")/)
    .map((part, index) =>
      index % 2 === 1
        ? part
        : part.replace(
            REF,
            (
              _m,
              dollarCol: string,
              letters: string,
              dollarRow: string,
              digits: string,
            ) => {
              const col = dollarCol
                ? letters.toUpperCase()
                : columnName(Math.max(0, columnIndex(letters) + dCol));
              const row = dollarRow
                ? Number(digits)
                : Math.max(1, Number(digits) + dRow);
              return `${dollarCol}${col}${dollarRow}${row}`;
            },
          ),
    )
    .join('');
};

/** Tab-separated text, as Excel puts on the clipboard. */
export const toTsv = (rows: string[][]) =>
  rows
    .map((row) =>
      row
        .map((cell) =>
          /[\t\n"]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell,
        )
        .join('\t'),
    )
    .join('\n');

/** Parse clipboard text from Excel, LibreOffice or Google Sheets. */
export const fromTsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const input = text.replace(/\r\n?/g, '\n').replace(/\n$/, '');
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"' && cell === '') {
      quoted = true;
    } else if (ch === '\t') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  rows.push(row);
  return rows;
};
