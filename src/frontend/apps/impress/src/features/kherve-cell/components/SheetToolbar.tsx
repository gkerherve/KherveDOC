/**
 * The spreadsheet's toolbar, in the window's toolbar slot like the text
 * editor's: undo, font styles, colours, alignment and number formats.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { Box } from '@/components';
import {
  MOD,
  Separator,
  ToolbarButton,
  rowCss,
  toolbarCss,
} from '@/docs/doc-editor/components/KherveToolbar/parts';
import { KHERVE_TOOLBAR_SLOT_ID } from '@/docs/doc-editor/components/KherveToolbar/slot';

import { ALIGN, CellFormat, alignmentOf } from '../model/layout';

/** The number formats KherveSheet's engine understands. */
const NUMBER_FORMATS: [string, string][] = [
  ['General', 'General'],
  ['0', '0'],
  ['0.0', '0.0'],
  ['0.00', '0.00'],
  ['0.000', '0.000'],
  ['Percentage', 'Percent'],
  ['Currency:€', 'Currency €'],
  ['Currency:$', 'Currency $'],
  ['Currency:£', 'Currency £'],
  ['Scientific', 'Scientific'],
  ['Date:%d/%m/%Y', 'Date 31/12/2026'],
  ['Date:%Y-%m-%d', 'Date 2026-12-31'],
  ['Time:%H:%M', 'Time 13:45'],
  ['Text', 'Text'],
];

interface SheetToolbarProps {
  format?: CellFormat;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onToggle: (flag: 'bold' | 'italic' | 'underline') => void;
  onFormat: (patch: Partial<CellFormat> | null) => void;
  frozen: boolean;
  onSort: (descending: boolean) => void;
  onFreeze: () => void;
  onInsertChart: () => void;
  onSolver: () => void;
  solverOpen: boolean;
  onImportXlsx: () => void;
  onDownloadXlsx: () => void;
  onPrint: () => void;
}

const ColorButton = ({
  icon,
  label,
  value,
  onChange,
}: {
  icon: string;
  label: string;
  value?: string;
  onChange: (color: string) => void;
}) => (
  <label className="kc-color-button" title={label}>
    <span className="material-icons" aria-hidden>
      {icon}
    </span>
    <span
      className="kc-color-swatch"
      style={{ background: value ?? 'transparent' }}
    />
    <input
      type="color"
      aria-label={label}
      value={value ?? '#000000'}
      onChange={(e) => onChange(e.target.value)}
    />
  </label>
);

export const SheetToolbar = ({
  format,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onToggle,
  onFormat,
  frozen,
  onSort,
  onFreeze,
  onInsertChart,
  onSolver,
  solverOpen,
  onImportXlsx,
  onDownloadXlsx,
  onPrint,
}: SheetToolbarProps) => {
  const { t } = useTranslation();
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setTarget(document.getElementById(KHERVE_TOOLBAR_SLOT_ID));
  }, []);

  const align = alignmentOf(format?.alignment);
  const toolbar = (
    <Box role="toolbar" className="--docs--kherve-toolbar" $css={toolbarCss}>
      <Box role="group" aria-label={t('Spreadsheet')} $css={rowCss}>
        <ToolbarButton
          icon="undo"
          label={t('Undo')}
          shortcut={`${MOD}Z`}
          disabled={!canUndo}
          onClick={onUndo}
        />
        <ToolbarButton
          icon="redo"
          label={t('Redo')}
          shortcut={`${MOD}Y`}
          disabled={!canRedo}
          onClick={onRedo}
        />
        <Separator />
        <ToolbarButton
          icon="format_bold"
          label={t('Bold')}
          shortcut={`${MOD}B`}
          pressed={!!format?.bold}
          onClick={() => onToggle('bold')}
        />
        <ToolbarButton
          icon="format_italic"
          label={t('Italic')}
          shortcut={`${MOD}I`}
          pressed={!!format?.italic}
          onClick={() => onToggle('italic')}
        />
        <ToolbarButton
          icon="format_underlined"
          label={t('Underline')}
          shortcut={`${MOD}U`}
          pressed={!!format?.underline}
          onClick={() => onToggle('underline')}
        />
        <ColorButton
          icon="format_color_text"
          label={t('Text colour')}
          value={format?.font_color}
          onChange={(color) => onFormat({ font_color: color })}
        />
        <ColorButton
          icon="format_color_fill"
          label={t('Fill colour')}
          value={format?.bg}
          onChange={(color) => onFormat({ bg: color })}
        />
        <Separator />
        {(['left', 'center', 'right'] as const).map((value) => (
          <ToolbarButton
            key={value}
            icon={`format_align_${value}`}
            label={
              {
                left: t('Align left'),
                center: t('Center'),
                right: t('Align right'),
              }[value]
            }
            pressed={align === value}
            onClick={() =>
              onFormat({
                alignment: align === value ? undefined : ALIGN[value],
              })
            }
          />
        ))}
        <Separator />
        <select
          className="kc-number-format"
          aria-label={t('Number format')}
          value={format?.number_format ?? 'General'}
          onChange={(e) =>
            onFormat({
              number_format:
                e.target.value === 'General' ? undefined : e.target.value,
            })
          }
        >
          {NUMBER_FORMATS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <ToolbarButton
          icon="format_clear"
          label={t('Clear formatting')}
          onClick={() => onFormat(null)}
        />
        <Separator />
        <ToolbarButton label={t('Sort A → Z')} onClick={() => onSort(false)}>
          <span className="kc-text-button">A→Z</span>
        </ToolbarButton>
        <ToolbarButton label={t('Sort Z → A')} onClick={() => onSort(true)}>
          <span className="kc-text-button">Z→A</span>
        </ToolbarButton>
        <ToolbarButton
          icon="ac_unit"
          label={
            frozen
              ? t('Unfreeze panes')
              : t('Freeze panes (rows above and columns left of the cell)')
          }
          pressed={frozen}
          onClick={onFreeze}
        />
        <Separator />
        <ToolbarButton
          icon="insert_chart"
          label={t('Insert chart (from the selected cells)')}
          onClick={onInsertChart}
        />
        <ToolbarButton
          icon="query_stats"
          label={t('Solver (find the values that give the best result)')}
          pressed={solverOpen}
          onClick={onSolver}
        />
        <Separator />
        <ToolbarButton
          icon="upload_file"
          label={t('Import an Excel file (.xlsx) — its sheets are added')}
          onClick={onImportXlsx}
        />
        <ToolbarButton
          icon="download"
          label={t('Download as Excel (.xlsx)')}
          onClick={onDownloadXlsx}
        />
        <ToolbarButton
          icon="print"
          label={t('Print (Ctrl+P)')}
          onClick={onPrint}
        />
      </Box>
    </Box>
  );
  return target ? createPortal(toolbar, target) : toolbar;
};
