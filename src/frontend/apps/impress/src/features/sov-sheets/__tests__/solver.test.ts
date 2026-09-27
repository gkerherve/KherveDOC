import { describe, expect, it } from 'vitest';

import { adjustSolverModel } from '../model/solver';

describe('solver settings', () => {
  it('follow inserted and deleted rows', () => {
    const model = adjustSolverModel(
      {
        objective: 'B10',
        goal: 'value',
        target: 'C1',
        variables: 'A1:A3,$C$5',
        constraints: [{ cell: 'A2', op: '<=', value: '5' }],
        nonNegative: false,
        method: 'GRG Nonlinear',
        keepSearching: false,
        seconds: 30,
      },
      'Sheet1',
      { sheet: 'Sheet1', axis: 'row', at: 1, count: 2 },
    );
    expect(model.objective).toBe('B12');
    expect(model.target).toBe('C1');
    expect(model.variables).toBe('A1:A5,$C$7');
    expect(model.constraints[0]).toEqual({ cell: 'A4', op: '<=', value: '5' });
  });
});
