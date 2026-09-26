/**
 * The Solver's settings follow inserted and deleted rows and columns, like
 * formulas do (its cells become #REF! when deleted).
 */
import { SolverModel } from './layout';
import { StructureChange, adjustFormula } from './structure';

const adjust = (refs: string, sheet: string, change: StructureChange) =>
  refs.trim()
    ? refs
        .split(',')
        .map((ref) => adjustFormula(`=${ref.trim()}`, sheet, change).slice(1))
        .join(',')
    : refs;

/** A cell or a number: only cells move. */
const adjustValue = (value: string, sheet: string, change: StructureChange) =>
  /^\s*\$?[A-Za-z]{1,3}\$?\d+\s*$/.test(value)
    ? adjust(value, sheet, change)
    : value;

export const adjustSolverModel = (
  model: SolverModel,
  sheet: string,
  change: StructureChange,
): SolverModel => ({
  ...model,
  objective: adjust(model.objective, sheet, change),
  variables: adjust(model.variables, sheet, change),
  target:
    model.target === undefined
      ? undefined
      : adjustValue(model.target, sheet, change),
  constraints: model.constraints.map((c) => ({
    ...c,
    cell: adjust(c.cell, sheet, change),
    value: adjustValue(c.value, sheet, change),
  })),
});
