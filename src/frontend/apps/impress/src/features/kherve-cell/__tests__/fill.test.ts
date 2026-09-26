import { describe, expect, it } from 'vitest';

import { fillEdits } from '../model/fill';

const grid = (cells: Record<string, string>) => (row: number, col: number) =>
  cells[`${row},${col}`] ?? '';

const values = (edits: ReturnType<typeof fillEdits>) =>
  edits.map((e) => e.value);

describe('fill handle', () => {
  it('continues a number series down', () => {
    const edits = fillEdits(
      grid({ '0,0': '1', '1,0': '2' }),
      { top: 0, bottom: 1, left: 0, right: 0 },
      { top: 0, bottom: 4, left: 0, right: 0 },
    );
    expect(values(edits)).toEqual(['3', '4', '5']);
    expect(edits.map((e) => e.row)).toEqual([2, 3, 4]);
  });

  it('keeps decimals tidy and fills upwards', () => {
    const up = fillEdits(
      grid({ '5,0': '0.1', '6,0': '0.2' }),
      { top: 5, bottom: 6, left: 0, right: 0 },
      { top: 3, bottom: 6, left: 0, right: 0 },
    );
    expect(values(up)).toEqual(['-0.1', '0']);
  });

  it('copies a single number and counts text with a number', () => {
    expect(
      values(
        fillEdits(
          grid({ '0,0': '7' }),
          { top: 0, bottom: 0, left: 0, right: 0 },
          { top: 0, bottom: 2, left: 0, right: 0 },
        ),
      ),
    ).toEqual(['7', '7']);
    expect(
      values(
        fillEdits(
          grid({ '0,0': 'Item 1' }),
          { top: 0, bottom: 0, left: 0, right: 0 },
          { top: 0, bottom: 2, left: 0, right: 0 },
        ),
      ),
    ).toEqual(['Item 2', 'Item 3']);
  });

  it('repeats formulas with shifted references, across as well', () => {
    const down = fillEdits(
      grid({ '0,1': '=A1*2' }),
      { top: 0, bottom: 0, left: 1, right: 1 },
      { top: 0, bottom: 2, left: 1, right: 1 },
    );
    expect(values(down)).toEqual(['=A2*2', '=A3*2']);
    const across = fillEdits(
      grid({ '1,0': '=A1', '1,1': 'x' }),
      { top: 1, bottom: 1, left: 0, right: 1 },
      { top: 1, bottom: 1, left: 0, right: 3 },
    );
    expect(values(across)).toEqual(['=C1', 'x']);
    expect(across.map((e) => e.from)).toEqual([
      [1, 0],
      [1, 1],
    ]);
  });

  it('repeats a text pattern', () => {
    expect(
      values(
        fillEdits(
          grid({ '0,0': 'a', '1,0': 'b' }),
          { top: 0, bottom: 1, left: 0, right: 0 },
          { top: 0, bottom: 4, left: 0, right: 0 },
        ),
      ),
    ).toEqual(['a', 'b', 'a']);
  });
});
