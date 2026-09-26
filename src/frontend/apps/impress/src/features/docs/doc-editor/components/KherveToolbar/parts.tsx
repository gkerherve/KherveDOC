import { COLORS_DEFAULT } from '@blocknote/core';
import { ReactNode } from 'react';
import { createGlobalStyle, css } from 'styled-components';

import { Box, Icon } from '@/components';

export type ColorKind = 'textColor' | 'backgroundColor';

export const IS_MAC =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(navigator.platform);
export const MOD = IS_MAC ? '⌘' : 'Ctrl+';
export const SHIFT = IS_MAC ? '⇧' : 'Shift+';

// react-aria caps popovers to the viewport height; let long menus scroll
// inside them instead of stretching the page.
export const ScrollableMenus = createGlobalStyle`
  .--docs--drop-button-popover:has([role='menu']) {
    overflow-y: auto;
  }
`;

export const toolbarCss = css`
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: 4px 12px;
  border-top: 1px solid var(--c--contextuals--border--surface--primary);
  border-bottom: 1px solid var(--c--contextuals--border--surface--primary);
  background: var(--c--contextuals--background--surface--secondary, #f6f7f9);
`;

export const rowCss = css`
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
  min-height: 34px;
`;

const buttonCss = css`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-width: 30px;
  height: 30px;
  padding: 0 4px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--c--contextuals--content--semantic--neutral--primary);
  font-size: 13px;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: var(--c--contextuals--background--semantic--neutral--tertiary);
  }
  &[aria-pressed='true'] {
    background: var(--c--contextuals--background--semantic--brand--tertiary);
    color: var(--c--contextuals--content--semantic--brand--primary);
  }
  &:disabled {
    opacity: 0.35;
    cursor: default;
  }
  &:focus-visible {
    outline: 2px solid var(--c--contextuals--border--semantic--brand--primary);
  }
`;

export const ToolbarButton = ({
  icon,
  label,
  shortcut,
  pressed,
  disabled,
  onClick,
  children,
  showLabel,
}: {
  icon?: string;
  label: string;
  shortcut?: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children?: ReactNode;
  showLabel?: boolean;
}) => (
  <Box
    as="button"
    type="button"
    $css={buttonCss}
    title={shortcut ? `${label} (${shortcut})` : label}
    aria-label={label}
    aria-pressed={pressed === undefined ? undefined : pressed}
    disabled={disabled}
    // Keep the editor's selection: a toolbar click must not take focus away.
    onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
    onClick={onClick}
  >
    {icon && <Icon iconName={icon} $size="20px" $theme="inherit" />}
    {children}
    {showLabel && <span>{label}</span>}
  </Box>
);

export const Separator = () => (
  <Box
    aria-hidden
    $css={css`
      width: 1px;
      height: 22px;
      margin: 0 3px;
      background: var(--c--contextuals--border--surface--primary);
    `}
  />
);

export const DropdownTrigger = ({
  label,
  children,
  width,
}: {
  label: string;
  children: ReactNode;
  width?: string;
}) => (
  <Box
    $direction="row"
    $align="center"
    $gap="2px"
    $height="30px"
    $padding={{ horizontal: '4px' }}
    $css={css`
      ${
        width
          ? `width: ${width}; border: 1px solid var(--c--contextuals--border--surface--primary); background: var(--c--contextuals--background--surface--primary);`
          : ''
      }
      border-radius: 4px;
      font-size: 13px;
      color: var(--c--contextuals--content--semantic--neutral--primary);
      &:hover {
        background: var(
          --c--contextuals--background--semantic--neutral--tertiary
        );
      }
    `}
    title={label}
  >
    {children}
    <Icon iconName="arrow_drop_down" $size="18px" $theme="inherit" />
  </Box>
);

export const TriggerText = ({ children }: { children: ReactNode }) => (
  <Box
    as="span"
    $css={css`
      flex: 1;
      text-align: left;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    `}
  >
    {children}
  </Box>
);

export const Swatch = ({ color, kind }: { color: string; kind: ColorKind }) => {
  const hex =
    color === 'default'
      ? undefined
      : COLORS_DEFAULT[color]?.[kind === 'textColor' ? 'text' : 'background'];
  return (
    <Box
      $width="18px"
      $height="18px"
      $align="center"
      $justify="center"
      $css={css`
        border-radius: 3px;
        border: 1px solid var(--c--contextuals--border--surface--primary);
        font-weight: 700;
        font-size: 12px;
        ${kind === 'backgroundColor' && hex ? `background: ${hex};` : ''}
        ${kind === 'textColor' && hex ? `color: ${hex};` : ''}
      `}
    >
      A
    </Box>
  );
};

export const popoverPanelCss = css`
  padding: 8px;
  max-width: 340px;
`;

/** The ¶ glyph of the formatting-marks button, sized like the icons. */
export const pilcrowCss = css`
  display: inline-flex;
  width: 20px;
  justify-content: center;
  font-size: 18px;
  font-weight: 700;
  line-height: 20px;
`;
