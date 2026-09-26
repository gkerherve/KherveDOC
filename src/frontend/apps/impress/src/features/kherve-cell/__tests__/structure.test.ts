import { describe, expect, it } from 'vitest';

import { adjustFormula, moveIndex } from '../model/structure';

const rows = (at: number, count: number) =>
  ({ sheet: 'Data', axis: 'row', at, count }) as const;
const cols = (at: number, count: number) =>
  ({ sheet: 'Data', axis: 'col', at, count }) as const;

describe('moveIndex', () => {
  it('shifts past insertions and drops deleted indexes', () => {
    expect(moveIndex(4, 2, 3)).toBe(7);
    expect(moveIndex(1, 2, 3)).toBe(1);
    expect(moveIndex(3, 2, -2)).toBeNull();
    expect(moveIndex(5, 2, -2)).toBe(3);
  });
});

describe('adjustFormula', () => {
  it('moves references below an inserted row, absolute ones too', () => {
    // Row 3 (index 2) inserted: A3 and below move down one.
    expect(adjustFormula('=A1+A3+$B$5', 'Data', rows(2, 1))).toBe(
      '=A1+A4+$B$6',
    );
  });

  it('stretches ranges around an insertion', () => {
    expect(adjustFormula('=SUM(A1:A10)', 'Data', rows(4, 2))).toBe(
      '=SUM(A1:A12)',
    );
  });

  it('turns references into deleted rows into #REF!', () => {
    expect(adjustFormula('=A5*2+A9', 'Data', rows(4, -2))).toBe('=#REF!*2+A7');
  });

  it('shrinks ranges that lose rows', () => {
    expect(adjustFormula('=SUM(A1:A10)', 'Data', rows(2, -3))).toBe(
      '=SUM(A1:A7)',
    );
    expect(adjustFormula('=SUM(A3:A5)', 'Data', rows(2, -3))).toBe(
      '=SUM(#REF!)',
    );
    expect(adjustFormula('=SUM(A4:A10)', 'Data', rows(1, -5))).toBe(
      '=SUM(A2:A5)',
    );
  });

  it('adjusts columns', () => {
    expect(adjustFormula('=B1+D1', 'Data', cols(1, 1))).toBe('=C1+E1');
    expect(adjustFormula('=B1+D1', 'Data', cols(2, -1))).toBe('=B1+C1');
  });

  it('follows the sheet a reference points to', () => {
    // A formula on "Results" reading Data!A5, and one reading its own A5.
    expect(adjustFormula('=Data!A5+A5', 'Results', rows(0, 1))).toBe(
      '=Data!A6+A5',
    );
    expect(adjustFormula("='Data'!A5", 'Results', rows(0, 1))).toBe(
      "='Data'!A6",
    );
    expect(adjustFormula('=Other!A5', 'Data', rows(0, 1))).toBe('=Other!A5');
  });

  it('leaves text, functions and numbers alone', () => {
    expect(adjustFormula('="A5"&LOG10(A5)+1e5', 'Data', rows(0, 1))).toBe(
      '="A5"&LOG10(A6)+1e5',
    );
    expect(adjustFormula('plain A5', 'Data', rows(0, 1))).toBe('plain A5');
  });
});
