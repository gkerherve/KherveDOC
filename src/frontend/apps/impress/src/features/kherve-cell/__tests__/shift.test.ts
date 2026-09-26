import { describe, expect, it } from 'vitest';

import { fromTsv, shiftFormula, toTsv } from '../model/shift';

describe('shiftFormula', () => {
  it('moves relative references and keeps absolute ones', () => {
    expect(shiftFormula('=A1+$B$2+C$3+$D4', 2, 1)).toBe('=B3+$B$2+D$3+$D6');
    expect(shiftFormula('=SUM(A1:A10)*2', 1, 0)).toBe('=SUM(A2:A11)*2');
  });

  it('leaves text, functions, numbers and other sheets alone', () => {
    expect(shiftFormula('="A1"&A1', 1, 0)).toBe('="A1"&A2');
    expect(shiftFormula('=LOG10(A1)+1e20', 1, 0)).toBe('=LOG10(A2)+1e20');
    expect(shiftFormula('plain A1', 1, 0)).toBe('plain A1');
  });

  it('never goes above row 1 or left of column A', () => {
    expect(shiftFormula('=B2', -5, -5)).toBe('=A1');
  });
});

describe('clipboard text', () => {
  it('round-trips tabs, line breaks and quotes', () => {
    const rows = [
      ['a', 'b\tc'],
      ['say "hi"', 'x\ny'],
    ];
    expect(fromTsv(toTsv(rows))).toEqual(rows);
  });

  it('reads Excel clipboard text', () => {
    expect(fromTsv('1\t2\r\n3\t4\r\n')).toEqual([
      ['1', '2'],
      ['3', '4'],
    ]);
  });
});
