/**
 * The chart editor, beside the grid: type, titles, the ranges plotted and
 * their series, legend, grid lines and log scales. Everything is saved in
 * the shared workbook as it is changed, so collaborators see it too.
 */
import { KeyboardEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  CHART_COLORS,
  CHART_TYPES,
  ChartSeries,
  ChartSpec,
  ChartType,
} from '../model/layout';
import type { SheetWorkbook } from '../model/workbook';

interface ChartPanelProps {
  workbook: SheetWorkbook;
  chartId: string;
  /** The selected cells, as a range ("A1:C10"). */
  selectionRef: string;
  onUseSelection: () => void;
  onClose: () => void;
}

/** A text box saved when left or on Enter (not on every key). */
const Field = ({
  label,
  value,
  placeholder,
  onCommit,
  mono = false,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onCommit: (value: string) => void;
  mono?: boolean;
}) => {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft !== value) {
      onCommit(draft);
    }
  };
  return (
    <label className="kc-chart-field">
      <span>{label}</span>
      <input
        value={draft}
        placeholder={placeholder}
        className={mono ? 'kc-mono' : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Enter') {
            commit();
          } else if (e.key === 'Escape') {
            setDraft(value);
          }
        }}
      />
    </label>
  );
};

const Check = ({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) => (
  <label className="kc-chart-check">
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
    />
    {label}
  </label>
);

export const ChartPanel = ({
  workbook,
  chartId,
  selectionRef,
  onUseSelection,
  onClose,
}: ChartPanelProps) => {
  const { t } = useTranslation();
  const spec = workbook.chart(chartId);
  if (!spec) {
    return null;
  }
  const update = (patch: Partial<ChartSpec>) =>
    workbook.updateChart(chartId, patch);
  const setSeries = (series: ChartSeries[]) => update({ series });
  const typeLabels: Record<ChartType, string> = {
    Line: t('Line'),
    'Line+Symbol': t('Line and markers'),
    Scatter: t('Scatter (points)'),
    Bar: t('Columns'),
    Step: t('Steps'),
    Stem: t('Stems'),
    Histogram: t('Histogram'),
    Box: t('Box plot'),
    Pie: t('Pie'),
    Doughnut: t('Doughnut'),
    '3D Pie': t('3D pie'),
    Heatmap: t('Heat map'),
    '3D Surface': t('3D surface'),
  };

  return (
    <aside className="kc-chart-panel" aria-label={t('Chart')}>
      <header>
        <strong>{t('Chart')}</strong>
        <button
          type="button"
          className="kc-chart-close"
          aria-label={t('Close')}
          onClick={onClose}
        >
          ×
        </button>
      </header>

      <label className="kc-chart-field">
        <span>{t('Type')}</span>
        <select
          value={spec.type}
          onChange={(e) => update({ type: e.target.value as ChartType })}
        >
          {CHART_TYPES.map((type) => (
            <option key={type} value={type}>
              {typeLabels[type]}
            </option>
          ))}
        </select>
      </label>
      <Field
        label={t('Title')}
        value={spec.title ?? ''}
        onCommit={(title) => update({ title })}
      />
      <Field
        label={t('X axis title')}
        value={spec.xLabel ?? ''}
        onCommit={(xLabel) => update({ xLabel })}
      />
      <Field
        label={t('Y axis title')}
        value={spec.yLabel ?? ''}
        onCommit={(yLabel) => update({ yLabel })}
      />

      <h4>{t('Data')}</h4>
      <button type="button" className="kc-chart-wide" onClick={onUseSelection}>
        {t('Use the selected cells ({{range}})', { range: selectionRef })}
      </button>
      <Field
        label={t('X values or categories')}
        value={spec.x ?? ''}
        placeholder={t('None: 1, 2, 3…')}
        mono
        onCommit={(x) => update({ x: x.trim() || null })}
      />
      {spec.series.map((series, index) => (
        <fieldset key={index} className="kc-chart-series">
          <legend>
            <input
              type="color"
              aria-label={t('Colour')}
              value={series.color ?? CHART_COLORS[index % CHART_COLORS.length]}
              onChange={(e) =>
                setSeries(
                  spec.series.map((s, i) =>
                    i === index ? { ...s, color: e.target.value } : s,
                  ),
                )
              }
            />
            {t('Series {{n}}', { n: index + 1 })}
            <button
              type="button"
              aria-label={t('Remove this series')}
              title={t('Remove this series')}
              onClick={() =>
                setSeries(spec.series.filter((_s, i) => i !== index))
              }
            >
              ×
            </button>
          </legend>
          <Field
            label={t('Values')}
            value={series.ref}
            mono
            onCommit={(ref) =>
              setSeries(
                spec.series.map((s, i) =>
                  i === index ? { ...s, ref: ref.trim() } : s,
                ),
              )
            }
          />
          <Field
            label={t('Name')}
            value={series.name ?? ''}
            onCommit={(name) =>
              setSeries(
                spec.series.map((s, i) =>
                  i === index ? { ...s, name: name || undefined } : s,
                ),
              )
            }
          />
        </fieldset>
      ))}
      <button
        type="button"
        className="kc-chart-wide"
        onClick={() =>
          setSeries([
            ...spec.series,
            {
              ref: selectionRef,
              color: CHART_COLORS[spec.series.length % CHART_COLORS.length],
            },
          ])
        }
      >
        {t('Add a series (the selected cells)')}
      </button>

      <h4>{t('Options')}</h4>
      <Check
        label={t('Legend')}
        checked={spec.legend ?? spec.series.length > 1}
        onChange={(legend) => update({ legend })}
      />
      <Check
        label={t('Grid lines')}
        checked={Boolean(spec.grid)}
        onChange={(grid) => update({ grid })}
      />
      <Check
        label={t('Logarithmic X axis')}
        checked={Boolean(spec.logX)}
        onChange={(logX) => update({ logX })}
      />
      <Check
        label={t('Logarithmic Y axis')}
        checked={Boolean(spec.logY)}
        onChange={(logY) => update({ logY })}
      />

      <button
        type="button"
        className="kc-chart-wide kc-chart-delete"
        onClick={() => {
          workbook.removeChart(chartId);
          onClose();
        }}
      >
        {t('Delete chart')}
      </button>
    </aside>
  );
};

export const chartPanelCss = `
  .kc-chart-panel {
    width: 280px;
    flex: none;
    overflow-y: auto;
    box-sizing: border-box;
    padding: 8px 12px 16px;
    border-left: 1px solid #d6d9e0;
    background: var(--c--contextuals--background--surface--primary, #fff);
    font-size: 13px;
  }
  .kc-chart-panel header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }
  .kc-chart-panel h4 {
    margin: 14px 0 6px;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #6b7080;
  }
  .kc-chart-close {
    border: none;
    background: none;
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
  }
  .kc-chart-field {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-bottom: 8px;
  }
  .kc-chart-field > span {
    color: #4a4f5c;
  }
  .kc-chart-field input,
  .kc-chart-field select {
    height: 28px;
    box-sizing: border-box;
    border: 1px solid #d6d9e0;
    border-radius: 3px;
    padding: 0 6px;
    font: inherit;
  }
  .kc-chart-field .kc-mono {
    font-family: var(--c--globals--font--families--code, monospace);
  }
  .kc-chart-check {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 4px;
  }
  .kc-chart-series {
    margin: 0 0 8px;
    padding: 6px 8px 0;
    border: 1px solid #e3e5ea;
    border-radius: 4px;
  }
  .kc-chart-series legend {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 4px;
  }
  .kc-chart-series legend input {
    width: 22px;
    height: 22px;
    padding: 0;
    border: none;
    background: none;
  }
  .kc-chart-series legend button {
    border: none;
    background: none;
    cursor: pointer;
    font-size: 16px;
  }
  .kc-chart-wide {
    width: 100%;
    margin-bottom: 8px;
    padding: 5px 8px;
    border: 1px solid #d6d9e0;
    border-radius: 3px;
    background: #f5f6f8;
    cursor: pointer;
    font: inherit;
  }
  .kc-chart-delete {
    margin-top: 12px;
    color: #c0392b;
  }
`;
