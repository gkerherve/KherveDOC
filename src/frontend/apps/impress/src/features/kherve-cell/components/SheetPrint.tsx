/**
 * Printing a spreadsheet: a dialog (what, paper, orientation, gridlines,
 * headings, fit to width), then a print-only copy of the used cells, with
 * their formats, charts and Python figures, and the browser's (or the
 * desktop app's) print.
 */
import { CSSProperties, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import {
  CellFormat,
  ROW_HEIGHT,
  alignmentOf,
  columnName,
} from '../model/layout';
import type { SheetWorkbook } from '../model/workbook';

type Scope = 'sheet' | 'all' | 'selection';

export interface PrintOptions {
  scope: Scope;
  paper: 'A4' | 'Letter' | 'A3';
  orientation: 'portrait' | 'landscape';
  gridlines: boolean;
  headings: boolean;
  fitWidth: boolean;
}

interface CellRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

const PAPERS = {
  A4: [21, 29.7],
  Letter: [21.59, 27.94],
  A3: [29.7, 42],
} as const;
const MARGIN_CM = 1.2;
const HEADING_WIDTH = 40;
const PX_PER_CM = 96 / 2.54;

interface PrintBlock {
  sheetId: string;
  name: string;
  range: CellRect;
  pictures: { left: number; top: number; width: number; url: string }[];
}

/** A cell's look on paper (as on screen, plus borders). */
const cellStyle = (
  text: string,
  fmt: CellFormat | undefined,
  width: number,
): CSSProperties => {
  const numeric = text !== '' && !Number.isNaN(Number(text.replace(/,/g, '')));
  const border = (side: 'top' | 'bottom' | 'left' | 'right') => {
    const b = fmt?.[`b_${side}`] as
      { style?: number; color?: string; width?: number } | undefined;
    if (!b) {
      return undefined;
    }
    const style = b.style === 2 ? 'dashed' : b.style === 3 ? 'dotted' : 'solid';
    return `${Math.max(1, Math.round(b.width ?? 1))}px ${style} ${b.color ?? '#000'}`;
  };
  return {
    width,
    maxWidth: width,
    textAlign: alignmentOf(fmt?.alignment) ?? (numeric ? 'right' : 'left'),
    fontWeight: fmt?.bold ? 700 : undefined,
    fontStyle: fmt?.italic ? 'italic' : undefined,
    textDecoration: fmt?.underline ? 'underline' : undefined,
    color: fmt?.font_color,
    background: fmt?.bg,
    fontFamily: fmt?.font_family,
    fontSize: fmt?.font_size ? `${fmt.font_size}pt` : undefined,
    whiteSpace: fmt?.wrap_text ? 'normal' : 'nowrap',
    borderTop: border('top'),
    borderBottom: border('bottom'),
    borderLeft: border('left'),
    borderRight: border('right'),
  };
};

const PrintSheet = ({
  workbook,
  block,
  options,
  printableWidth,
}: {
  workbook: SheetWorkbook;
  block: PrintBlock;
  options: PrintOptions;
  printableWidth: number;
}) => {
  const { sheetId, range } = block;
  const cols: number[] = [];
  for (let c = range.left; c <= range.right; c++) {
    cols.push(c);
  }
  const rows: number[] = [];
  for (let r = range.top; r <= range.bottom; r++) {
    rows.push(r);
  }
  const widths = cols.map((c) => workbook.width(sheetId, c));
  const heading = options.headings ? HEADING_WIDTH : 0;
  const total = heading + widths.reduce((a, b) => a + b, 0);
  const zoom =
    options.fitWidth && total > printableWidth ? printableWidth / total : 1;
  return (
    <section
      className={`kc-print-sheet${options.gridlines ? ' kc-print-grid' : ''}`}
      style={{ zoom }}
    >
      <div className="kc-print-frame" style={{ width: total }}>
        <table>
          <colgroup>
            {options.headings && <col style={{ width: HEADING_WIDTH }} />}
            {widths.map((w, i) => (
              <col key={i} style={{ width: w }} />
            ))}
          </colgroup>
          {options.headings && (
            <thead>
              <tr>
                <th />
                {cols.map((c) => (
                  <th key={c}>{columnName(c)}</th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {rows.map((r) => (
              <tr key={r}>
                {options.headings && <th>{r + 1}</th>}
                {cols.map((c, i) => {
                  const text = workbook.text(sheetId, r, c);
                  return (
                    <td
                      key={c}
                      style={cellStyle(
                        text,
                        workbook.format(sheetId, r, c),
                        widths[i],
                      )}
                    >
                      {text}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {block.pictures.map((p, i) => (
          <img
            key={i}
            alt=""
            src={p.url}
            style={{
              left: heading + p.left,
              top: (options.headings ? ROW_HEIGHT : 0) + p.top,
              width: p.width,
            }}
          />
        ))}
      </div>
    </section>
  );
};

const svgUrl = (svg: string) =>
  URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));

/** The charts and figures of a sheet inside *range*, placed in pixels. */
const picturesFor = async (
  workbook: SheetWorkbook,
  sheetId: string,
  range: CellRect,
) => {
  const x = (col: number) => {
    let left = 0;
    for (let c = range.left; c < col; c++) {
      left += workbook.width(sheetId, c);
    }
    return left;
  };
  const inside = (row: number, col: number) =>
    row >= range.top &&
    row <= range.bottom &&
    col >= range.left &&
    col <= range.right;
  const pictures: PrintBlock['pictures'] = [];
  for (const { spec } of workbook.charts(sheetId)) {
    if (!inside(spec.row, spec.col)) {
      continue;
    }
    const result = await workbook.renderChart(spec);
    if (result.svg) {
      pictures.push({
        left: x(spec.col) + (spec.dx ?? 0),
        top: (spec.row - range.top) * ROW_HEIGHT + (spec.dy ?? 0),
        width: spec.width,
        url: svgUrl(result.svg),
      });
    }
  }
  for (const [row, col, svg] of workbook.pythonFigures(sheetId)) {
    if (inside(row, col)) {
      pictures.push({
        left: x(col),
        top: (row + 1 - range.top) * ROW_HEIGHT,
        width: 480,
        url: svgUrl(svg),
      });
    }
  }
  return pictures;
};

/** Prints once rendered, then calls onDone. */
const PrintJob = ({
  workbook,
  blocks,
  options,
  onDone,
}: {
  workbook: SheetWorkbook;
  blocks: PrintBlock[];
  options: PrintOptions;
  onDone: () => void;
}) => {
  const [w, h] = PAPERS[options.paper];
  const [pageW, pageH] = options.orientation === 'landscape' ? [h, w] : [w, h];
  const printableWidth = (pageW - 2 * MARGIN_CM) * PX_PER_CM;

  useEffect(() => {
    // The desktop app prints with this page setup (see its app.py).
    const previous = window.__khervePageSetup;
    window.__khervePageSetup = {
      paperWidthCm: w,
      paperHeightCm: h,
      orientation: options.orientation,
      marginsCm: {
        left: MARGIN_CM,
        top: MARGIN_CM,
        right: MARGIN_CM,
        bottom: MARGIN_CM,
      },
    };
    let done = false;
    const finish = () => {
      if (done) {
        return;
      }
      done = true;
      window.__khervePageSetup = previous;
      blocks.forEach((b) =>
        b.pictures.forEach((p) => URL.revokeObjectURL(p.url)),
      );
      onDone();
    };
    window.addEventListener('afterprint', finish, { once: true });
    const timer = window.setTimeout(() => window.print(), 300);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('afterprint', finish);
    };
    // Printing happens once per job.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div className="kc-print-root">
      <style>{`@page { size: ${pageW}cm ${pageH}cm; margin: ${MARGIN_CM}cm; }`}</style>
      {blocks.map((block) => (
        <div key={block.sheetId} className="kc-print-page">
          {blocks.length > 1 && <h2>{block.name}</h2>}
          <PrintSheet
            workbook={workbook}
            block={block}
            options={options}
            printableWidth={printableWidth}
          />
        </div>
      ))}
    </div>,
    document.body,
  );
};

export const PrintDialog = ({
  workbook,
  sheetId,
  selection,
  onClose,
}: {
  workbook: SheetWorkbook;
  sheetId: string;
  selection: CellRect;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const [options, setOptions] = useState<PrintOptions>({
    scope: 'sheet',
    paper: 'A4',
    orientation: 'landscape',
    gridlines: true,
    headings: false,
    fitWidth: true,
  });
  const [job, setJob] = useState<PrintBlock[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [empty, setEmpty] = useState(false);
  const set = (patch: Partial<PrintOptions>) =>
    setOptions((o) => ({ ...o, ...patch }));

  const start = async () => {
    setBusy(true);
    const sheets =
      options.scope === 'all'
        ? workbook.sheets()
        : workbook.sheets().filter((s) => s.id === sheetId);
    const blocks: PrintBlock[] = [];
    for (const { id, meta } of sheets) {
      const range =
        options.scope === 'selection' ? selection : workbook.usedRange(id);
      if (range) {
        blocks.push({
          sheetId: id,
          name: meta.name,
          range,
          pictures: await picturesFor(workbook, id, range),
        });
      }
    }
    setBusy(false);
    if (blocks.length) {
      setJob(blocks);
    } else {
      setEmpty(true);
    }
  };

  if (job) {
    return (
      <PrintJob
        workbook={workbook}
        blocks={job}
        options={options}
        onDone={onClose}
      />
    );
  }

  const radio = <K extends keyof PrintOptions>(
    key: K,
    value: PrintOptions[K],
    label: string,
  ) => (
    <label>
      <input
        type="radio"
        checked={options[key] === value}
        onChange={() => set({ [key]: value })}
      />
      {label}
    </label>
  );
  const check = (key: 'gridlines' | 'headings' | 'fitWidth', label: string) => (
    <label>
      <input
        type="checkbox"
        checked={options[key]}
        onChange={(e) => set({ [key]: e.target.checked })}
      />
      {label}
    </label>
  );

  return (
    <div className="kc-py-backdrop" onMouseDown={onClose}>
      <div
        className="kc-py-dialog kc-print-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t('Print')}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <h3>{t('Print')}</h3>
        <fieldset>
          <legend>{t('What')}</legend>
          {radio('scope', 'sheet', t('This sheet'))}
          {radio('scope', 'all', t('All sheets'))}
          {radio('scope', 'selection', t('The selected cells'))}
        </fieldset>
        <fieldset>
          <legend>{t('Paper')}</legend>
          <select
            value={options.paper}
            aria-label={t('Paper size')}
            onChange={(e) =>
              set({ paper: e.target.value as PrintOptions['paper'] })
            }
          >
            <option value="A4">A4</option>
            <option value="A3">A3</option>
            <option value="Letter">Letter</option>
          </select>
          {radio('orientation', 'portrait', t('Portrait'))}
          {radio('orientation', 'landscape', t('Landscape'))}
        </fieldset>
        <fieldset>
          <legend>{t('Layout')}</legend>
          {check('gridlines', t('Gridlines'))}
          {check('headings', t('Row and column headings'))}
          {check('fitWidth', t('Fit all columns on the page width'))}
        </fieldset>
        {empty && <p>{t('There is nothing to print.')}</p>}
        <footer>
          <button type="button" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button
            type="button"
            className="kc-py-run"
            disabled={busy}
            onClick={() => void start()}
          >
            {busy ? t('Preparing…') : t('Print…')}
          </button>
        </footer>
      </div>
    </div>
  );
};

export const printCss = `
  .kc-print-root { display: none; }
  .kc-print-dialog fieldset {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    margin: 0 0 10px;
    padding: 6px 10px;
    border: 1px solid #e3e5ea;
    border-radius: 4px;
    font-size: 13px;
  }
  .kc-print-dialog label {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  @media print {
    body > *:not(.kc-print-root) { display: none !important; }
    .kc-print-root {
      display: block !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      font: 10pt var(--c--globals--font--families--base, sans-serif);
      color: #000;
    }
    .kc-print-page + .kc-print-page { break-before: page; }
    .kc-print-page h2 { font-size: 12pt; margin: 0 0 6px; }
    .kc-print-frame { position: relative; }
    .kc-print-frame table {
      border-collapse: collapse;
      table-layout: fixed;
    }
    .kc-print-frame td, .kc-print-frame th {
      height: ${ROW_HEIGHT - 1}px;
      padding: 0 4px;
      overflow: hidden;
      text-overflow: clip;
      font-size: 10pt;
    }
    .kc-print-grid td { border: 1px solid #c9ccd3; }
    .kc-print-frame th {
      background: #f1f3f6;
      border: 1px solid #c9ccd3;
      font-weight: 500;
      color: #4a4f5c;
    }
    .kc-print-frame tr { break-inside: avoid; }
    .kc-print-frame img {
      position: absolute;
      border: 1px solid #d6d9e0;
      background: #fff;
    }
  }
`;
