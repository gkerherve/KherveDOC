/**
 * A meeting's page: its title in the window's top bar, then the call.
 * Share the meeting like a document to invite people; the link opens it.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { Box } from '@/components';
import { KHERVE_TITLE_SLOT_ID } from '@/docs/doc-editor/components/SovToolbar/slot';
import { DocHeader } from '@/docs/doc-header/';
import { Doc } from '@/docs/doc-management';

import { MeetCall } from './MeetCall';

export const MeetDocEditor = ({ doc }: { doc: Doc }) => {
  const { t } = useTranslation();
  const [titleSlot, setTitleSlot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setTitleSlot(document.getElementById(KHERVE_TITLE_SLOT_ID));
  }, []);

  const header = <DocHeader doc={doc} />;

  return (
    <Box
      $width="100%"
      $flex="1"
      $css="display: flex; flex-direction: column; min-height: 0; padding: 12px;"
      className="--docs--meet-editor"
    >
      {titleSlot ? createPortal(header, titleSlot) : header}
      <MeetCall docId={doc.id} title={doc.title || t('Untitled meeting')} />
    </Box>
  );
};
