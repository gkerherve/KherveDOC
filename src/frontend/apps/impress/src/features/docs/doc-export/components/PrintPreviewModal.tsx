import {
  Button,
  Loader,
  Modal,
  ModalSize,
} from '@gouvfr-lasuite/ui-components';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Box, ButtonCloseModal, Text } from '@/components';
import { useEditorStore } from '@/docs/doc-editor/stores/useEditorStore';
import { Doc, useTrans } from '@/docs/doc-management';

import ModulesExport from '../hooks/';
import { downloadFile } from '../utils';

const useExportAGPL = ModulesExport?.useExportAGPL;

declare global {
  interface Window {
    /** A PDF (base64) the KherveDOC desktop app prints instead of the page. */
    __khervePrintPdf?: string;
  }
}

const isDesktopApp = () =>
  typeof navigator !== 'undefined' &&
  navigator.userAgent.includes('QtWebEngine');

const blobToBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

/**
 * Shows the document exactly as it prints: the same PDF as the export, with
 * the page setup, headers, footers, page numbers and footnotes.
 */
export const PrintPreviewModal = ({
  doc,
  onClose,
  onFallbackPrint,
}: {
  doc: Doc;
  onClose: () => void;
  /** Used when the PDF export module is not available (MIT builds). */
  onFallbackPrint: () => void;
}) => {
  const { t } = useTranslation();
  const { untitledDocument } = useTrans();
  const { editor } = useEditorStore();
  const exportAGPL = useExportAGPL?.(doc, editor);
  const frame = useRef<HTMLIFrameElement>(null);
  const [pdf, setPdf] = useState<{ blob: Blob; url: string }>();
  const [failed, setFailed] = useState(false);
  const title = doc.title || untitledDocument;

  useEffect(() => {
    if (!exportAGPL) {
      onClose();
      onFallbackPrint();
      return;
    }
    let url: string | undefined;
    let cancelled = false;
    exportAGPL
      .docToBlob('pdf', title)
      .then((blob) => {
        if (!blob || cancelled) {
          setFailed(!blob);
          return;
        }
        url = URL.createObjectURL(blob);
        setPdf({ blob, url });
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
    // The preview is generated once, when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const print = async () => {
    if (!pdf) {
      return;
    }
    if (isDesktopApp()) {
      // The desktop app renders this PDF straight to the printer.
      window.__khervePrintPdf = await blobToBase64(pdf.blob);
      window.print();
      return;
    }
    frame.current?.contentWindow?.print();
  };

  const filename = `${title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s/g, '-')}.pdf`;

  return (
    <Modal
      isOpen
      closeOnClickOutside
      onClose={onClose}
      hideCloseButton
      size={ModalSize.EXTRA_LARGE}
      aria-labelledby="print-preview-title"
      title={
        <>
          <Text as="h1" $margin="0" id="print-preview-title" $size="h6">
            {t('Print preview')}
          </Text>
          <Box $position="absolute" $css="top: 4px; right: 4px;">
            <ButtonCloseModal aria-label={t('Close')} onClick={onClose} />
          </Box>
        </>
      }
      rightActions={
        <>
          <Button
            variant="secondary"
            fullWidth
            disabled={!pdf}
            onClick={() => pdf && downloadFile(pdf.blob, filename)}
          >
            {t('Download PDF')}
          </Button>
          <Button
            variant="primary"
            fullWidth
            disabled={!pdf}
            onClick={() => void print()}
          >
            {t('Print')}
          </Button>
        </>
      }
    >
      <Box
        $height="72vh"
        $align="center"
        $justify="center"
        $margin={{ bottom: 'sm' }}
      >
        {pdf ? (
          <iframe
            ref={frame}
            src={pdf.url}
            title={t('Print preview')}
            style={{ width: '100%', height: '100%', border: 0 }}
          />
        ) : failed ? (
          <Text $theme="danger">{t('The preview could not be created.')}</Text>
        ) : (
          <Loader />
        )}
      </Box>
    </Modal>
  );
};
