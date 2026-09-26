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
  ChartFit,
  ChartSeries,
  ChartSpec,
  ChartTrendline,
  ChartType,
  FIT_MODELS,
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
  const trendlines = spec.trendlines ?? [];
  const setTrendlines = (next: ChartTrendline[]) =>
    update({ trendlines: next });
  const setTrendline = (index: number, patch: Partial<ChartTrendline>) =>
    setTrendlines(
      trendlines.map((tl, i) => (i === index ? { ...tl, ...patch } : tl)),
    );
  const removeSeries = (index: number) =>
    update({
      series: spec.series.filter((_s, i) => i !== index),
      // Its trendlines go; those of later series follow their series.
      trendlines: trendlines
        .filter((tl) => tl.series !== index)
        .map((tl) =>
          tl.series > index ? { ...tl, series: tl.series - 1 } : tl,
        ),
    });
  const fits = workbook.chartFits(chartId);
  const xy = ![
    'Pie',
    'Doughnut',
    '3D Pie',
    'Histogram',
    'Box',
    'Heatmap',
    '3D Surface',
  ].includes(spec.type);
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
              onClick={() => removeSeries(index)}
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

      {xy && (
        <>
          <h4>{t('Trendlines')}</h4>
          {trendlines.map((tl, index) => (
            <TrendlineEditor
              key={index}
              trendline={tl}
              fit={fits[index]}
              seriesNames={spec.series.map(
                (s, i) => s.name || t('Series {{n}}', { n: i + 1 }),
              )}
              onChange={(patch) => setTrendline(index, patch)}
              onRemove={() =>
                setTrendlines(trendlines.filter((_tl, i) => i !== index))
              }
            />
          ))}
          <button
            type="button"
            className="kc-chart-wide"
            disabled={!spec.series.length}
            onClick={() =>
              setTrendlines([
                ...trendlines,
                {
                  series: 0,
                  model: 'Linear',
                  showEquation: true,
                  showR2: true,
                },
              ])
            }
          >
            {t('Add a trendline')}
          </button>
        </>
      )}

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

/** Shows a fitted number without noise: 6 significant digits. */
const num = (value: number | null | undefined) =>
  value === null || value === undefined ? '—' : Number(value.toPrecision(6));

const TrendlineEditor = ({
  trendline,
  fit,
  seriesNames,
  onChange,
  onRemove,
}: {
  trendline: ChartTrendline;
  fit?: ChartFit;
  seriesNames: string[];
  onChange: (patch: Partial<ChartTrendline>) => void;
  onRemove: () => void;
}) => {
  const { t } = useTranslation();
  return (
    <fieldset className="kc-chart-series">
      <legend>
        <input
          type="color"
          aria-label={t('Colour')}
          value={trendline.color ?? '#d62728'}
          onChange={(e) => onChange({ color: e.target.value })}
        />
        {trendline.model}
        <button
          type="button"
          aria-label={t('Remove this trendline')}
          title={t('Remove this trendline')}
          onClick={onRemove}
        >
          ×
        </button>
      </legend>
      <label className="kc-chart-field">
        <span>{t('Series')}</span>
        <select
          value={trendline.series}
          onChange={(e) => onChange({ series: Number(e.target.value) })}
        >
          {seriesNames.map((name, i) => (
            <option key={i} value={i}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label className="kc-chart-field">
        <span>{t('Model')}</span>
        <select
          value={trendline.model}
          onChange={(e) => onChange({ model: e.target.value })}
        >
          {FIT_MODELS.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
      </label>
      {trendline.model === 'Polynomial' && (
        <Field
          label={t('Order')}
          value={String(trendline.polyOrder ?? 2)}
          onCommit={(v) =>
            onChange({ polyOrder: Math.max(1, Math.min(9, Number(v) || 2)) })
          }
        />
      )}
      {trendline.model === 'Moving Average' ? (
        <Field
          label={t('Period')}
          value={String(trendline.maPeriod ?? 2)}
          onCommit={(v) => onChange({ maPeriod: Math.max(2, Number(v) || 2) })}
        />
      ) : (
        <div className="kc-chart-pair">
          <Field
            label={t('Forecast forward')}
            value={String(trendline.forward ?? 0)}
            onCommit={(v) => onChange({ forward: Math.max(0, Number(v) || 0) })}
          />
          <Field
            label={t('Backward')}
            value={String(trendline.backward ?? 0)}
            onCommit={(v) =>
              onChange({ backward: Math.max(0, Number(v) || 0) })
            }
          />
        </div>
      )}
      <Check
        label={t('Show the equation')}
        checked={Boolean(trendline.showEquation)}
        onChange={(showEquation) => onChange({ showEquation })}
      />
      <Check
        label={t('Show R²')}
        checked={Boolean(trendline.showR2)}
        onChange={(showR2) => onChange({ showR2 })}
      />
      {fit && (
        <div className="kc-fit" aria-live="polite">
          {fit.error ? (
            <span className="kc-fit-error">{fit.error}</span>
          ) : (
            <>
              <div className="kc-fit-equation">{fit.equation}</div>
              <table>
                <tbody>
                  {Object.entries(fit.params ?? {}).map(([name, value]) => (
                    <tr key={name}>
                      <th>{name}</th>
                      <td>{num(value)}</td>
                      <td>
                        {fit.errors?.[name] !== undefined &&
                          `± ${num(fit.errors[name])}`}
                      </td>
                    </tr>
                  ))}
                  {(['R²', 'Adjusted R²', 'RMSE'] as const).map((name) => (
                    <tr key={name} className="kc-fit-gof">
                      <th>{name}</th>
                      <td colSpan={2}>{num(fit.gof?.[name])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </fieldset>
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
    width: 100%;
    min-width: 0;
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
    min-width: 0;
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
  .kc-chart-pair {
    display: flex;
    gap: 8px;
  }
  .kc-chart-pair > * {
    flex: 1;
    min-width: 0;
  }
  .kc-fit {
    margin: 4px 0 8px;
    padding: 6px;
    border-radius: 3px;
    background: #f5f6f8;
    font-size: 12px;
  }
  .kc-fit-equation {
    margin-bottom: 4px;
    font-family: var(--c--globals--font--families--code, monospace);
    word-break: break-word;
  }
  .kc-fit table {
    width: 100%;
    border-collapse: collapse;
  }
  .kc-fit th {
    text-align: left;
    font-weight: 500;
    padding-right: 6px;
  }
  .kc-fit td {
    font-variant-numeric: tabular-nums;
    word-break: break-all;
  }
  .kc-fit-gof th, .kc-fit-gof td {
    border-top: 1px solid #e3e5ea;
  }
  .kc-fit-error {
    color: #c0392b;
  }
  .kc-chart-delete {
    margin-top: 12px;
    color: #c0392b;
  }
`;
