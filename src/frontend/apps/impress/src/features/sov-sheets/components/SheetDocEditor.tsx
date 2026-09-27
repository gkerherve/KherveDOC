/**
 * A spreadsheet document's page: its title in the window's top bar (like a
 * text document's), then the full-width SOV Sheets editor.
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

import { SheetEditor } from './SheetEditor';

interface SheetDocEditorProps {
  doc: Doc;
  readOnly: boolean;
}

export const SheetDocEditor = ({ doc, readOnly }: SheetDocEditorProps) => {
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
      className="--docs--sheet-editor"
    >
      {titleSlot ? createPortal(header, titleSlot) : header}
      {ready && provider ? (
        <SheetBody
          docId={doc.id}
          provider={provider}
          synced={isSynced}
          readOnly={readOnly}
          userName={user?.full_name || user?.email || t('Anonymous')}
          userColor={color}
          title={doc.title || t('Untitled spreadsheet')}
        />
      ) : (
        <SkeletonEditorCore />
      )}
    </Box>
  );
};

const SheetBody = ({
  docId,
  ...props
}: { docId: string } & React.ComponentProps<typeof SheetEditor>) => {
  // Saves the shared document to the server, as the text editor does.
  useSaveDoc(docId, props.provider.document);
  return <SheetEditor {...props} />;
};
