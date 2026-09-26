/**
 * Python (=PY) cells on the web: the figures they draw, over the grid; what
 * the active cell printed or its error; and the approval of Python written
 * by someone else, which never runs before this user has read it.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ROW_HEIGHT, address } from '../model/layout';
import type { PythonCell, SheetWorkbook } from '../model/workbook';

import { GridGeometry, HEADER_HEIGHT, ROW_HEADER_WIDTH } from './SheetGrid';

/** The figures of a sheet's =PY cells, just below their cell. */
export const PythonFigures = ({
  workbook,
  sheetId,
  geometry,
}: {
  workbook: SheetWorkbook;
  sheetId: string;
  geometry: GridGeometry;
}) => {
  const figures = workbook.pythonFigures(sheetId);
  const urls = useMemo(
    () =>
      figures.map(([row, col, svg]) => ({
        row,
        col,
        url: URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })),
      })),
    [figures],
  );
  useEffect(
    () => () => urls.forEach(({ url }) => URL.revokeObjectURL(url)),
    [urls],
  );
  return (
    <>
      {urls.map(({ row, col, url }) => (
        <img
          key={`${row},${col}`}
          className="kc-py-figure"
          src={url}
          alt={`${address(row, col)}`}
          draggable={false}
          style={{
            left: ROW_HEADER_WIDTH + (geometry.lefts[col] ?? 0),
            top: HEADER_HEIGHT + (row + 1) * ROW_HEIGHT,
          }}
        />
      ))}
    </>
  );
};

/** Under the formula bar: what the active =PY cell printed, or its error. */
export const PythonInfo = ({
  error,
  printed,
}: {
  error?: string;
  printed?: string;
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (!error && !printed) {
    return null;
  }
  const lines = (error ?? '').trim().split('\n');
  return (
    <div className="kc-py-info">
      {printed && (
        <pre className="kc-py-printed" aria-label={t('Printed')}>
          {printed}
        </pre>
      )}
      {error && (
        <div className="kc-py-error">
          <button type="button" onClick={() => setOpen(!open)}>
            {open ? '▾' : '▸'} {lines[lines.length - 1]}
          </button>
          {open && <pre>{error}</pre>}
        </div>
      )}
    </div>
  );
};

/** "N Python cells have not run": review the code, then run it. */
export const PythonApproval = ({
  workbook,
  cells,
  sheetName,
}: {
  workbook: SheetWorkbook;
  cells: PythonCell[];
  sheetName: (sheetId: string) => string;
}) => {
  const { t } = useTranslation();
  const [reviewing, setReviewing] = useState(false);
  const [running, setRunning] = useState(false);
  if (!cells.length) {
    return null;
  }
  const run = async () => {
    setRunning(true);
    await workbook.trustPython(cells.map((c) => c.source));
    setRunning(false);
    setReviewing(false);
  };
  return (
    <>
      <div className="kc-py-banner" role="status">
        <span>
          {t(
            'This spreadsheet has {{count}} Python cell(s) you have not approved. They have not run.',
            { count: cells.length },
          )}
        </span>
        <button type="button" onClick={() => setReviewing(true)}>
          {t('Review the code…')}
        </button>
      </div>
      {reviewing && (
        <div className="kc-py-backdrop" onMouseDown={() => setReviewing(false)}>
          <div
            className="kc-py-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={t('Python code in this spreadsheet')}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3>{t('Python code in this spreadsheet')}</h3>
            <p>
              {t(
                'Python runs in your browser and can read this spreadsheet and reach other websites. Run it only if you trust whoever wrote it.',
              )}
            </p>
            <div className="kc-py-list">
              {cells.map((c) => (
                <section key={`${c.sheetId}|${c.row},${c.col}`}>
                  <h4>
                    {sheetName(c.sheetId)}!{address(c.row, c.col)}
                  </h4>
                  <pre>{c.source}</pre>
                </section>
              ))}
            </div>
            <footer>
              <button type="button" onClick={() => setReviewing(false)}>
                {t('Not now')}
              </button>
              <button
                type="button"
                className="kc-py-run"
                disabled={running}
                onClick={() => void run()}
              >
                {running ? t('Running…') : t('Run this code')}
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
};

export const pythonCss = `
  .kc-py-figure {
    position: absolute;
    z-index: 6;
    max-width: 480px;
    background: #fff;
    border: 1px solid #d6d9e0;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
    pointer-events: none;
  }
  .kc-formula-bar textarea.kc-formula-input {
    height: auto;
    min-height: 26px;
    padding: 4px 8px;
    resize: vertical;
    line-height: 1.4;
  }
  .kc-py-hint {
    align-self: flex-start;
    padding-top: 6px;
    font-size: 11px;
    color: #6b7080;
    white-space: nowrap;
  }
  .kc-py-info {
    padding: 4px 12px;
    border-bottom: 1px solid #d6d9e0;
    font-size: 12px;
    max-height: 160px;
    overflow: auto;
  }
  .kc-py-info pre {
    margin: 2px 0;
    white-space: pre-wrap;
    font: 12px var(--c--globals--font--families--code, monospace);
  }
  .kc-py-error button {
    border: none;
    background: none;
    padding: 0;
    color: #c0392b;
    cursor: pointer;
    font: 12px var(--c--globals--font--families--code, monospace);
    text-align: left;
  }
  .kc-py-banner {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 12px;
    background: #fff8e1;
    border-bottom: 1px solid #f0d890;
    font-size: 13px;
  }
  .kc-py-banner button, .kc-py-dialog footer button {
    padding: 4px 10px;
    border: 1px solid #d6d9e0;
    border-radius: 3px;
    background: #fff;
    cursor: pointer;
  }
  .kc-py-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.3);
  }
  .kc-py-dialog {
    width: min(640px, 92vw);
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    padding: 16px 20px;
    border-radius: 6px;
    background: #fff;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.25);
  }
  .kc-py-dialog h3 {
    margin: 0 0 8px;
  }
  .kc-py-dialog p {
    margin: 0 0 12px;
    font-size: 13px;
  }
  .kc-py-list {
    overflow: auto;
    border: 1px solid #e3e5ea;
    border-radius: 4px;
  }
  .kc-py-list section {
    padding: 6px 10px;
    border-bottom: 1px solid #eef0f3;
  }
  .kc-py-list h4 {
    margin: 0 0 4px;
    font-size: 12px;
    color: #4a4f5c;
  }
  .kc-py-list pre {
    margin: 0;
    white-space: pre-wrap;
    font: 12px var(--c--globals--font--families--code, monospace);
  }
  .kc-py-dialog footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 12px;
  }
  .kc-py-dialog .kc-py-run {
    background: #1a73e8;
    border-color: #1a73e8;
    color: #fff;
  }
`;
