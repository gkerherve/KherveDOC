import { Button, Modal, ModalSize } from '@gouvfr-lasuite/ui-components';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { css } from 'styled-components';

import { Box, Text } from '@/components';
import {
  CellsAuthError,
  CellsSignIn,
  SpreadsheetIcon,
  useCreateSpreadsheet,
  useSpreadsheetTables,
  useSpreadsheets,
} from '@/features/cells';

export interface SpreadsheetChoice {
  docId: string;
  tableId: string;
  name: string;
}

const rowCss = (selected: boolean) => css`
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px;
  border: 0;
  border-radius: 4px;
  text-align: left;
  cursor: pointer;
  background: ${
    selected
      ? 'var(--c--contextuals--background--semantic--contextual--primary)'
      : 'transparent'
  };
  &:hover {
    background: var(
      --c--contextuals--background--semantic--contextual--primary
    );
  }
`;

/** Choose a spreadsheet and one of its tables to show in the document. */
export const SpreadsheetPicker = ({
  initialDocId,
  onPick,
  onClose,
}: {
  initialDocId?: string;
  onPick: (choice: SpreadsheetChoice) => void;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const { data: sheets, error } = useSpreadsheets();
  const [docId, setDocId] = useState(initialDocId || '');
  const { data: tables } = useSpreadsheetTables(docId || undefined);
  const [tableId, setTableId] = useState('');
  const { mutate: create, isPending } = useCreateSpreadsheet({
    onSuccess: (id) => setDocId(id),
  });

  useEffect(() => {
    if (tables && !tables.includes(tableId)) {
      setTableId(tables[0] ?? '');
    }
  }, [tables, tableId]);

  const sheet = sheets?.find(
    (candidate) => candidate.id === docId || candidate.docId === docId,
  );

  return (
    <Modal
      isOpen
      closeOnClickOutside
      onClose={onClose}
      size={ModalSize.MEDIUM}
      title={t('Insert a spreadsheet table')}
      rightActions={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button
            color="brand"
            disabled={!docId || !tableId}
            onClick={() =>
              onPick({
                docId: sheet?.id ?? docId,
                tableId,
                name: sheet?.name ?? t('Spreadsheet'),
              })
            }
          >
            {t('Insert')}
          </Button>
        </>
      }
    >
      <Box $gap="sm" $margin={{ bottom: 'md' }}>
        {error instanceof CellsAuthError ? (
          <CellsSignIn />
        ) : (
          <>
            <Box
              $css="max-height: 280px; overflow-y: auto;"
              role="listbox"
              aria-label={t('Spreadsheets')}
            >
              {sheets?.map((candidate) => {
                const selected =
                  candidate.id === docId || candidate.docId === docId;
                return (
                  <Box
                    as="button"
                    type="button"
                    role="option"
                    aria-selected={selected}
                    key={candidate.id}
                    $direction="row"
                    $css={rowCss(selected)}
                    onClick={() => setDocId(candidate.id)}
                  >
                    <SpreadsheetIcon size={20} />
                    <Text>{candidate.name}</Text>
                  </Box>
                );
              })}
              {sheets?.length === 0 && (
                <Text $variation="secondary">
                  {t('No spreadsheets yet: create the first one.')}
                </Text>
              )}
            </Box>
            <Box $direction="row" $align="center" $gap="sm">
              <Button
                variant="secondary"
                disabled={isPending}
                onClick={() => create(t('Untitled spreadsheet'))}
              >
                {t('New spreadsheet')}
              </Button>
              {tables && tables.length > 0 && (
                <Box as="label" $direction="row" $align="center" $gap="xs">
                  <Text $size="sm">{t('Table')}</Text>
                  <select
                    value={tableId}
                    onChange={(event) => setTableId(event.target.value)}
                  >
                    {tables.map((table) => (
                      <option key={table} value={table}>
                        {table}
                      </option>
                    ))}
                  </select>
                </Box>
              )}
            </Box>
          </>
        )}
      </Box>
    </Modal>
  );
};
