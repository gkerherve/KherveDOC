// @vitest-environment node
import { renderToBuffer } from '@react-pdf/renderer';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { blockNoteSchema } from '@/docs/doc-editor/components/BlockNoteEditor';
import { DEFAULT_PAGE_SETUP } from '@/docs/doc-editor/page-setup/pageSetup';

import { KhervePDFExporter } from '../KhervePDFExporter';
import { blockMappingSpreadsheetDocx } from '../blocks-mapping/spreadsheetDocx';
import { blockMappingSpreadsheetODT } from '../blocks-mapping/spreadsheetODT';
import { pdfDocsSchemaMappings } from '../mappingPDF';

const block = {
  id: '1',
  type: 'spreadsheet',
  props: {
    docId: 'abc',
    tableId: 'Table1',
    name: 'Lab results',
    snapshot: JSON.stringify({
      columns: ['Sample', 'Mass'],
      rows: [
        ['A', '1.5'],
        ['B', '2'],
      ],
    }),
  },
  content: undefined,
  children: [],
} as never;

describe('spreadsheet table exports', () => {
  it('writes an ODF table with a header row', () => {
    const element = blockMappingSpreadsheetODT(block, {} as never, 0, 0);
    const xml = renderToStaticMarkup(element as never);
    expect(xml).toContain('table:name="Lab results"');
    expect(xml).toContain('table:number-columns-repeated="2"');
    expect(xml).toMatch(/<table:table-header-rows>.*Sample.*Mass/);
    expect(xml.match(/<table:table-row>/g)).toHaveLength(3);
  });

  it('writes a Word table with a header row', () => {
    const table = blockMappingSpreadsheetDocx(block, {} as never, 0, 0) as {
      root: unknown[];
    };
    const text = JSON.stringify(table);
    expect(text).toContain('Sample');
    expect(text).toContain('1.5');
    expect(text).toContain('w:tblHeader');
  });

  it('renders into a PDF', async () => {
    const exporter = new KhervePDFExporter(
      blockNoteSchema,
      pdfDocsSchemaMappings,
    );
    const document = await exporter.toReactPDFDocumentWithPageSetup(
      [
        {
          id: 'p1',
          type: 'paragraph',
          props: {
            backgroundColor: 'default',
            textColor: 'default',
            textAlignment: 'left',
          },
          content: [{ type: 'text', text: 'Results:', styles: {} }],
          children: [],
        },
        block,
      ] as never,
      DEFAULT_PAGE_SETUP,
    );
    const pdf = (await renderToBuffer(document)).toString('latin1');
    expect(pdf.match(/\/Type \/Page\b/g)).toHaveLength(1);
  }, 60000);

  it('falls back to the name without a stored copy', () => {
    const empty = {
      ...(block as object),
      props: { name: 'Lab', snapshot: '' },
    };
    const xml = renderToStaticMarkup(
      blockMappingSpreadsheetODT(empty as never, {} as never, 0, 0) as never,
    );
    expect(xml).toBe('<text:p>Lab</text:p>');
  });
});
