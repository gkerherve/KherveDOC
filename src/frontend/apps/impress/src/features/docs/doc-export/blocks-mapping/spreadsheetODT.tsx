import React from 'react';

import { parseSnapshot } from '../../doc-editor/components/custom-blocks/spreadsheetSnapshot';
import { DocsExporterODT } from '../types';

const cell = (text: string, key: number) =>
  React.createElement(
    'table:table-cell',
    { key, 'office:value-type': 'string' },
    React.createElement('text:p', {}, text),
  );

/** The document's copy of a KherveCELL table, as an ODF table. */
export const blockMappingSpreadsheetODT: DocsExporterODT['mappings']['blockMapping']['spreadsheet'] =
  (block) => {
    const snapshot = parseSnapshot(block.props.snapshot);
    if (!snapshot || !snapshot.columns.length) {
      return React.createElement('text:p', {}, block.props.name);
    }
    return React.createElement(
      'table:table',
      { 'table:name': block.props.name || 'Spreadsheet' },
      React.createElement('table:table-column', {
        'table:number-columns-repeated': snapshot.columns.length,
      }),
      React.createElement(
        'table:table-header-rows',
        {},
        React.createElement(
          'table:table-row',
          {},
          snapshot.columns.map((column, index) => cell(column, index)),
        ),
      ),
      ...snapshot.rows.map((row, rowIndex) =>
        React.createElement(
          'table:table-row',
          { key: rowIndex },
          row.map((text, index) => cell(text, index)),
        ),
      ),
    );
  };
