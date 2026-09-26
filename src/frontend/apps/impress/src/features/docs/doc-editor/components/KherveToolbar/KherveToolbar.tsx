import { COLORS_DEFAULT } from '@blocknote/core';
import { CommentsExtension } from '@blocknote/core/comments';
import { getMathSlashMenuItems } from '@blocknote/math-block';
import {
  BlockTypeSelectItem,
  blockTypeSelectItems,
  useBlockNoteEditor,
  useDictionary,
  useEditorState,
  useExtension,
} from '@blocknote/react';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { Box, DropdownMenu, DropdownMenuOption, Icon } from '@/components';
import { useFindReplaceStore } from '@/docs/doc-find-replace/stores/useFindReplaceStore';
import { useDocStore } from '@/docs/doc-management';

import { printWithPageSetup } from '../../page-setup/PageLayoutStyle';
import { PageSetupModal } from '../../page-setup/PageSetupModal';
import { usePageSetup } from '../../page-setup/usePageSetup';
import {
  DocsBlockSchema,
  DocsInlineContentSchema,
  DocsStyleSchema,
} from '../../types';
import { useDocsSlashMenuItems } from '../BlockNoteSuggestionMenu';
import { ParagraphProps } from '../custom-blocks/paragraphProps';
import {
  FONT_FAMILIES,
  FONT_SIZES,
  fontSizePt,
  fontStack,
} from '../custom-styles';

import { ParagraphSpacingControls } from './ParagraphSpacingControls';
import { WordCount } from './WordCount';
import {
  ColorKind,
  DropdownTrigger,
  IS_MAC,
  MOD,
  SHIFT,
  ScrollableMenus,
  Separator,
  Swatch,
  ToolbarButton,
  TriggerText,
  rowCss,
  toolbarCss,
} from './parts';
import { SymbolPicker, TableGridPicker } from './pickers';
import { KHERVE_TOOLBAR_SLOT_ID } from './slot';

const ModalExport = dynamic(
  () =>
    import('@/docs/doc-export/components/ModalExport').then((mod) => ({
      default: mod.ModalExport,
    })),
  { ssr: false },
);

type ToggleStyle =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strike'
  | 'code'
  | 'superscript'
  | 'subscript';
type Alignment = 'left' | 'center' | 'right' | 'justify';
type ListType = 'bulletListItem' | 'numberedListItem' | 'checkListItem';

const CLEARABLE_STYLES = {
  bold: true,
  italic: true,
  underline: true,
  strike: true,
  code: true,
  superscript: true,
  subscript: true,
  textColor: 'default',
  backgroundColor: 'default',
  fontFamily: '',
  fontSize: '',
} as const;

/** Font size and family actually rendered at the caret, for display. */
const computedFontAtCaret = (root?: HTMLElement) => {
  const node = window.getSelection()?.anchorNode;
  if (!root || !node || !root.contains(node)) {
    return undefined;
  }
  const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  if (!(element instanceof Element)) {
    return undefined;
  }
  const style = window.getComputedStyle(element);
  const px = parseFloat(style.fontSize);
  return {
    sizePt: Math.round(px * 0.75 * 2) / 2,
    family: style.fontFamily
      .split(',')[0]
      ?.trim()
      .replace(/^['"]|['"]$/g, ''),
  };
};

export const KherveToolbar = ({ aiAllowed }: { aiAllowed: boolean }) => {
  const editor = useBlockNoteEditor<
    DocsBlockSchema,
    DocsInlineContentSchema,
    DocsStyleSchema
  >();
  const dict = useDictionary();
  const { t, i18n } = useTranslation();
  const slashMenuItems = useDocsSlashMenuItems(aiAllowed);
  const openFindReplace = useFindReplaceStore((state) => state.open);
  const currentDoc = useDocStore((state) => state.currentDoc);
  const comments = useExtension('comments') as unknown as
    ReturnType<ReturnType<typeof CommentsExtension>> | undefined;
  const [linkDraft, setLinkDraft] = useState<string | null>(null);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isPageSetupOpen, setIsPageSetupOpen] = useState(false);
  const pageSetup = usePageSetup();
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setTarget(document.getElementById(KHERVE_TOOLBAR_SLOT_ID));
  }, []);

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
          superscript: !!styles.superscript,
          subscript: !!styles.subscript,
        },
        textColor: (styles.textColor as string) || 'default',
        backgroundColor: (styles.backgroundColor as string) || 'default',
        fontFamily: (styles.fontFamily as string) || '',
        fontSize: (styles.fontSize as string) || '',
        blockType: block.type as string,
        blockProps: props,
        textAlignment: (props.textAlignment as Alignment) ?? 'left',
        hasAlignment: 'textAlignment' in props,
        hasParagraphProps: 'lineSpacing' in props,
        paragraph: {
          lineSpacing: String(props.lineSpacing ?? 'default'),
          spaceBefore: String(props.spaceBefore ?? 'default'),
          spaceAfter: String(props.spaceAfter ?? 'default'),
          firstLineIndent: String(props.firstLineIndent ?? 'default'),
          styleName: String(props.styleName ?? ''),
        },
        hasText: Array.isArray(block.content),
        // Tables hold styled text too, just not as a plain inline array.
        canFormat: block.content !== undefined,
        hasSelection: !!editor.getSelectedText(),
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

  // Block equation first, then inline equation (when the schema has them).
  const [blockEquation, inlineEquation] = useMemo(
    () => getMathSlashMenuItems(editor),
    [editor],
  );

  const slashItem = (predicate: (key: string) => boolean) =>
    slashMenuItems.find((item) =>
      predicate(String((item as { key?: string }).key ?? '')),
    );

  if (!target || !state?.editable) {
    return null;
  }

  const caret = computedFontAtCaret(editor.domElement);

  const selectedBlocks = () =>
    editor.getSelection()?.blocks ?? [editor.getTextCursorPosition().block];

  // Act on the editor's stored selection before refocusing: when a menu or the
  // link box had focus, refocusing first lets the browser collapse it. The
  // later focus runs after a closing popover hands focus back to its button,
  // which react-aria does one frame after unmounting.
  const run = (action: () => void) => {
    action();
    editor.focus();
    requestAnimationFrame(() => requestAnimationFrame(() => editor.focus()));
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

  const setParagraphProps = (props: ParagraphProps) =>
    run(() =>
      editor.transact(() => {
        for (const block of selectedBlocks()) {
          if ('lineSpacing' in block.props) {
            editor.updateBlock(block, { props });
          }
        }
      }),
    );

  const toggleStyle = (style: ToggleStyle) =>
    run(() => {
      // Superscript and subscript exclude each other, as in word processors.
      if (style === 'superscript' && !state.styles.superscript) {
        editor.removeStyles({ subscript: true });
      }
      if (style === 'subscript' && !state.styles.subscript) {
        editor.removeStyles({ superscript: true });
      }
      editor.toggleStyles({ [style]: true });
    });

  const setColor = (kind: ColorKind, color: string) =>
    run(() =>
      color === 'default'
        ? editor.removeStyles({ [kind]: 'default' })
        : editor.addStyles({ [kind]: color }),
    );

  const setFontFamily = (name: string) =>
    run(() =>
      name
        ? editor.addStyles({ fontFamily: name })
        : editor.removeStyles({ fontFamily: '' }),
    );

  const displayedSizePt = fontSizePt(state.fontSize) ?? caret?.sizePt;

  const setFontSize = (pt?: number) =>
    run(() =>
      pt
        ? editor.addStyles({ fontSize: `${pt}pt` })
        : editor.removeStyles({ fontSize: '' }),
    );

  const stepFontSize = (direction: 1 | -1) => {
    const current = displayedSizePt ?? 12;
    const next =
      direction > 0
        ? FONT_SIZES.find((size) => size > current)
        : [...FONT_SIZES].reverse().find((size) => size < current);
    if (next) {
      setFontSize(next);
    }
  };

  const clearFormatting = () =>
    run(() => editor.removeStyles({ ...CLEARABLE_STYLES }));

  const insertText = (text: string) =>
    run(() => editor.insertInlineContent(text));

  const insertTable = (rows: number, cols: number) =>
    run(() => {
      const cursor = editor.getTextCursorPosition().block;
      const table = {
        type: 'table',
        content: {
          type: 'tableContent',
          rows: Array.from({ length: rows }, () => ({
            cells: Array.from({ length: cols }, () => ''),
          })),
        },
      } as Parameters<typeof editor.insertBlocks>[0][number];
      const isEmptyParagraph =
        cursor.type === 'paragraph' &&
        Array.isArray(cursor.content) &&
        cursor.content.length === 0;
      if (isEmptyParagraph) {
        editor.replaceBlocks([cursor], [table]);
      } else {
        editor.insertBlocks([table], cursor, 'after');
      }
    });

  const copyOrCut = (command: 'copy' | 'cut') => {
    editor.focus();
    document.execCommand(command);
  };

  const paste = async () => {
    editor.focus();
    if (document.execCommand('paste')) {
      return;
    }
    try {
      for (const item of await navigator.clipboard.read()) {
        if (item.types.includes('text/html')) {
          editor.pasteHTML(await (await item.getType('text/html')).text());
          return;
        }
      }
      const text = await navigator.clipboard.readText();
      if (text) {
        editor.pasteText(text);
      }
    } catch {
      // Clipboard access denied: the keyboard shortcut still works.
    }
  };

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

  const fontOptions: DropdownMenuOption[] = [
    {
      label: t('Default font'),
      isSelected: !state.fontFamily,
      showSeparator: true,
      callback: () => setFontFamily(''),
    },
    ...FONT_FAMILIES.map((font, index) => ({
      label: font.name,
      icon: (
        <Box as="span" $css={`font-family: ${font.stack}; font-size: 15px;`}>
          Aa
        </Box>
      ),
      isSelected: state.fontFamily === font.name,
      showSeparator: FONT_FAMILIES[index + 1]?.group !== font.group,
      callback: () => setFontFamily(font.name),
    })),
  ];

  const sizeOptions: DropdownMenuOption[] = [
    {
      label: t('Default size'),
      isSelected: !state.fontSize,
      showSeparator: true,
      callback: () => setFontSize(undefined),
    },
    ...FONT_SIZES.map((size) => ({
      label: `${size}`,
      isSelected: fontSizePt(state.fontSize) === size,
      callback: () => setFontSize(size),
    })),
  ];

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

  const imageItem = slashItem((key) => key === 'image');
  const dividerItem = slashItem((key) => key === 'divider');
  const pageBreakItem = slashItem((key) => key === 'page_break');
  const canComment = !!comments && !!currentDoc?.abilities.comment;

  const styleButtons: {
    style: ToggleStyle;
    icon: string;
    label: string;
    key?: string;
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
    { style: 'superscript', icon: 'superscript', label: t('Superscript') },
    { style: 'subscript', icon: 'subscript', label: t('Subscript') },
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

  const standardRow = (
    <Box role="group" aria-label={t('Standard')} $css={rowCss}>
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
      <ToolbarButton
        icon="content_cut"
        label={t('Cut')}
        shortcut={`${MOD}X`}
        disabled={!state.hasSelection}
        onClick={() => copyOrCut('cut')}
      />
      <ToolbarButton
        icon="content_copy"
        label={t('Copy')}
        shortcut={`${MOD}C`}
        disabled={!state.hasSelection}
        onClick={() => copyOrCut('copy')}
      />
      <ToolbarButton
        icon="content_paste"
        label={t('Paste')}
        shortcut={`${MOD}V`}
        onClick={() => void paste()}
      />
      <ToolbarButton
        icon="format_clear"
        label={t('Clear direct formatting')}
        disabled={!state.canFormat}
        onClick={clearFormatting}
      />
      <Separator />
      <ToolbarButton
        icon="search"
        label={t('Find and replace')}
        shortcut={`${MOD}F`}
        onClick={openFindReplace}
      />
      <ToolbarButton
        icon="print"
        label={t('Print')}
        shortcut={`${MOD}P`}
        onClick={() => printWithPageSetup(pageSetup.setup)}
      />
      <ToolbarButton
        icon="description"
        label={t('Page setup')}
        onClick={() => setIsPageSetupOpen(true)}
      />
      {currentDoc && (
        <ToolbarButton
          icon="file_download"
          label={t('Export (PDF, Word, ODT, HTML)')}
          onClick={() => setIsExportOpen(true)}
        />
      )}
      <Separator />
      <TableGridPicker onPick={insertTable} />
      {imageItem && (
        <ToolbarButton
          icon="image"
          label={t('Insert image')}
          onClick={() => run(() => imageItem.onItemClick())}
        />
      )}
      {blockEquation && (
        <ToolbarButton
          icon="functions"
          label={t('Insert equation')}
          onClick={() => run(() => blockEquation.onItemClick())}
        />
      )}
      {inlineEquation && (
        <ToolbarButton
          icon="calculate"
          label={t('Insert inline equation')}
          onClick={() => run(() => inlineEquation.onItemClick())}
        />
      )}
      <ToolbarButton
        icon="note_add"
        label={t('Insert footnote')}
        disabled={!state.canFormat}
        // No refocus: the new note opens its own text box for typing.
        onClick={() =>
          editor.insertInlineContent([
            { type: 'footnote', props: { text: '' } },
          ])
        }
      />
      <SymbolPicker onPick={insertText} />
      <ToolbarButton
        icon="calendar_today"
        label={t('Insert date')}
        onClick={() =>
          insertText(new Date().toLocaleDateString(i18n.resolvedLanguage))
        }
      />
      {dividerItem && (
        <ToolbarButton
          icon="horizontal_rule"
          label={t('Horizontal line')}
          onClick={() => run(() => dividerItem.onItemClick())}
        />
      )}
      {pageBreakItem && (
        <ToolbarButton
          icon="insert_page_break"
          label={t('Page break')}
          onClick={() => run(() => pageBreakItem.onItemClick())}
        />
      )}
      {canComment && (
        <ToolbarButton
          icon="add_comment"
          label={t('Add comment')}
          disabled={!state.hasSelection}
          onClick={() => comments.startPendingComment()}
        />
      )}
      <DropdownMenu label={t('Insert')} options={insertOptions}>
        <DropdownTrigger label={t('Insert')}>
          <Icon iconName="add_box" $size="20px" $theme="inherit" />
          <span>{t('Insert')}</span>
        </DropdownTrigger>
      </DropdownMenu>
      <Box $css="margin-left: auto;">
        <WordCount />
      </Box>
    </Box>
  );

  const formattingRow = (
    <Box role="group" aria-label={t('Formatting')} $css={rowCss}>
      <DropdownMenu
        label={t('Paragraph style')}
        options={blockTypes.map((item) => ({
          label: item.name,
          isSelected: item === currentType,
          callback: () => setBlockType(item.type, item.props),
        }))}
        disabled={!state.hasText}
      >
        <DropdownTrigger label={t('Paragraph style')} width="128px">
          <TriggerText>{currentType?.name ?? t('Paragraph style')}</TriggerText>
        </DropdownTrigger>
      </DropdownMenu>
      <DropdownMenu
        label={t('Font name')}
        options={fontOptions}
        disabled={!state.canFormat}
      >
        <DropdownTrigger label={t('Font name')} width="148px">
          <TriggerText>
            <span
              style={{
                fontFamily: state.fontFamily
                  ? fontStack(state.fontFamily)
                  : undefined,
              }}
            >
              {state.fontFamily || caret?.family || t('Default font')}
            </span>
          </TriggerText>
        </DropdownTrigger>
      </DropdownMenu>
      <DropdownMenu
        label={t('Font size')}
        options={sizeOptions}
        disabled={!state.canFormat}
      >
        <DropdownTrigger label={t('Font size')} width="54px">
          <TriggerText>{displayedSizePt ?? '–'}</TriggerText>
        </DropdownTrigger>
      </DropdownMenu>
      <ToolbarButton
        icon="text_increase"
        label={t('Increase font size')}
        disabled={!state.canFormat}
        onClick={() => stepFontSize(1)}
      />
      <ToolbarButton
        icon="text_decrease"
        label={t('Decrease font size')}
        disabled={!state.canFormat}
        onClick={() => stepFontSize(-1)}
      />
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
      <Separator />

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
      <ParagraphSpacingControls
        disabled={!state.hasParagraphProps}
        current={state.paragraph}
        onChange={setParagraphProps}
      />
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
    </Box>
  );

  return (
    <>
      {createPortal(
        <>
          <ScrollableMenus />
          <Box
            role="toolbar"
            aria-label={t('Document toolbar')}
            className="--docs--kherve-toolbar"
            $css={toolbarCss}
          >
            {standardRow}
            {formattingRow}
          </Box>
        </>,
        target,
      )}
      {isPageSetupOpen && (
        <PageSetupModal
          setup={pageSetup.setup}
          onSave={pageSetup.save}
          onClose={() => setIsPageSetupOpen(false)}
        />
      )}
      {isExportOpen && currentDoc && (
        <ModalExport doc={currentDoc} onClose={() => setIsExportOpen(false)} />
      )}
    </>
  );
};
