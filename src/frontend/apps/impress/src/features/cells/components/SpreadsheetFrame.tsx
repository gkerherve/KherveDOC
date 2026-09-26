import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { Box } from '@/components';

import { spreadsheetUrl } from '../api/cellsApi';
import { useCellsUrl } from '../api/useCells';

/** A KherveCELL spreadsheet, full size inside KherveDOC's window. */
export const SpreadsheetFrame = ({
  id,
  onTitle,
}: {
  id: string;
  onTitle?: (title: string) => void;
}) => {
  const { t } = useTranslation();
  const base = useCellsUrl();

  // KherveCELL reports the spreadsheet's name when it runs in a frame.
  useEffect(() => {
    if (!base || !onTitle) {
      return;
    }
    const origin = new URL(base).origin;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; title?: unknown };
      if (
        event.origin === origin &&
        data?.type === 'khervecell:title' &&
        typeof data.title === 'string'
      ) {
        onTitle(data.title);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [base, onTitle]);

  if (!base) {
    return null;
  }
  return (
    <Box $flex="1" $width="100%" $css="min-height: 0;">
      <iframe
        title={t('Spreadsheet')}
        src={spreadsheetUrl(base, id)}
        allow="clipboard-read; clipboard-write; fullscreen"
        style={{ border: 0, width: '100%', height: '100%', display: 'block' }}
      />
    </Box>
  );
};
