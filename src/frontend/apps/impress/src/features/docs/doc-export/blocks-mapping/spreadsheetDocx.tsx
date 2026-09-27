import {
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

import { parseSnapshot } from '../../doc-editor/components/custom-blocks/spreadsheetSnapshot';
import { DocsExporterDocx } from '../types';

/** The document's copy of a SOV Sheets table, as a Word table. */
export const blockMappingSpreadsheetDocx: DocsExporterDocx['mappings']['blockMapping']['spreadsheet'] =
  (block) => {
    const snapshot = parseSnapshot(block.props.snapshot);
    if (!snapshot || !snapshot.columns.length) {
      return new Paragraph({ children: [new TextRun(block.props.name)] });
    }
    const cell = (text: string, header = false) =>
      new TableCell({
        children: [
          new Paragraph({ children: [new TextRun({ text, bold: header })] }),
        ],
        ...(header && {
          shading: { type: ShadingType.CLEAR, fill: 'F1F3F5', color: 'auto' },
        }),
      });
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          tableHeader: true,
          children: snapshot.columns.map((column) => cell(column, true)),
        }),
        ...snapshot.rows.map(
          (row) => new TableRow({ children: row.map((text) => cell(text)) }),
        ),
      ],
    });
  };
