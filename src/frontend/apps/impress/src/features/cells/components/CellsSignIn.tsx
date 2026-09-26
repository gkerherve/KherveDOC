import { Button } from '@gouvfr-lasuite/ui-components';
import { useTranslation } from 'react-i18next';

import { Box, Text } from '@/components';

import { cellsLoginUrl } from '../api/cellsApi';
import { useCellsUrl } from '../api/useCells';

/** Shown when the user has no KherveCELL session yet. */
export const CellsSignIn = () => {
  const { t } = useTranslation();
  const base = useCellsUrl();
  if (!base) {
    return null;
  }
  return (
    <Box $align="center" $gap="sm" $padding="lg">
      <Text $size="md">
        {t('Connect KherveCELL to see and create spreadsheets.')}
      </Text>
      <Button
        color="brand"
        onClick={() => {
          window.location.href = cellsLoginUrl(base, window.location.href);
        }}
      >
        {t('Connect KherveCELL')}
      </Button>
    </Box>
  );
};
