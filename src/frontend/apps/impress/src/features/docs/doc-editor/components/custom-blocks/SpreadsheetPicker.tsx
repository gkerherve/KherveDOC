import { Button, Modal, ModalSize } from '@gouvfr-lasuite/ui-components';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { css } from 'styled-components';

import { fetchAPI } from '@/api';
import { Box, Text } from '@/components';
import { SpreadsheetIcon } from '@/features/kherve-cell/components/SpreadsheetIcon';
import { address } from '@/features/kherve-cell/model/layout';
import { readSpreadsheet } from '@/features/kherve-cell/model/reader';

import { SpreadsheetTableView } from './SpreadsheetTableView';
import { snapshotOfRows } from './spreadsheetSnapshot';

export interface SpreadsheetChoice {
  docId: string;
  sheetId: string;
  range: string;
  header: boolean;
  name: string;
}

interface SheetDoc {
  id: string;
  title: string;
  kind?: string;
  updated_at?: string;
}

/** The spreadsheets the user can open, most recently changed first. */
const listSpreadsheets = async (): Promise<SheetDoc[]> => {
  const found: SheetDoc[] = [];
  let path = 'documents/?ordering=-updated_at&page_size=100';
  for (let page = 0; page < 10 && path; page++) {
    const response = await fetchAPI(path);
    if (!response.ok) {
      throw new Error(`KherveDOC answered ${response.status}`);
    }
    const data = (await response.json()) as {
      results: SheetDoc[];
      next: string | null;
    };
    found.push(...data.results.filter((doc) => doc.kind === 'sheet'));
    path = data.next ? (data.next.split('/api/v1.0/')[1] ?? '') : '';
  }
  return found;
};

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

/** Choose a spreadsheet, one of its sheets and a range. */
export const SpreadsheetPicker = ({
  initial,
  onPick,
  onClose,
}: {
  initial?: Partial<SpreadsheetChoice>;
  onPick: (choice: SpreadsheetChoice) => void;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const { data: docs, error } = useQuery({
    queryKey: ['kherve-cell-spreadsheets'],
    queryFn: listSpreadsheets,
  });
  const [docId, setDocId] = useState(initial?.docId ?? '');
  const [sheetId, setSheetId] = useState(initial?.sheetId ?? '');
  const [range, setRange] = useState(initial?.range ?? '');
  const [rangeInput, setRangeInput] = useState(range);
  useEffect(() => setRangeInput(range), [range]);
  const [header, setHeader] = useState(initial?.header ?? true);
  const { data: read, isFetching } = useQuery({
    queryKey: ['kherve-cell-read', docId, sheetId, range],
    queryFn: () => readSpreadsheet(docId, sheetId || undefined, range),
    enabled: !!docId,
  });

  // The used cells of the chosen sheet, until the user types a range.
  useEffect(() => {
    if (read && !range && read.rows.length) {
      const r = read.range;
      setRange(`${address(r.top, r.left)}:${address(r.bottom, r.right)}`);
    }
    if (read && !sheetId) {
      setSheetId(read.sheetId);
    }
  }, [read, range, sheetId]);

  const doc = docs?.find((d) => d.id === docId);
  const preview = read ? snapshotOfRows(read.rows.slice(0, 6), header) : null;

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
            disabled={!docId || !sheetId}
            onClick={() =>
              onPick({
                docId,
                sheetId,
                range,
                header,
                name: doc?.title || initial?.name || t('Spreadsheet'),
              })
            }
          >
            {t('Insert')}
          </Button>
        </>
      }
    >
      <Box $gap="sm" $margin={{ bottom: 'md' }}>
        {error && (
          <Text $theme="danger">
            {t('The spreadsheets could not be listed.')}
          </Text>
        )}
        <Box
          $css="max-height: 220px; overflow-y: auto;"
          role="listbox"
          aria-label={t('Spreadsheets')}
        >
          {docs?.map((candidate) => (
            <Box
              as="button"
              type="button"
              role="option"
              aria-selected={candidate.id === docId}
              key={candidate.id}
              $direction="row"
              $css={rowCss(candidate.id === docId)}
              onClick={() => {
                setDocId(candidate.id);
                setSheetId('');
                setRange('');
              }}
            >
              <SpreadsheetIcon size={20} />
              <Text>{candidate.title || t('Untitled spreadsheet')}</Text>
              {candidate.updated_at && (
                <Text
                  $size="xs"
                  $variation="secondary"
                  $margin={{ left: 'auto' }}
                >
                  {new Date(candidate.updated_at).toLocaleString()}
                </Text>
              )}
            </Box>
          ))}
          {docs?.length === 0 && (
            <Text $variation="secondary">
              {t('No spreadsheets yet: create one with New ▸ New spreadsheet.')}
            </Text>
          )}
        </Box>
        {read && (
          <Box $direction="row" $align="center" $gap="sm" $wrap="wrap">
            <Box as="label" $direction="row" $align="center" $gap="xs">
              <Text $size="sm">{t('Sheet')}</Text>
              <select
                value={sheetId}
                onChange={(event) => {
                  setSheetId(event.target.value);
                  setRange('');
                }}
              >
                {read.sheets.map((sheet) => (
                  <option key={sheet.id} value={sheet.id}>
                    {sheet.name}
                  </option>
                ))}
              </select>
            </Box>
            <Box as="label" $direction="row" $align="center" $gap="xs">
              <Text $size="sm">{t('Cells')}</Text>
              <input
                value={rangeInput}
                size={10}
                placeholder="A1:D10"
                onChange={(event) => setRangeInput(event.target.value)}
                onBlur={() => setRange(rangeInput.trim().toUpperCase())}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    setRange(rangeInput.trim().toUpperCase());
                  }
                }}
              />
            </Box>
            <Box as="label" $direction="row" $align="center" $gap="xs">
              <input
                type="checkbox"
                checked={header}
                onChange={(event) => setHeader(event.target.checked)}
              />
              <Text $size="sm">{t('First row is a header')}</Text>
            </Box>
          </Box>
        )}
        {docId && (isFetching || !preview) && (
          <Text $size="sm" $variation="secondary">
            {t('Reading the spreadsheet…')}
          </Text>
        )}
        {preview && !isFetching && <SpreadsheetTableView snapshot={preview} />}
      </Box>
    </Modal>
  );
};
