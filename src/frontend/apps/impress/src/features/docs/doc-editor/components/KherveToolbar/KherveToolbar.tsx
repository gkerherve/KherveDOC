import { COLORS_DEFAULT } from '@blocknote/core';
import {
  BlockTypeSelectItem,
  blockTypeSelectItems,
  useBlockNoteEditor,
  useDictionary,
  useEditorState,
} from '@blocknote/react';
import { ReactNode, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { createGlobalStyle, css } from 'styled-components';

import {
  Box,
  DropdownMenu,
  DropdownMenuOption,
  Icon,
  Text,
} from '@/components';

import {
  DocsBlockSchema,
  DocsInlineContentSchema,
  DocsStyleSchema,
} from '../../types';
import { useDocsSlashMenuItems } from '../BlockNoteSuggestionMenu';

type TextStyle = 'bold' | 'italic' | 'underline' | 'strike' | 'code';
type Alignment = 'left' | 'center' | 'right' | 'justify';
type ListType = 'bulletListItem' | 'numberedListItem' | 'checkListItem';
type ColorKind = 'textColor' | 'backgroundColor';

const IS_MAC =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = IS_MAC ? '⌘' : 'Ctrl+';
const SHIFT = IS_MAC ? '⇧' : 'Shift+';

// react-aria caps the popover to the viewport height; let long menus scroll
// inside it instead of stretching the page.
const ScrollableMenus = createGlobalStyle`
  .--docs--drop-button-popover:has([role='menu']) {
    overflow-y: auto;
  }
`;

const toolbarCss = css`
  position: sticky;
  top: 0;
  /* Above BlockNote's selection toolbar (z-index 40) so it never covers us. */
  z-index: 50;
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
  margin: 0 0 var(--c--globals--spacings--sm);
  padding: 4px 6px;
  border: 1px solid var(--c--contextuals--border--surface--primary);
  border-radius: 8px;
  background: var(--c--contextuals--background--surface--primary);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
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

const ToolbarButton = ({
  icon,
  label,
  shortcut,
  pressed,
  disabled,
  onClick,
  children,
}: {
  icon: string;
  label: string;
  shortcut?: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children?: ReactNode;
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
    <Icon iconName={icon} $size="20px" $theme="inherit" />
    {children}
  </Box>
);

const Separator = () => (
  <Box
    aria-hidden
    $css={css`
      width: 1px;
      height: 20px;
      margin: 0 4px;
      background: var(--c--contextuals--border--surface--primary);
    `}
  />
);

const DropdownTrigger = ({
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
      ${width ? `width: ${width};` : ''}
      border-radius: 4px;
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

const Swatch = ({ color, kind }: { color: string; kind: ColorKind }) => {
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

export const KherveToolbar = ({
  target,
  aiAllowed,
}: {
  target: HTMLElement | null;
  aiAllowed: boolean;
}) => {
  const editor = useBlockNoteEditor<
    DocsBlockSchema,
    DocsInlineContentSchema,
    DocsStyleSchema
  >();
  const dict = useDictionary();
  const { t } = useTranslation();
  const slashMenuItems = useDocsSlashMenuItems(aiAllowed);
  const [linkDraft, setLinkDraft] = useState<string | null>(null);

  const state = useEditorState({
    editor,
    selector: ({ editor }) => {
      const styles = editor.getActiveStyles() as Record<string, unknown>;
      const blocks = editor.getSelection()?.blocks ?? [
        editor.getTextCursorPosition().block,
      ];
      const block = blocks[0];
      const props = block.props as Record<string, unknown>;
      return {
        styles: {
          bold: !!styles.bold,
          italic: !!styles.italic,
          underline: !!styles.underline,
          strike: !!styles.strike,
          code: !!styles.code,
        },
        textColor: (styles.textColor as string) || 'default',
        backgroundColor: (styles.backgroundColor as string) || 'default',
        blockType: block.type as string,
        blockProps: props,
        textAlignment: (props.textAlignment as Alignment) ?? 'left',
        hasAlignment: 'textAlignment' in props,
        hasText: Array.isArray(block.content),
        // Tables hold styled text too, just not as a plain inline array.
        canFormat: block.content !== undefined,
        canNest: editor.canNestBlock(),
        canUnnest: editor.canUnnestBlock(),
        link: editor.getSelectedLinkUrl() ?? '',
        editable: editor.isEditable,
      };
    },
  });

  const blockTypes = useMemo(() => {
    const schema = editor.schema.blockSchema as Record<
      string,
      { propSchema?: { level?: { values?: readonly number[] } } }
    >;
    return blockTypeSelectItems(dict).filter((item) => {
      if (!(item.type in schema)) {
        return false;
      }
      const level = item.props?.level;
      const levels = schema[item.type].propSchema?.level?.values;
      return level === undefined || !levels || levels.includes(Number(level));
    });
  }, [dict, editor]);

  if (!target || !state?.editable) {
    return null;
  }

  const selectedBlocks = () =>
    editor.getSelection()?.blocks ?? [editor.getTextCursorPosition().block];

  // Act on the editor's stored selection before refocusing: when a menu or the
  // link box had focus, refocusing first lets the browser collapse it. The
  // second focus runs after a closing dropdown hands focus back to its button.
  const run = (action: () => void) => {
    action();
    editor.focus();
    requestAnimationFrame(() => editor.focus());
  };

  const isSelectedType = (item: BlockTypeSelectItem) =>
    item.type === state.blockType &&
    Object.entries(item.props ?? {}).every(
      ([key, value]) => state.blockProps[key] === value,
    );
  const currentType = blockTypes.find(isSelectedType);

  const setBlockType = (type: string, props?: Record<string, unknown>) =>
    run(() =>
      editor.transact(() => {
        for (const block of selectedBlocks()) {
          if (Array.isArray(block.content)) {
            editor.updateBlock(block, { type, props } as Parameters<
              typeof editor.updateBlock
            >[1]);
          }
        }
      }),
    );

  const toggleList = (type: ListType) =>
    setBlockType(state.blockType === type ? 'paragraph' : type);

  const setAlignment = (textAlignment: Alignment) =>
    run(() =>
      editor.transact(() => {
        for (const block of selectedBlocks()) {
          if ('textAlignment' in block.props) {
            editor.updateBlock(block, { props: { textAlignment } });
          }
        }
      }),
    );

  const toggleStyle = (style: TextStyle) =>
    run(() => editor.toggleStyles({ [style]: true }));

  const setColor = (kind: ColorKind, color: string) =>
    run(() =>
      color === 'default'
        ? editor.removeStyles({ [kind]: 'default' })
        : editor.addStyles({ [kind]: color }),
    );

  const applyLink = () => {
    const value = (linkDraft ?? '').trim();
    setLinkDraft(null);
    if (!value || value === 'https://') {
      editor.focus();
      return;
    }
    const url = /^(https?:|mailto:)/i.test(value) ? value : `https://${value}`;
    run(() =>
      editor.getSelectedText()
        ? editor.createLink(url)
        : editor.createLink(url, url),
    );
  };

  const cancelLink = () => {
    setLinkDraft(null);
    editor.focus();
  };

  const colorOptions = (kind: ColorKind): DropdownMenuOption[] =>
    ['default', ...Object.keys(COLORS_DEFAULT)].map((color) => ({
      label:
        dict.color_picker.colors[
          color as keyof typeof dict.color_picker.colors
        ] ?? color,
      icon: <Swatch color={color} kind={kind} />,
      isSelected:
        (kind === 'textColor' ? state.textColor : state.backgroundColor) ===
        color,
      callback: () => setColor(kind, color),
    }));

  const insertOptions: DropdownMenuOption[] = slashMenuItems.map(
    (item, index) => ({
      label: item.title,
      icon: item.icon,
      showSeparator:
        index < slashMenuItems.length - 1 &&
        slashMenuItems[index + 1].group !== item.group,
      callback: () => run(() => item.onItemClick()),
    }),
  );

  const styleButtons: {
    style: TextStyle;
    icon: string;
    label: string;
    key: string;
  }[] = [
    { style: 'bold', icon: 'format_bold', label: t('Bold'), key: `${MOD}B` },
    {
      style: 'italic',
      icon: 'format_italic',
      label: t('Italic'),
      key: `${MOD}I`,
    },
    {
      style: 'underline',
      icon: 'format_underlined',
      label: t('Underline'),
      key: `${MOD}U`,
    },
    {
      style: 'strike',
      icon: 'format_strikethrough',
      label: t('Strikethrough'),
      key: `${MOD}${SHIFT}S`,
    },
    { style: 'code', icon: 'code', label: t('Inline code'), key: `${MOD}E` },
  ];

  const alignButtons: { value: Alignment; icon: string; label: string }[] = [
    { value: 'left', icon: 'format_align_left', label: t('Align left') },
    { value: 'center', icon: 'format_align_center', label: t('Center') },
    { value: 'right', icon: 'format_align_right', label: t('Align right') },
    { value: 'justify', icon: 'format_align_justify', label: t('Justify') },
  ];

  const listButtons: { type: ListType; icon: string; label: string }[] = [
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

  const toolbar = (
    <Box
      role="toolbar"
      aria-label={t('Formatting')}
      className="--docs--kherve-toolbar"
      $css={toolbarCss}
    >
      <ToolbarButton
        icon="undo"
        label={t('Undo')}
        shortcut={`${MOD}Z`}
        onClick={() => run(() => editor.undo())}
      />
      <ToolbarButton
        icon="redo"
        label={t('Redo')}
        shortcut={IS_MAC ? `${MOD}${SHIFT}Z` : `${MOD}Y`}
        onClick={() => run(() => editor.redo())}
      />
      <Separator />

      <DropdownMenu
        label={t('Paragraph style')}
        options={blockTypes.map((item) => ({
          label: item.name,
          isSelected: item === currentType,
          callback: () => setBlockType(item.type, item.props),
        }))}
        disabled={!state.hasText}
      >
        <DropdownTrigger label={t('Paragraph style')} width="150px">
          <Text
            $size="sm"
            $css="flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"
          >
            {currentType?.name ?? t('Paragraph style')}
          </Text>
        </DropdownTrigger>
      </DropdownMenu>
      <Separator />

      {styleButtons.map(({ style, icon, label, key }) => (
        <ToolbarButton
          key={style}
          icon={icon}
          label={label}
          shortcut={key}
          pressed={state.styles[style]}
          disabled={!state.canFormat}
          onClick={() => toggleStyle(style)}
        />
      ))}

      <DropdownMenu
        label={dict.color_picker.text_title}
        options={colorOptions('textColor')}
        disabled={!state.canFormat}
      >
        <DropdownTrigger label={dict.color_picker.text_title}>
          <Swatch color={state.textColor} kind="textColor" />
        </DropdownTrigger>
      </DropdownMenu>
      <DropdownMenu
        label={dict.color_picker.background_title}
        options={colorOptions('backgroundColor')}
        disabled={!state.canFormat}
      >
        <DropdownTrigger label={dict.color_picker.background_title}>
          <Icon iconName="format_color_fill" $size="20px" $theme="inherit" />
        </DropdownTrigger>
      </DropdownMenu>
      <ToolbarButton
        icon="link"
        label={t('Link')}
        shortcut={`${MOD}K`}
        pressed={!!state.link || linkDraft !== null}
        disabled={!state.canFormat}
        onClick={() =>
          linkDraft === null
            ? setLinkDraft(state.link || 'https://')
            : cancelLink()
        }
      />
      {linkDraft !== null && (
        <Box
          as="form"
          $direction="row"
          $align="center"
          $gap="4px"
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
            applyLink();
          }}
        >
          <input
            autoFocus
            type="text"
            aria-label={t('Link address')}
            value={linkDraft}
            onChange={(e) => setLinkDraft(e.target.value)}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => e.key === 'Escape' && cancelLink()}
            style={{
              width: '220px',
              height: '28px',
              padding: '0 8px',
              border:
                '1px solid var(--c--contextuals--border--semantic--brand--primary)',
              borderRadius: '4px',
              font: 'inherit',
              fontSize: '14px',
            }}
          />
          <ToolbarButton icon="check" label={t('Apply')} onClick={applyLink} />
        </Box>
      )}
      <Separator />

      {alignButtons.map(({ value, icon, label }) => (
        <ToolbarButton
          key={value}
          icon={icon}
          label={label}
          pressed={state.hasAlignment && state.textAlignment === value}
          disabled={!state.hasAlignment}
          onClick={() => setAlignment(value)}
        />
      ))}
      <Separator />

      {listButtons.map(({ type, icon, label }) => (
        <ToolbarButton
          key={type}
          icon={icon}
          label={label}
          pressed={state.blockType === type}
          disabled={!state.hasText}
          onClick={() => toggleList(type)}
        />
      ))}
      <ToolbarButton
        icon="format_indent_decrease"
        label={t('Decrease indent')}
        shortcut={`${SHIFT}Tab`}
        disabled={!state.canUnnest}
        onClick={() => run(() => editor.unnestBlock())}
      />
      <ToolbarButton
        icon="format_indent_increase"
        label={t('Increase indent')}
        shortcut="Tab"
        disabled={!state.canNest}
        onClick={() => run(() => editor.nestBlock())}
      />
      <Separator />

      <DropdownMenu label={t('Insert')} options={insertOptions}>
        <DropdownTrigger label={t('Insert')}>
          <Icon iconName="add_box" $size="20px" $theme="inherit" />
          <Text $size="sm">{t('Insert')}</Text>
        </DropdownTrigger>
      </DropdownMenu>
    </Box>
  );

  return createPortal(
    <>
      <ScrollableMenus />
      {toolbar}
    </>,
    target,
  );
};
