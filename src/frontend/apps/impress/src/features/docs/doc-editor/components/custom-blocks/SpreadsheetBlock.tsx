import {
  BlockConfig,
  BlockNoDefaults,
  BlockNoteEditor,
  InlineContentSchema,
  StyleSchema,
} from '@blocknote/core';
import { insertOrUpdateBlockForSlashMenu } from '@blocknote/core/extensions';
import { createReactBlockSpec } from '@blocknote/react';
import type { TFunction } from 'i18next';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { css } from 'styled-components';

import { Box, Text } from '@/components';
import {
  CellsAuthError,
  CellsSignIn,
  SpreadsheetIcon,
  useSpreadsheetTable,
} from '@/features/cells';

import type { DocsBlockNoteEditor } from '../../types';

import { SpreadsheetPicker } from './SpreadsheetPicker';
import {
  SpreadsheetSnapshot,
  parseSnapshot,
  serializeSnapshot,
  snapshotOf,
} from './spreadsheetSnapshot';

/**
 * A table from a KherveCELL spreadsheet, like an embedded Excel sheet in
 * Word. It shows the live table (refreshed every few seconds) and keeps a
 * copy in the document for printing, exports and readers who are not
 * connected to KherveCELL.
 */

type SpreadsheetBlockConfig = BlockConfig<
  'spreadsheet',
  {
    docId: { default: '' };
    tableId: { default: '' };
    name: { default: '' };
    snapshot: { default: '' };
  },
  'none'
>;

type SpreadsheetEditor = BlockNoteEditor<
  Record<'spreadsheet', SpreadsheetBlockConfig>,
  InlineContentSchema,
  StyleSchema
>;

interface SpreadsheetComponentProps {
  block: BlockNoDefaults<
    Record<'spreadsheet', SpreadsheetBlockConfig>,
    InlineContentSchema,
    StyleSchema
  >;
  editor: SpreadsheetEditor;
}

const tableCss = css`
  width: 100%;
  border-collapse: collapse;
  font-size: 0.92em;
  th,
  td {
    border: 1px solid var(--c--contextuals--border--surface--primary, #ddd);
    padding: 4px 8px;
    text-align: left;
    vertical-align: top;
  }
  th {
    font-weight: 600;
    background: var(--c--contextuals--background--surface--tertiary, #f4f5f7);
  }
`;

export const SpreadsheetTableView = ({
  snapshot,
}: {
  snapshot: SpreadsheetSnapshot;
}) => (
  <Box $css="overflow-x: auto; max-width: 100%;">
    <Box as="table" $css={tableCss}>
      <thead>
        <tr>
          {snapshot.columns.map((column, index) => (
            <th key={index}>{column}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {snapshot.rows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {row.map((cell, cellIndex) => (
              <td key={cellIndex}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </Box>
  </Box>
);

const SpreadsheetComponent = ({ block, editor }: SpreadsheetComponentProps) => {
  const { t } = useTranslation();
  const { docId, tableId, name, snapshot: stored } = block.props;
  const editable = editor.isEditable;
  const [picking, setPicking] = useState(false);
  const { data, error } = useSpreadsheetTable(docId, tableId);

  const live = useMemo(() => (data ? snapshotOf(data) : undefined), [data]);
  const shown = live ?? parseSnapshot(stored);

  // Open the chooser for whoever just inserted this block.
  useEffect(() => {
    if (!docId && editable && justInserted.has(block.id)) {
      justInserted.delete(block.id);
      setPicking(true);
    }
    // Only on insertion.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the document's copy in step with the spreadsheet.
  useEffect(() => {
    if (!live || !editable) {
      return;
    }
    const serialized = serializeSnapshot(live);
    if (serialized !== stored) {
      editor.updateBlock(block, { props: { snapshot: serialized } });
    }
    // `block` changes on every update; the id is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, editable, stored, block.id]);

  return (
    <Box
      $width="100%"
      contentEditable={false}
      className="--docs--spreadsheet-block"
      $css={css`
        border: 1px solid var(--c--contextuals--border--surface--primary, #ddd);
        border-radius: 6px;
        padding: 8px 10px 10px;
        margin: 4px 0;
      `}
    >
      <Box
        $direction="row"
        $align="center"
        $gap="xs"
        $margin={{ bottom: 'xs' }}
      >
        <SpreadsheetIcon size={18} />
        <Text $weight="600" $size="sm">
          {name || t('Spreadsheet')}
          {tableId ? ` · ${tableId}` : ''}
        </Text>
        <Box $direction="row" $gap="sm" $margin={{ left: 'auto' }}>
          {editable && (
            <Text
              as="button"
              $size="sm"
              $theme="brand"
              $css="background: none; border: 0; cursor: pointer; padding: 0;"
              onClick={() => setPicking(true)}
            >
              {docId ? t('Change') : t('Choose a spreadsheet…')}
            </Text>
          )}
          {docId && (
            <Link href={`/cells/${docId}`}>
              <Text as="span" $size="sm" $theme="brand">
                {t('Open in KherveCELL')}
              </Text>
            </Link>
          )}
        </Box>
      </Box>
      {shown ? (
        <SpreadsheetTableView snapshot={shown} />
      ) : (
        !docId && (
          <Text $size="sm" $variation="secondary">
            {t('No spreadsheet chosen yet.')}
          </Text>
        )
      )}
      {error instanceof CellsAuthError && docId && <CellsSignIn />}
      {picking && (
        <SpreadsheetPicker
          initialDocId={docId}
          onClose={() => setPicking(false)}
          onPick={(choice) => {
            setPicking(false);
            editor.updateBlock(block, {
              props: {
                docId: choice.docId,
                tableId: choice.tableId,
                name: choice.name,
                snapshot: '',
              },
            });
          }}
        />
      )}
    </Box>
  );
};

export const SpreadsheetBlock = createReactBlockSpec(
  {
    type: 'spreadsheet',
    propSchema: {
      docId: { default: '' },
      tableId: { default: '' },
      name: { default: '' },
      snapshot: { default: '' },
    },
    content: 'none',
  },
  {
    render: (props) => <SpreadsheetComponent {...props} />,
    toExternalHTML: ({ block }) => {
      const snapshot = parseSnapshot(block.props.snapshot);
      return snapshot ? (
        <table>
          <caption>{block.props.name}</caption>
          <thead>
            <tr>
              {snapshot.columns.map((column, index) => (
                <th key={index}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {snapshot.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>{block.props.name}</p>
      );
    },
  },
);

/** Blocks inserted in this window whose chooser should open. */
const justInserted = new Set<string>();

export const insertSpreadsheetBlock = (editor: DocsBlockNoteEditor) => {
  const current = editor.getTextCursorPosition().block;
  // With a spreadsheet table selected, "insert or update" would only
  // update it in place: add the new one after it instead.
  const inserted =
    current.type === 'spreadsheet'
      ? editor.insertBlocks([{ type: 'spreadsheet' }], current, 'after')[0]
      : insertOrUpdateBlockForSlashMenu(editor, { type: 'spreadsheet' });
  if (inserted?.id) {
    justInserted.add(inserted.id);
  }
  return inserted;
};

export const getSpreadsheetReactSlashMenuItems = (
  editor: DocsBlockNoteEditor,
  t: TFunction<'translation', undefined>,
  group: string,
) => [
  {
    title: t('Spreadsheet table'),
    onItemClick: () => insertSpreadsheetBlock(editor),
    aliases: ['spreadsheet', 'sheet', 'excel', 'grist', 'khervecell', 'cell'],
    group,
    icon: <SpreadsheetIcon size={18} />,
    subtext: t('A live table from a KherveCELL spreadsheet'),
  },
];
