import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { css } from 'styled-components';

import { Box, DropButton, Icon, Text } from '@/components';

import { popoverPanelCss } from './parts';

const pickerButtonCss = css`
  height: 30px;
  padding: 0 4px;
  border-radius: 4px;
  color: var(--c--contextuals--content--semantic--neutral--primary);
`;

const MAX_ROWS = 10;
const MAX_COLS = 10;

export const TableGridPicker = ({
  onPick,
}: {
  onPick: (rows: number, cols: number) => void;
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [hover, setHover] = useState({ rows: 0, cols: 0 });

  return (
    <DropButton
      label={t('Insert table')}
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      buttonCss={pickerButtonCss}
      button={
        <Box $direction="row" $align="center" title={t('Insert table')}>
          <Icon iconName="table_chart" $size="20px" $theme="inherit" />
          <Icon iconName="arrow_drop_down" $size="18px" $theme="inherit" />
        </Box>
      }
    >
      <Box
        $css={popoverPanelCss}
        onMouseLeave={() => setHover({ rows: 0, cols: 0 })}
      >
        <Box
          role="grid"
          aria-label={t('Insert table')}
          $css={css`
            display: grid;
            grid-template-columns: repeat(${MAX_COLS}, 18px);
            gap: 2px;
          `}
        >
          {Array.from({ length: MAX_ROWS * MAX_COLS }, (_, index) => {
            const rows = Math.floor(index / MAX_COLS) + 1;
            const cols = (index % MAX_COLS) + 1;
            const active = rows <= hover.rows && cols <= hover.cols;
            return (
              <Box
                key={index}
                as="button"
                type="button"
                aria-label={`${rows} × ${cols}`}
                onMouseEnter={() => setHover({ rows, cols })}
                onFocus={() => setHover({ rows, cols })}
                onClick={() => {
                  setIsOpen(false);
                  onPick(rows, cols);
                }}
                $css={css`
                  width: 18px;
                  height: 18px;
                  padding: 0;
                  border-radius: 2px;
                  cursor: pointer;
                  border: 1px solid
                    var(--c--contextuals--border--surface--primary);
                  background: ${
                    active
                      ? 'var(--c--contextuals--background--semantic--brand--tertiary)'
                      : 'var(--c--contextuals--background--surface--primary)'
                  };
                `}
              />
            );
          })}
        </Box>
        <Text $size="sm" $margin={{ top: '6px' }} $align="center">
          {hover.rows ? `${hover.rows} × ${hover.cols}` : t('Pick a size')}
        </Text>
      </Box>
    </DropButton>
  );
};

const SYMBOL_GROUPS: { label: string; chars: string }[] = [
  { label: 'Punctuation', chars: '…–—«»‹›„“”‘’·•§¶†‡‰′″' },
  { label: 'Math', chars: '±×÷≈≠≤≥∞√∑∏∫∂∆∇∈∉⊂⊃∪∩∧∨¬∀∃°‰½¼¾' },
  { label: 'Greek', chars: 'αβγδεζηθικλμνξπρστυφχψωΓΔΘΛΞΠΣΦΨΩ' },
  { label: 'Arrows', chars: '←→↑↓↔⇐⇒⇔↦' },
  { label: 'Currency & signs', chars: '€£¥₹¢₩₽©®™✓✗★☆' },
];

export const SymbolPicker = ({
  onPick,
}: {
  onPick: (symbol: string) => void;
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <DropButton
      label={t('Special character')}
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      buttonCss={pickerButtonCss}
      button={
        <Box $direction="row" $align="center" title={t('Special character')}>
          <Box
            as="span"
            $css="font-size: 17px; font-weight: 600; width: 20px; text-align: center;"
          >
            Ω
          </Box>
          <Icon iconName="arrow_drop_down" $size="18px" $theme="inherit" />
        </Box>
      }
    >
      <Box $css={popoverPanelCss} $gap="6px">
        {SYMBOL_GROUPS.map((group) => (
          <Box key={group.label} $gap="2px">
            <Text $size="xs" $weight="bold">
              {t(group.label)}
            </Text>
            <Box $direction="row" $css="flex-wrap: wrap; gap: 2px;">
              {Array.from(group.chars).map((char) => (
                <Box
                  key={char}
                  as="button"
                  type="button"
                  aria-label={char}
                  onClick={() => {
                    setIsOpen(false);
                    onPick(char);
                  }}
                  $css={css`
                    width: 28px;
                    height: 28px;
                    padding: 0;
                    border: 1px solid
                      var(--c--contextuals--border--surface--primary);
                    border-radius: 4px;
                    background: var(
                      --c--contextuals--background--surface--primary
                    );
                    font-size: 16px;
                    cursor: pointer;
                    &:hover {
                      background: var(
                        --c--contextuals--background--semantic--brand--tertiary
                      );
                    }
                  `}
                >
                  {char}
                </Box>
              ))}
            </Box>
          </Box>
        ))}
      </Box>
    </DropButton>
  );
};
