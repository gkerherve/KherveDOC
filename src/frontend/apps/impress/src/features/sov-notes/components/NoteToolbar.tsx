/**
 * A note's toolbar, in the window's toolbar slot: typing or writing with
 * the pen, and the pen's tools, colours and sizes.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { css } from 'styled-components';

import { Box } from '@/components';
import {
  Separator,
  ToolbarButton,
  rowCss,
  toolbarCss,
} from '@/docs/doc-editor/components/SovToolbar/parts';
import { KHERVE_TOOLBAR_SLOT_ID } from '@/docs/doc-editor/components/SovToolbar/slot';
import { useEditorStore } from '@/docs/doc-editor/stores/useEditorStore';

import { PenTool } from './InkCanvas';

export const PEN_COLORS = [
  '#1f1f1f',
  '#1a5fd0',
  '#d0312d',
  '#1e8a3c',
  '#8a3ec9',
  '#f2c200',
];
export const PEN_SIZES = [2, 4, 8];

type ListType = 'bulletListItem' | 'numberedListItem' | 'checkListItem';

interface NoteToolbarProps {
  readOnly: boolean;
  drawing: boolean;
  onDrawing: (drawing: boolean) => void;
  tool: PenTool;
  onTool: (tool: PenTool) => void;
  color: string;
  onColor: (color: string) => void;
  size: number;
  onSize: (size: number) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
}

const swatchCss = (color: string, selected: boolean) => css`
  width: 22px;
  height: 22px;
  margin: 0 2px;
  border-radius: 50%;
  border: 2px solid
    ${selected ? 'var(--c--contextuals--content--semantic--brand--primary, #1a5fd0)' : 'transparent'};
  box-shadow: inset 0 0 0 9px ${color};
  background: #fff;
  cursor: pointer;
`;

const sizeCss = (size: number, selected: boolean) => css`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 4px;
  background: ${
    selected
      ? 'var(--c--contextuals--background--semantic--brand--tertiary, #e3ebfa)'
      : 'transparent'
  };
  cursor: pointer;
  &::after {
    content: '';
    width: ${size + 3}px;
    height: ${size + 3}px;
    border-radius: 50%;
    background: currentColor;
  }
`;

export const NoteToolbar = ({
  readOnly,
  drawing,
  onDrawing,
  tool,
  onTool,
  color,
  onColor,
  size,
  onSize,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onClear,
}: NoteToolbarProps) => {
  const { t } = useTranslation();
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const { editor } = useEditorStore();
  // Re-render with the caret, so the list buttons show where it is.
  const [, setTick] = useState(0);
  useEffect(
    () => editor?.onSelectionChange(() => setTick((n) => n + 1)),
    [editor],
  );

  const caretType = (() => {
    try {
      return editor?.getTextCursorPosition().block.type;
    } catch {
      return undefined;
    }
  })();

  /** The selected lines become list items, or plain text again. */
  const toggleList = (type: ListType) => {
    if (!editor) {
      return;
    }
    const next = caretType === type ? 'paragraph' : type;
    const blocks = editor.getSelection()?.blocks ?? [
      editor.getTextCursorPosition().block,
    ];
    editor.transact(() => {
      for (const block of blocks) {
        if (Array.isArray(block.content)) {
          editor.updateBlock(block, { type: next });
        }
      }
    });
    editor.focus();
  };

  const lists: { type: ListType; icon: string; label: string }[] = [
    {
      type: 'bulletListItem',
      icon: 'format_list_bulleted',
      label: t('Bulleted list'),
    },
    {
      type: 'numberedListItem',
      icon: 'format_list_numbered',
      label: t('Numbered list'),
    },
    { type: 'checkListItem', icon: 'checklist', label: t('Checklist') },
  ];

  useEffect(() => {
    setTarget(document.getElementById(KHERVE_TOOLBAR_SLOT_ID));
  }, []);

  if (readOnly) {
    return null;
  }

  const toolbar = (
    <Box $css={toolbarCss} className="--docs--note-toolbar">
      <Box $css={rowCss}>
        <ToolbarButton
          icon="text_fields"
          label={t('Type')}
          showLabel
          pressed={!drawing}
          onClick={() => onDrawing(false)}
        />
        <ToolbarButton
          icon="gesture"
          label={t('Pen')}
          showLabel
          pressed={drawing}
          onClick={() => onDrawing(true)}
        />
        {!drawing && editor && (
          <>
            <Separator />
            {lists.map(({ type, icon, label }) => (
              <ToolbarButton
                key={type}
                icon={icon}
                label={label}
                pressed={caretType === type}
                onClick={() => toggleList(type)}
              />
            ))}
          </>
        )}
        {drawing && (
          <>
            <Separator />
            <ToolbarButton
              icon="edit"
              label={t('Pen')}
              pressed={tool === 'pen'}
              onClick={() => onTool('pen')}
            />
            <ToolbarButton
              icon="border_color"
              label={t('Highlighter')}
              pressed={tool === 'highlighter'}
              onClick={() => onTool('highlighter')}
            />
            <ToolbarButton
              icon="auto_fix_normal"
              label={t('Eraser')}
              pressed={tool === 'eraser'}
              onClick={() => onTool('eraser')}
            />
            <Separator />
            {PEN_COLORS.map((c) => (
              <Box
                key={c}
                as="button"
                type="button"
                aria-label={t('Colour {{color}}', { color: c })}
                aria-pressed={color === c}
                title={c}
                $css={swatchCss(c, color === c && tool !== 'eraser')}
                onClick={() => {
                  onColor(c);
                  if (tool === 'eraser') {
                    onTool('pen');
                  }
                }}
              />
            ))}
            <Separator />
            {PEN_SIZES.map((s, i) => (
              <Box
                key={s}
                as="button"
                type="button"
                aria-label={[t('Fine'), t('Medium'), t('Thick')][i]}
                title={[t('Fine'), t('Medium'), t('Thick')][i]}
                aria-pressed={size === s}
                $css={sizeCss(s, size === s)}
                onClick={() => onSize(s)}
              />
            ))}
          </>
        )}
        <Separator />
        <ToolbarButton
          icon="undo"
          label={t('Undo drawing')}
          disabled={!canUndo}
          onClick={onUndo}
        />
        <ToolbarButton
          icon="redo"
          label={t('Redo drawing')}
          disabled={!canRedo}
          onClick={onRedo}
        />
        {drawing && (
          <ToolbarButton
            icon="delete_sweep"
            label={t('Clear the drawing')}
            onClick={onClear}
          />
        )}
      </Box>
    </Box>
  );

  return target ? createPortal(toolbar, target) : toolbar;
};
