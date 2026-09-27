/**
 * The presentation's toolbar, in the window's toolbar slot like the text
 * editor's: slides, boxes, text styles, colours, arrangement, the theme and
 * presenting. On the web the File/Edit/… menus sit above it (the desktop
 * app shows them in its own menu bar).
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { Box, DropdownMenu, DropdownMenuOption } from '@/components';
import {
  Menu,
  MenuBar,
} from '@/docs/doc-editor/components/KherveToolbar/MenuBar';
import { hasNativeMenus } from '@/docs/doc-editor/components/KherveToolbar/nativeMenus';
import {
  MOD,
  Separator,
  ToolbarButton,
  rowCss,
  toolbarCss,
} from '@/docs/doc-editor/components/KherveToolbar/parts';
import { KHERVE_TOOLBAR_SLOT_ID } from '@/docs/doc-editor/components/KherveToolbar/slot';

import { SlideElement, TextStyle, effectiveStyle } from '../model/types';

export const FONT_SIZES = [
  12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 72, 96,
];

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
  <label className="ks-color-button" title={label}>
    <span className="material-icons" aria-hidden>
      {icon}
    </span>
    <span
      className="ks-color-swatch"
      style={{ background: value && value !== 'none' ? value : 'transparent' }}
    />
    <input
      type="color"
      aria-label={label}
      value={
        value && value.startsWith('#') && value.length === 7 ? value : '#000000'
      }
      onChange={(e) => onChange(e.target.value)}
    />
  </label>
);

export interface SlideToolbarProps {
  menus: Menu[];
  readOnly: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  newSlideOptions: DropdownMenuOption[];
  shapeOptions: DropdownMenuOption[];
  themeOptions: DropdownMenuOption[];
  onTextBox: () => void;
  onImage: () => void;
  /** The first selected box (its style shows in the toolbar). */
  selected?: SlideElement;
  hasSelection: boolean;
  onStyle: (patch: Partial<TextStyle>) => void;
  onElement: (patch: Partial<SlideElement>) => void;
  onRestack: (toFront: boolean) => void;
  onDelete: () => void;
  background?: string;
  onBackground: (color: string | undefined) => void;
  onPresent: () => void;
}

export const SlideToolbar = (props: SlideToolbarProps) => {
  const { t } = useTranslation();
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setTarget(document.getElementById(KHERVE_TOOLBAR_SLOT_ID));
  }, []);

  const el = props.selected;
  const style: TextStyle = el ? effectiveStyle(el) : {};
  const hasText =
    !!el &&
    el.type !== 'image' &&
    !(el.type === 'shape' && (el.shape === 'line' || el.shape === 'arrow'));
  const disabled = props.readOnly;

  const toolbar = (
    <Box role="toolbar" className="--docs--kherve-toolbar" $css={toolbarCss}>
      {!hasNativeMenus() && (
        <Box $css={rowCss}>
          <MenuBar menus={props.menus} />
        </Box>
      )}
      <Box role="group" aria-label={t('Slides')} $css={rowCss}>
        {!disabled && (
          <>
            <ToolbarButton
              icon="undo"
              label={t('Undo')}
              shortcut={`${MOD}Z`}
              disabled={!props.canUndo}
              onClick={props.onUndo}
            />
            <ToolbarButton
              icon="redo"
              label={t('Redo')}
              shortcut={`${MOD}Y`}
              disabled={!props.canRedo}
              onClick={props.onRedo}
            />
            <Separator />
            <DropdownMenu
              options={props.newSlideOptions}
              label={t('New slide')}
            >
              <span className="ks-drop" title={t('New slide')}>
                <span className="material-icons" aria-hidden>
                  add_box
                </span>
                {t('New slide')}
                <span className="material-icons" aria-hidden>
                  arrow_drop_down
                </span>
              </span>
            </DropdownMenu>
            <ToolbarButton
              icon="title"
              label={t('Text box')}
              onClick={props.onTextBox}
            />
            <DropdownMenu options={props.shapeOptions} label={t('Shape')}>
              <span className="ks-drop" title={t('Shape')}>
                <span className="material-icons" aria-hidden>
                  category
                </span>
                <span className="material-icons" aria-hidden>
                  arrow_drop_down
                </span>
              </span>
            </DropdownMenu>
            <ToolbarButton
              icon="image"
              label={t('Picture…')}
              onClick={props.onImage}
            />
            <Separator />
            <select
              className="ks-select"
              aria-label={t('Font size')}
              disabled={!hasText}
              value={style.size ?? 24}
              onChange={(e) => props.onStyle({ size: Number(e.target.value) })}
            >
              {Array.from(
                new Set([...FONT_SIZES, Math.round(style.size ?? 24)]),
              )
                .sort((a, b) => a - b)
                .map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
            </select>
            <ToolbarButton
              icon="format_bold"
              label={t('Bold')}
              shortcut={`${MOD}B`}
              disabled={!hasText}
              pressed={!!style.bold}
              onClick={() => props.onStyle({ bold: !style.bold })}
            />
            <ToolbarButton
              icon="format_italic"
              label={t('Italic')}
              shortcut={`${MOD}I`}
              disabled={!hasText}
              pressed={!!style.italic}
              onClick={() => props.onStyle({ italic: !style.italic })}
            />
            <ToolbarButton
              icon="format_underlined"
              label={t('Underline')}
              shortcut={`${MOD}U`}
              disabled={!hasText}
              pressed={!!style.underline}
              onClick={() => props.onStyle({ underline: !style.underline })}
            />
            {hasText && (
              <ColorButton
                icon="format_color_text"
                label={t('Text colour')}
                value={style.color}
                onChange={(color) => props.onStyle({ color })}
              />
            )}
            {props.hasSelection && el?.type !== 'image' && (
              <ColorButton
                icon="format_color_fill"
                label={t('Fill colour')}
                value={el?.fill}
                onChange={(fill) => props.onElement({ fill })}
              />
            )}
            {props.hasSelection && el?.type === 'shape' && (
              <ColorButton
                icon="border_color"
                label={t('Line colour')}
                value={el?.stroke}
                onChange={(stroke) => props.onElement({ stroke })}
              />
            )}
            <Separator />
            {(['left', 'center', 'right'] as const).map((align) => (
              <ToolbarButton
                key={align}
                icon={`format_align_${align}`}
                label={
                  {
                    left: t('Align left'),
                    center: t('Center'),
                    right: t('Align right'),
                  }[align]
                }
                disabled={!hasText}
                pressed={(style.align ?? 'left') === align && hasText}
                onClick={() => props.onStyle({ align })}
              />
            ))}
            {(['top', 'middle', 'bottom'] as const).map((valign) => (
              <ToolbarButton
                key={valign}
                icon={`vertical_align_${valign === 'middle' ? 'center' : valign}`}
                label={
                  { top: t('Top'), middle: t('Middle'), bottom: t('Bottom') }[
                    valign
                  ]
                }
                disabled={!hasText}
                pressed={(style.valign ?? 'top') === valign && hasText}
                onClick={() => props.onStyle({ valign })}
              />
            ))}
            <ToolbarButton
              icon="format_list_bulleted"
              label={t('Bullets')}
              disabled={!hasText}
              pressed={!!style.bullets}
              onClick={() =>
                props.onStyle({ bullets: !style.bullets, numbered: false })
              }
            />
            <ToolbarButton
              icon="format_list_numbered"
              label={t('Numbered list')}
              disabled={!hasText}
              pressed={!!style.numbered}
              onClick={() =>
                props.onStyle({ numbered: !style.numbered, bullets: false })
              }
            />
            <Separator />
            <ToolbarButton
              icon="flip_to_front"
              label={t('Bring to front')}
              disabled={!props.hasSelection}
              onClick={() => props.onRestack(true)}
            />
            <ToolbarButton
              icon="flip_to_back"
              label={t('Send to back')}
              disabled={!props.hasSelection}
              onClick={() => props.onRestack(false)}
            />
            <ToolbarButton
              icon="delete"
              label={t('Delete')}
              disabled={!props.hasSelection}
              onClick={props.onDelete}
            />
            <Separator />
            <ColorButton
              icon="wallpaper"
              label={t('Slide background')}
              value={props.background}
              onChange={(color) => props.onBackground(color)}
            />
            <DropdownMenu options={props.themeOptions} label={t('Theme')}>
              <span className="ks-drop" title={t('Theme')}>
                <span className="material-icons" aria-hidden>
                  palette
                </span>
                {t('Theme')}
                <span className="material-icons" aria-hidden>
                  arrow_drop_down
                </span>
              </span>
            </DropdownMenu>
            <Separator />
          </>
        )}
        <ToolbarButton
          icon="slideshow"
          label={t('Present')}
          shortcut="F5"
          showLabel
          onClick={props.onPresent}
        />
      </Box>
    </Box>
  );
  return target ? createPortal(toolbar, target) : toolbar;
};
