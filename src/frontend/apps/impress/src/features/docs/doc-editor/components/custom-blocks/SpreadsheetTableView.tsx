import { css } from 'styled-components';

import { Box } from '@/components';

import type { SpreadsheetSnapshot } from './spreadsheetSnapshot';

const tableCss = css`
  width: 100%;
  border-collapse: collapse;
  font-size: 0.92em;
  /* The editor's styles make thead a block; keep a real table. */
  display: table;
  thead {
    display: table-header-group;
  }
  tbody {
    display: table-row-group;
  }
  tr {
    display: table-row;
  }
  th,
  td {
    border: 1px solid var(--c--contextuals--border--surface--primary, #ddd);
    padding: 4px 8px;
    text-align: left;
    vertical-align: top;
  }
  td.num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  th {
    font-weight: 600;
    background: var(--c--contextuals--background--surface--tertiary, #f4f5f7);
  }
`;

const isNumber = (text: string) =>
  /^[-+]?[\d\s.,]*\d[\d\s.,]*(%|\s?[€$£])?$|^[€$£]\s?[-+]?[\d.,]+$/.test(
    text.trim(),
  );

/** A spreadsheet table as shown in a document: numbers on the right. */
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
              <td
                key={cellIndex}
                className={isNumber(cell) ? 'num' : undefined}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </Box>
  </Box>
);
