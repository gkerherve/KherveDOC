import { BlockNoteEditor } from '@blocknote/core';
import { useEditorState } from '@blocknote/react';
import { useTranslation } from 'react-i18next';
import { css } from 'styled-components';

import { Box, Text } from '@/components';

import { collectFootnotes } from './footnotes';

/** The document's notes, listed under the text in marker order. */
export const FootnotesList = ({
  editor,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor: BlockNoteEditor<any, any, any>;
}) => {
  const { t } = useTranslation();
  const notes = useEditorState({
    editor,
    on: 'change',
    selector: ({ editor }) => collectFootnotes(editor.document),
  });

  if (!notes?.length) {
    return null;
  }

  return (
    <Box
      as="section"
      aria-label={t('Notes')}
      className="--docs--footnotes"
      $margin={{ top: 'lg' }}
      $css={css`
        margin-inline: var(--kherve-notes-inline, 54px);
        padding-top: 8px;
        border-top: 1px solid var(--c--contextuals--border--surface--primary);
        font-size: 0.85em;
      `}
    >
      <Text $size="sm" $weight="bold">
        {t('Notes')}
      </Text>
      <Box as="ol" $css="margin: 6px 0 0; padding-left: 1.6em;">
        {notes.map((note, index) => (
          <Box as="li" key={index} $css="margin: 2px 0;">
            {note || <em>{t('Empty footnote')}</em>}
          </Box>
        ))}
      </Box>
    </Box>
  );
};
