/**
 * The Solver, beside the grid (so cells can be picked while it is open):
 * KherveSheet's Solver running in the calculation engine. The solution is
 * shown first; keeping it writes it into the shared workbook (undoable).
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  SolverConstraint,
  SolverModel,
  SolverResult,
  address,
} from '../model/layout';
import type { SheetWorkbook } from '../model/workbook';

import { Check, Field } from './ChartPanel';

interface SolverPanelProps {
  workbook: SheetWorkbook;
  sheetId: string;
  /** The selected cells ("A1:C3") and the active cell ("B7"). */
  selectionRef: string;
  activeRef: string;
  readOnly: boolean;
  onClose: () => void;
}

const defaults = (objective: string): SolverModel => ({
  objective,
  goal: 'min',
  target: '0',
  variables: '',
  constraints: [],
  nonNegative: false,
  method: 'GRG Nonlinear',
  keepSearching: false,
  seconds: 30,
});

const number = (value: number | null | undefined) =>
  value === null || value === undefined
    ? '—'
    : String(Number(value.toPrecision(10)));

export const SolverPanel = ({
  workbook,
  sheetId,
  selectionRef,
  activeRef,
  readOnly,
  onClose,
}: SolverPanelProps) => {
  const { t } = useTranslation();
  // Until the sheet has Solver settings: the cell active on opening.
  const [initial] = useState(() => defaults(activeRef));
  const model = workbook.solverModel(sheetId) ?? initial;
  const [solving, setSolving] = useState(false);
  const [result, setResult] = useState<SolverResult | null>(null);
  const [draft, setDraft] = useState<SolverConstraint>({
    cell: '',
    op: '<=',
    value: '',
  });
  const update = (patch: Partial<SolverModel>) => {
    setResult(null);
    workbook.setSolverModel(sheetId, { ...model, ...patch });
  };

  const run = async () => {
    setSolving(true);
    setResult(null);
    try {
      setResult(await workbook.solve(sheetId, model));
    } catch (error) {
      setResult({ error: String(error) });
    } finally {
      setSolving(false);
    }
  };

  const keep = () => {
    if (result?.variables) {
      workbook.setCells(
        result.variables.map(
          ([row, col, source]) =>
            [sheetId, row, col, source] as [string, number, number, string],
        ),
      );
    }
    setResult(null);
  };

  const goals: [SolverModel['goal'], string][] = [
    ['max', t('Max')],
    ['min', t('Min')],
    ['value', t('Value of')],
  ];

  return (
    <aside className="kc-chart-panel" aria-label={t('Solver')}>
      <header>
        <strong>{t('Solver')}</strong>
        <button
          type="button"
          className="kc-chart-close"
          aria-label={t('Close')}
          onClick={onClose}
        >
          ×
        </button>
      </header>

      <div className="kc-pick">
        <Field
          label={t('Set objective')}
          value={model.objective}
          mono
          onCommit={(objective) => update({ objective: objective.trim() })}
        />
        <button
          type="button"
          title={t('Use the active cell ({{cell}})', { cell: activeRef })}
          onClick={() => update({ objective: activeRef })}
        >
          {activeRef}
        </button>
      </div>
      <div className="kc-solver-goal" role="radiogroup" aria-label={t('To')}>
        <span>{t('To:')}</span>
        {goals.map(([goal, label]) => (
          <label key={goal}>
            <input
              type="radio"
              name={`kc-goal-${sheetId}`}
              checked={model.goal === goal}
              onChange={() => update({ goal })}
            />
            {label}
          </label>
        ))}
      </div>
      {model.goal === 'value' && (
        <Field
          label={t('Target value (a number or a cell)')}
          value={model.target ?? '0'}
          mono
          onCommit={(target) => update({ target: target.trim() })}
        />
      )}
      <div className="kc-pick">
        <Field
          label={t('By changing variable cells')}
          value={model.variables}
          placeholder="A1:A3"
          mono
          onCommit={(variables) => update({ variables: variables.trim() })}
        />
        <button
          type="button"
          title={t('Use the selected cells ({{range}})', {
            range: selectionRef,
          })}
          onClick={() => update({ variables: selectionRef })}
        >
          {selectionRef}
        </button>
      </div>

      <h4>{t('Subject to the constraints')}</h4>
      {model.constraints.length === 0 && (
        <p className="kc-solver-none">{t('None')}</p>
      )}
      <ul className="kc-solver-constraints">
        {model.constraints.map((c, i) => (
          <li key={i}>
            <code>
              {c.cell} {c.op === '<=' ? '≤' : c.op === '>=' ? '≥' : '='}{' '}
              {c.value}
            </code>
            <button
              type="button"
              aria-label={t('Remove this constraint')}
              title={t('Remove this constraint')}
              onClick={() =>
                update({
                  constraints: model.constraints.filter((_c, j) => j !== i),
                })
              }
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="kc-solver-add">
        <input
          aria-label={t('Constraint cell')}
          placeholder={activeRef}
          value={draft.cell}
          onChange={(e) => setDraft({ ...draft, cell: e.target.value })}
        />
        <select
          aria-label={t('Relation')}
          value={draft.op}
          onChange={(e) =>
            setDraft({ ...draft, op: e.target.value as SolverConstraint['op'] })
          }
        >
          <option value="<=">≤</option>
          <option value=">=">≥</option>
          <option value="=">=</option>
        </select>
        <input
          aria-label={t('Constraint value (a number or a cell)')}
          placeholder="0"
          value={draft.value}
          onChange={(e) => setDraft({ ...draft, value: e.target.value })}
        />
        <button
          type="button"
          onClick={() => {
            const cell = draft.cell.trim() || activeRef;
            if (!draft.value.trim()) {
              return;
            }
            update({
              constraints: [
                ...model.constraints,
                { ...draft, cell, value: draft.value.trim() },
              ],
            });
            setDraft({ cell: '', op: draft.op, value: '' });
          }}
        >
          {t('Add')}
        </button>
      </div>
      <Check
        label={t('Make unconstrained variables non-negative')}
        checked={model.nonNegative}
        onChange={(nonNegative) => update({ nonNegative })}
      />

      <label className="kc-chart-field">
        <span>{t('Solving method')}</span>
        <select
          value={model.method}
          onChange={(e) =>
            update({ method: e.target.value as SolverModel['method'] })
          }
        >
          <option value="GRG Nonlinear">{t('GRG Nonlinear')}</option>
          <option value="Evolutionary">{t('Evolutionary')}</option>
        </select>
      </label>
      <Check
        label={t('Keep searching for a better solution')}
        checked={model.keepSearching}
        onChange={(keepSearching) => update({ keepSearching })}
      />
      <Field
        label={t('Stop after (seconds)')}
        value={String(model.seconds)}
        onCommit={(v) =>
          update({ seconds: Math.max(1, Math.min(600, Number(v) || 30)) })
        }
      />

      <button
        type="button"
        className="kc-chart-wide kc-solver-solve"
        disabled={solving || readOnly}
        onClick={() => void run()}
      >
        {solving ? t('Solving…') : t('Solve')}
      </button>

      {result && (
        <div className="kc-fit" aria-live="polite">
          {result.error ? (
            <span className="kc-fit-error">{result.error}</span>
          ) : (
            <>
              <p>
                <strong>
                  {result.cancelled
                    ? t('Time is up: this is the best solution found.')
                    : result.solved
                      ? t('Solver found a solution.')
                      : t('Solver could not find a solution.')}
                </strong>
              </p>
              {!result.solved && result.message && <p>{result.message}</p>}
              {result.variables && (
                <table>
                  <tbody>
                    <tr className="kc-fit-gof">
                      <th>{model.objective}</th>
                      <td>{number(result.objective)}</td>
                    </tr>
                    {result.variables.map(([row, col, source]) => (
                      <tr key={`${row},${col}`}>
                        <th>{address(row, col)}</th>
                        <td>{number(Number(source))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {result.variables && (
                <div className="kc-solver-keep">
                  <button type="button" onClick={keep}>
                    {t('Keep Solver solution')}
                  </button>
                  <button type="button" onClick={() => setResult(null)}>
                    {t('Restore original values')}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </aside>
  );
};

export const solverCss = `
  .kc-pick {
    display: flex;
    align-items: flex-end;
    gap: 6px;
  }
  .kc-pick > .kc-chart-field {
    flex: 1;
    min-width: 0;
  }
  .kc-pick > button {
    margin-bottom: 8px;
    height: 28px;
    max-width: 90px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 0 6px;
    border: 1px solid #d6d9e0;
    border-radius: 3px;
    background: #f5f6f8;
    font: 12px var(--c--globals--font--families--code, monospace);
    cursor: pointer;
  }
  .kc-solver-goal {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    margin-bottom: 8px;
  }
  .kc-solver-goal label {
    display: flex;
    align-items: center;
    gap: 3px;
  }
  .kc-solver-none {
    margin: 0 0 6px;
    color: #6b7080;
  }
  .kc-solver-constraints {
    margin: 0 0 6px;
    padding: 0;
    list-style: none;
  }
  .kc-solver-constraints li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 2px 4px;
    border-bottom: 1px solid #eef0f3;
  }
  .kc-solver-constraints button {
    border: none;
    background: none;
    cursor: pointer;
    font-size: 16px;
  }
  .kc-solver-add {
    display: flex;
    gap: 4px;
    margin-bottom: 8px;
  }
  .kc-solver-add input,
  .kc-solver-add select {
    min-width: 0;
    height: 28px;
    box-sizing: border-box;
    border: 1px solid #d6d9e0;
    border-radius: 3px;
    padding: 0 4px;
    font: 12px var(--c--globals--font--families--code, monospace);
  }
  .kc-solver-add input {
    flex: 1;
  }
  .kc-solver-add button {
    border: 1px solid #d6d9e0;
    border-radius: 3px;
    background: #f5f6f8;
    cursor: pointer;
  }
  .kc-solver-solve {
    margin-top: 8px;
    font-weight: 600;
  }
  .kc-solver-keep {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 6px;
  }
  .kc-solver-keep button {
    padding: 4px 8px;
    border: 1px solid #d6d9e0;
    border-radius: 3px;
    background: #fff;
    cursor: pointer;
  }
  .kc-fit p {
    margin: 0 0 4px;
  }
`;
