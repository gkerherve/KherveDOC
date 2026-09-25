import { combineByGroup } from '@blocknote/core';
import { filterSuggestionItems } from '@blocknote/core/extensions';
import { getDiagramSlashMenuItems } from '@blocknote/diagram-block';
import { getMathSlashMenuItems } from '@blocknote/math-block';
import {
  DefaultReactSuggestionItem,
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  getPageBreakReactSlashMenuItems,
  useBlockNoteEditor,
  useDictionary,
} from '@blocknote/react';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  DocsBlockSchema,
  DocsInlineContentSchema,
  DocsStyleSchema,
} from '../types';

import BlockNoteAI from './AI';
import {
  getCalloutReactSlashMenuItems,
  getPdfReactSlashMenuItems,
} from './custom-blocks';
import { useGetInterlinkingMenuItems } from './custom-inline-content';
import XLMultiColumn from './xl-multi-column';

const getMultiColumnSlashMenuItems =
  XLMultiColumn?.getMultiColumnSlashMenuItems;

const getAISlashMenuItems = BlockNoteAI?.getAISlashMenuItems;

export const BlockNoteSuggestionMenu = ({
  aiAllowed,
}: {
  aiAllowed: boolean;
}) => {
  const slashMenuItems = useDocsSlashMenuItems(aiAllowed);

  const getSlashMenuItems = useMemo(
    () => async (query: string) =>
      Promise.resolve(filterSuggestionItems(slashMenuItems, query)),
    [slashMenuItems],
  );

  return (
    <SuggestionMenuController
      triggerCharacter="/"
      getItems={getSlashMenuItems}
    />
  );
};

export const useDocsSlashMenuItems = (aiAllowed: boolean) => {
  const editor = useBlockNoteEditor<
    DocsBlockSchema,
    DocsInlineContentSchema,
    DocsStyleSchema
  >();
  const { t } = useTranslation();
  const dictionaryDate = useDictionary();
  const basicBlocksName = dictionaryDate.slash_menu.page_break.group;
  const fileBlocksName = dictionaryDate.slash_menu.file.group;

  const getInterlinkingMenuItems = useGetInterlinkingMenuItems();

  return useMemo(() => {
    // We insert it after the "Code Block" item to have the interlinking block displayed after the basic blocks
    const defaultMenu = getDefaultReactSlashMenuItems(editor);

    const combinedMenu = combineByGroup(
      defaultMenu,
      getPageBreakReactSlashMenuItems(editor),
      getMultiColumnSlashMenuItems?.(editor) || [],
      getPdfReactSlashMenuItems(editor, t, fileBlocksName),
      getCalloutReactSlashMenuItems(editor, t, basicBlocksName),
      getMathSlashMenuItems(editor),
      getDiagramSlashMenuItems(editor),
      aiAllowed && getAISlashMenuItems ? getAISlashMenuItems(editor) : [],
    );

    const index = combinedMenu.findIndex(
      (item) =>
        (item as DefaultReactSuggestionItem & { key: string })?.key ===
        'callout',
    );

    return [
      ...combinedMenu.slice(0, index + 1),
      ...getInterlinkingMenuItems(editor, t),
      ...combinedMenu.slice(index + 1),
    ];
  }, [
    editor,
    t,
    fileBlocksName,
    basicBlocksName,
    aiAllowed,
    getInterlinkingMenuItems,
  ]);
};
