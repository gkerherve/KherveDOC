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
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { css } from 'styled-components';

import { Box, Text } from '@/components';
import { SpreadsheetIcon } from '@/features/kherve-cell/components/SpreadsheetIcon';
import { readSpreadsheet } from '@/features/kherve-cell/model/reader';

import type { DocsBlockNoteEditor } from '../../types';

import { SpreadsheetPicker } from './SpreadsheetPicker';
import { SpreadsheetTableView } from './SpreadsheetTableView';
import {
  parseSnapshot,
  serializeSnapshot,
  snapshotOfRows,
} from './spreadsheetSnapshot';

export { SpreadsheetTableView };

/**
 * A table from a KherveDOC spreadsheet, like an embedded Excel range in
 * Word. The document keeps a copy of the values (for printing, exports and
 * readers who cannot open the spreadsheet); whoever can edit the document
 * and open the spreadsheet refreshes it when the document opens, or with
 * Refresh.
 *
 * Blocks made with the former spreadsheet service (Grist) have a tableId
 * and no sheetId: they keep showing their copy until linked again.
 */

type SpreadsheetBlockConfig = BlockConfig<
  'spreadsheet',
  {
    docId: { default: '' };
    sheetId: { default: '' };
    range: { default: '' };
    header: { default: true };
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

const SpreadsheetComponent = ({ block, editor }: SpreadsheetComponentProps) => {
  const { t } = useTranslation();
  const {
    docId,
    sheetId,
    range,
    header,
    tableId,
    name,
    snapshot: stored,
  } = block.props;
  const editable = editor.isEditable;
  const linked = !!docId && !!sheetId;
  const legacy = !!tableId && !sheetId;
  const [picking, setPicking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const shown = parseSnapshot(stored);

  const refresh = async () => {
    if (!linked) {
      return;
    }
    setRefreshing(true);
    setProblem(null);
    try {
      const read = await readSpreadsheet(docId, sheetId, range);
      const serialized = serializeSnapshot(
        snapshotOfRows(read.rows, header, read.range.left),
      );
      if (serialized !== stored && editor.isEditable) {
        editor.updateBlock(block, { props: { snapshot: serialized } });
      }
    } catch {
      setProblem(t('The spreadsheet could not be read.'));
    } finally {
      setRefreshing(false);
    }
  };

  // Open the chooser for whoever just inserted this block.
  useEffect(() => {
    if (!docId && editable && justInserted.has(block.id)) {
      justInserted.delete(block.id);
      setPicking(true);
    }
    // Only on insertion.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bring the copy up to date when the document opens (editors only).
  useEffect(() => {
    if (linked && editable) {
      void refresh();
    }
    // When the linked range changes; `block` changes on every update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, sheetId, range, header, editable]);

  const link = (label: string, onClick: () => void, disabled = false) => (
    <Text
      as="button"
      $size="sm"
      $theme="brand"
      $css="background: none; border: 0; cursor: pointer; padding: 0;"
      aria-disabled={disabled}
      onClick={() => !disabled && onClick()}
    >
      {label}
    </Text>
  );

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
          {range ? ` · ${range}` : ''}
        </Text>
        <Box $direction="row" $gap="sm" $margin={{ left: 'auto' }}>
          {linked &&
            editable &&
            link(
              refreshing ? t('Refreshing…') : t('Refresh'),
              () => void refresh(),
              refreshing,
            )}
          {editable &&
            link(docId ? t('Change') : t('Choose a spreadsheet…'), () =>
              setPicking(true),
            )}
          {linked && (
            <Link href={`/docs/${docId}/`}>
              <Text as="span" $size="sm" $theme="brand">
                {t('Open the spreadsheet')}
              </Text>
            </Link>
          )}
        </Box>
      </Box>
      {legacy && (
        <Text $size="xs" $variation="secondary" $margin={{ bottom: 'xs' }}>
          {t(
            'A copy from the former spreadsheet service. Choose a spreadsheet to link this table again.',
          )}
        </Text>
      )}
      {problem && (
        <Text $size="sm" $theme="danger">
          {problem}
        </Text>
      )}
      {shown ? (
        <SpreadsheetTableView snapshot={shown} />
      ) : (
        <Text $size="sm" $variation="secondary">
          {docId
            ? t('Reading the spreadsheet…')
            : t('No spreadsheet chosen yet.')}
        </Text>
      )}
      {picking && (
        <SpreadsheetPicker
          initial={linked ? { docId, sheetId, range, header, name } : undefined}
          onClose={() => setPicking(false)}
          onPick={(choice) => {
            setPicking(false);
            editor.updateBlock(block, {
              props: {
                docId: choice.docId,
                sheetId: choice.sheetId,
                range: choice.range,
                header: choice.header,
                name: choice.name,
                tableId: '',
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
      sheetId: { default: '' },
      range: { default: '' },
      header: { default: true },
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
    aliases: ['spreadsheet', 'sheet', 'excel', 'khervecell', 'cell', 'table'],
    group,
    icon: <SpreadsheetIcon size={18} />,
    subtext: t('Cells from one of your spreadsheets, kept up to date'),
  },
];
