import { Button, Loader } from '@gouvfr-lasuite/ui-components';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import { css } from 'styled-components';

import { Box, Card, StyledLink, Text } from '@/components';

import { CellsAuthError } from '../api/cellsApi';
import { useCreateSpreadsheet, useSpreadsheets } from '../api/useCells';

import { CellsSignIn } from './CellsSignIn';
import { SpreadsheetIcon } from './SpreadsheetIcon';

export const SpreadsheetList = () => {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { data, isLoading, error } = useSpreadsheets();
  const { mutate: create, isPending } = useCreateSpreadsheet({
    onSuccess: (id) => void router.push(`/cells/${id}`),
  });

  return (
    <Box $width="100%" $maxWidth="960px" $margin={{ horizontal: 'auto' }}>
      <Card $padding="md" $margin={{ top: 'md' }}>
        <Box
          $direction="row"
          $align="center"
          $justify="space-between"
          $margin={{ bottom: 'sm' }}
        >
          <Text as="h2" $size="h4" $margin="none">
            {t('Spreadsheets')}
          </Text>
          <Button
            color="brand"
            disabled={isPending}
            onClick={() => create(t('Untitled spreadsheet'))}
          >
            {t('New spreadsheet')}
          </Button>
        </Box>
        {isLoading && <Loader />}
        {error instanceof CellsAuthError && <CellsSignIn />}
        {error && !(error instanceof CellsAuthError) && (
          <Text $variation="secondary">
            {t('KherveCELL could not be reached.')}
          </Text>
        )}
        {data && data.length === 0 && (
          <Text $variation="secondary">
            {t('No spreadsheets yet: create the first one.')}
          </Text>
        )}
        <Box role="list">
          {data?.map((sheet) => (
            <StyledLink
              key={sheet.id}
              role="listitem"
              href={`/cells/${sheet.id}`}
              $css={css`
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 10px 8px;
                border-radius: 4px;
                color: inherit;
                text-decoration: none;
                &:hover {
                  background: var(
                    --c--contextuals--background--semantic--contextual--primary
                  );
                }
              `}
            >
              <SpreadsheetIcon />
              <Text $weight="500" $css="flex: 1;">
                {sheet.name}
              </Text>
              <Text $size="sm" $variation="secondary">
                {new Date(sheet.updatedAt).toLocaleString(
                  i18n.resolvedLanguage,
                  { dateStyle: 'medium', timeStyle: 'short' },
                )}
              </Text>
            </StyledLink>
          ))}
        </Box>
      </Card>
    </Box>
  );
};
