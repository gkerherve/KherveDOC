/**
 * A slides document's page: its title in the window's top bar (like a text
 * document's), then the presentation editor.
 */
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { Box } from '@/components';
import { KHERVE_TITLE_SLOT_ID } from '@/docs/doc-editor/components/SovToolbar/slot';
import { useSaveDoc } from '@/docs/doc-editor/hook/useSaveDoc';
import { randomColor } from '@/docs/doc-editor/utils';
import { DocHeader } from '@/docs/doc-header/';
import { Doc, useProviderStore } from '@/docs/doc-management';
import { useAuth } from '@/features/auth';
import { SkeletonEditorCore } from '@/features/skeletons';

import { SlideEditor } from './SlideEditor';

interface SlideDocEditorProps {
  doc: Doc;
  readOnly: boolean;
}

export const SlideDocEditor = ({ doc, readOnly }: SlideDocEditorProps) => {
  const { t } = useTranslation();
  const { provider, isReady, isSynced } = useProviderStore();
  const { user } = useAuth();
  const [titleSlot, setTitleSlot] = useState<HTMLElement | null>(null);
  const color = useMemo(() => randomColor(), []);

  useEffect(() => {
    setTitleSlot(document.getElementById(KHERVE_TITLE_SLOT_ID));
  }, []);

  const ready = isReady && provider?.configuration.name === doc.id;
  const header = <DocHeader doc={doc} />;

  return (
    <Box
      $width="100%"
      $flex="1"
      $css="display: flex; flex-direction: column; min-height: 0;"
      className="--docs--slide-editor"
    >
      {titleSlot ? createPortal(header, titleSlot) : header}
      {ready && provider ? (
        <SlideBody
          docId={doc.id}
          provider={provider}
          synced={isSynced}
          readOnly={readOnly}
          userName={user?.full_name || user?.email || t('Anonymous')}
          userColor={color}
          title={doc.title || t('Untitled slides')}
        />
      ) : (
        <SkeletonEditorCore />
      )}
    </Box>
  );
};

const SlideBody = (props: React.ComponentProps<typeof SlideEditor>) => {
  // Saves the shared document to the server, as the text editor does.
  useSaveDoc(props.docId, props.provider.document);
  return <SlideEditor {...props} />;
};
