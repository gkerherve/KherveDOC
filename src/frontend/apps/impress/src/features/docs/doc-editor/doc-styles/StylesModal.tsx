import { COLORS_DEFAULT } from '@blocknote/core';
import { Button, Modal, ModalSize } from '@gouvfr-lasuite/ui-components';
import { ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { css } from 'styled-components';

import { Box, ButtonCloseModal, Text } from '@/components';

import {
  FIRST_LINE_INDENTS,
  LINE_SPACINGS,
  PARAGRAPH_SPACINGS,
} from '../components/custom-blocks/paragraphProps';
import { FONT_FAMILIES, FONT_SIZES } from '../components/custom-styles';

import {
  ALIGNMENTS,
  BUILTIN_TARGETS,
  BuiltinTarget,
  DocStyles,
  EMPTY_FORMAT,
  StyleFormat,
  sanitizeDocStyles,
  styleIdFor,
} from './docStyles';

type Selection =
  { kind: 'builtin'; target: BuiltinTarget } | { kind: 'custom'; id: string };

const fieldCss = css`
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  font-weight: 600;

  select,
  input[type='text'] {
    height: 34px;
    padding: 0 8px;
    border: 1px solid var(--c--contextuals--border--surface--primary);
    border-radius: 6px;
    background: var(--c--contextuals--background--surface--primary);
    font: inherit;
    font-weight: 400;
  }
`;

const listItemCss = (active: boolean) => css`
  width: 100%;
  padding: 6px 10px;
  border: none;
  border-radius: 6px;
  text-align: left;
  font-size: 14px;
  cursor: pointer;
  background: ${
    active
      ? 'var(--c--contextuals--background--semantic--brand--tertiary)'
      : 'transparent'
  };
  &:hover {
    background: var(--c--contextuals--background--semantic--neutral--tertiary);
  }
`;

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <Box as="label" $css={fieldCss}>
    {label}
    {children}
  </Box>
);

const Choice = ({
  value,
  options,
  onChange,
  inherit,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  inherit: string;
}) => (
  <select value={value} onChange={(e) => onChange(e.target.value)}>
    <option value="">{inherit}</option>
    {options.map((option) => (
      <option key={option.value} value={option.value}>
        {option.label}
      </option>
    ))}
  </select>
);

export const StylesModal = ({
  styles,
  onSave,
  onClose,
}: {
  styles: DocStyles;
  onSave: (styles: DocStyles) => void;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<DocStyles>(styles);
  const [selected, setSelected] = useState<Selection>({
    kind: 'builtin',
    target: 'paragraph',
  });

  const builtinLabels: Record<BuiltinTarget, string> = {
    paragraph: t('Body text'),
    'heading-1': t('Heading 1'),
    'heading-2': t('Heading 2'),
    'heading-3': t('Heading 3'),
    quote: t('Quote'),
  };

  const custom =
    selected.kind === 'custom'
      ? draft.custom.find((style) => style.id === selected.id)
      : undefined;
  const format: StyleFormat =
    selected.kind === 'builtin'
      ? (draft.builtins[selected.target] ?? EMPTY_FORMAT)
      : (custom ?? EMPTY_FORMAT);

  const update = (patch: Partial<StyleFormat> & { name?: string }) => {
    if (selected.kind === 'builtin') {
      setDraft({
        ...draft,
        builtins: {
          ...draft.builtins,
          [selected.target]: { ...format, ...patch },
        },
      });
    } else {
      // A style not saved yet takes its id from its name; saved styles keep
      // theirs, since paragraphs refer to it.
      const isNew = !styles.custom.some((style) => style.id === selected.id);
      const id =
        isNew && patch.name !== undefined
          ? styleIdFor(
              patch.name,
              draft.custom
                .map((style) => style.id)
                .filter((styleId) => styleId !== selected.id),
            )
          : selected.id;
      setDraft({
        ...draft,
        custom: draft.custom.map((style) =>
          style.id === selected.id ? { ...style, ...patch, id } : style,
        ),
      });
      if (id !== selected.id) {
        setSelected({ kind: 'custom', id });
      }
    }
  };

  const addStyle = () => {
    const name = t('New style');
    const id = styleIdFor(
      name,
      draft.custom.map((style) => style.id),
    );
    setDraft({
      ...draft,
      custom: [...draft.custom, { ...EMPTY_FORMAT, id, name }],
    });
    setSelected({ kind: 'custom', id });
  };

  const deleteStyle = () => {
    if (selected.kind !== 'custom') {
      return;
    }
    setDraft({
      ...draft,
      custom: draft.custom.filter((style) => style.id !== selected.id),
    });
    setSelected({ kind: 'builtin', target: 'paragraph' });
  };

  const inherit = t('Not set');
  const numberOptions = (values: readonly string[], unit: string) =>
    values.map((value) => ({ value, label: `${value} ${unit}`.trim() }));

  return (
    <Modal
      isOpen
      closeOnClickOutside
      onClose={onClose}
      hideCloseButton
      size={ModalSize.LARGE}
      aria-labelledby="styles-title"
      title={
        <>
          <Text as="h1" $margin="0" id="styles-title" $size="h6">
            {t('Paragraph styles')}
          </Text>
          <Box $position="absolute" $css="top: 4px; right: 4px;">
            <ButtonCloseModal aria-label={t('Close')} onClick={onClose} />
          </Box>
        </>
      }
      rightActions={
        <>
          <Button variant="secondary" fullWidth onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button
            variant="primary"
            fullWidth
            onClick={() => {
              onSave(sanitizeDocStyles(draft));
              onClose();
            }}
          >
            {t('Apply')}
          </Button>
        </>
      }
    >
      <Box $direction="row" $gap="1.5rem" $margin={{ bottom: 'md' }}>
        <Box $width="200px" $gap="2px" $css="flex-shrink: 0;">
          <Text $size="xs" $weight="bold" $variation="secondary">
            {t('Built-in')}
          </Text>
          {BUILTIN_TARGETS.map((target) => (
            <Box
              as="button"
              type="button"
              key={target}
              $css={listItemCss(
                selected.kind === 'builtin' && selected.target === target,
              )}
              onClick={() => setSelected({ kind: 'builtin', target })}
            >
              {builtinLabels[target]}
            </Box>
          ))}
          <Text
            $size="xs"
            $weight="bold"
            $variation="secondary"
            $margin={{ top: 'sm' }}
          >
            {t('Custom')}
          </Text>
          {draft.custom.map((style) => (
            <Box
              as="button"
              type="button"
              key={style.id}
              $css={listItemCss(
                selected.kind === 'custom' && selected.id === style.id,
              )}
              onClick={() => setSelected({ kind: 'custom', id: style.id })}
            >
              {style.name}
            </Box>
          ))}
          <Box $margin={{ top: 'xs' }}>
            <Button size="small" variant="secondary" onClick={addStyle}>
              {t('New style')}
            </Button>
          </Box>
        </Box>

        <Box
          $css={css`
            flex: 1;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 0.75rem 1rem;
            align-content: start;
          `}
        >
          {custom && (
            <Box $css="grid-column: 1 / -1;">
              <Field label={t('Style name')}>
                <input
                  type="text"
                  maxLength={60}
                  value={custom.name}
                  onChange={(e) => update({ name: e.target.value })}
                />
              </Field>
            </Box>
          )}
          <Field label={t('Font')}>
            <Choice
              inherit={inherit}
              value={format.fontFamily}
              options={FONT_FAMILIES.map((font) => ({
                value: font.name,
                label: font.name,
              }))}
              onChange={(fontFamily) => update({ fontFamily })}
            />
          </Field>
          <Field label={t('Size')}>
            <Choice
              inherit={inherit}
              value={format.fontSize}
              options={FONT_SIZES.map((size) => ({
                value: `${size}pt`,
                label: `${size} pt`,
              }))}
              onChange={(fontSize) => update({ fontSize })}
            />
          </Field>
          <Field label={t('Text colour')}>
            <Choice
              inherit={inherit}
              value={format.textColor}
              options={Object.keys(COLORS_DEFAULT).map((color) => ({
                value: color,
                label: color,
              }))}
              onChange={(textColor) => update({ textColor })}
            />
          </Field>
          <Field label={t('Alignment')}>
            <Choice
              inherit={inherit}
              value={format.textAlignment}
              options={ALIGNMENTS.map((value) => ({ value, label: t(value) }))}
              onChange={(textAlignment) =>
                update({
                  textAlignment: textAlignment as StyleFormat['textAlignment'],
                })
              }
            />
          </Field>
          <Field label={t('Line spacing')}>
            <Choice
              inherit={inherit}
              value={format.lineSpacing}
              options={numberOptions(LINE_SPACINGS, '')}
              onChange={(lineSpacing) => update({ lineSpacing })}
            />
          </Field>
          <Field label={t('First-line indent')}>
            <Choice
              inherit={inherit}
              value={format.firstLineIndent}
              options={numberOptions(FIRST_LINE_INDENTS, 'cm')}
              onChange={(firstLineIndent) => update({ firstLineIndent })}
            />
          </Field>
          <Field label={t('Space above')}>
            <Choice
              inherit={inherit}
              value={format.spaceBefore}
              options={numberOptions(PARAGRAPH_SPACINGS, 'pt')}
              onChange={(spaceBefore) => update({ spaceBefore })}
            />
          </Field>
          <Field label={t('Space below')}>
            <Choice
              inherit={inherit}
              value={format.spaceAfter}
              options={numberOptions(PARAGRAPH_SPACINGS, 'pt')}
              onChange={(spaceAfter) => update({ spaceAfter })}
            />
          </Field>
          <Box $direction="row" $gap="1rem" $css="grid-column: 1 / -1;">
            {(['bold', 'italic', 'underline'] as const).map((key) => (
              <Box
                as="label"
                key={key}
                $direction="row"
                $align="center"
                $gap="6px"
                $css="font-size: 14px;"
              >
                <input
                  type="checkbox"
                  checked={format[key]}
                  onChange={(e) => update({ [key]: e.target.checked })}
                />
                {t(
                  key === 'bold'
                    ? 'Bold'
                    : key === 'italic'
                      ? 'Italic'
                      : 'Underline',
                )}
              </Box>
            ))}
          </Box>
          {custom && (
            <Box $css="grid-column: 1 / -1;">
              <Button
                size="small"
                color="error"
                variant="secondary"
                onClick={deleteStyle}
              >
                {t('Delete this style')}
              </Button>
            </Box>
          )}
        </Box>
      </Box>
    </Modal>
  );
};
