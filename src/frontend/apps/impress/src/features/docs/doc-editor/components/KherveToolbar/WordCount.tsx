import { useBlockNoteEditor, useEditorState } from '@blocknote/react';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components';

const countWords = (text: string) =>
  (text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? []).length;

export const WordCount = () => {
  const editor = useBlockNoteEditor();
  const { t } = useTranslation();

  const counts = useEditorState({
    editor,
    selector: ({ editor }) => {
      const { doc, selection } = editor.prosemirrorState;
      const text = doc.textBetween(0, doc.content.size, ' ', ' ');
      const selected = selection.empty
        ? ''
        : doc.textBetween(selection.from, selection.to, ' ', ' ');
      return {
        words: countWords(text),
        characters: text.replace(/\s/g, '').length,
        selectedWords: countWords(selected),
      };
    },
  });

  if (!counts) {
    return null;
  }

  const summary = counts.selectedWords
    ? t('{{selected}} of {{count}} words', {
        selected: counts.selectedWords,
        count: counts.words,
      })
    : t('{{count}} words, {{characters}} characters', {
        count: counts.words,
        characters: counts.characters,
      });

  return (
    <Text
      $size="xs"
      $theme="neutral"
      $variation="secondary"
      aria-live="polite"
      $padding={{ horizontal: 'xs' }}
      $css="white-space: nowrap;"
    >
      {summary}
    </Text>
  );
};
