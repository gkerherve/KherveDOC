// @vitest-environment node
import { renderToBuffer } from '@react-pdf/renderer';
import { describe, expect, it } from 'vitest';

import { blockNoteSchema } from '@/docs/doc-editor/components/BlockNoteEditor';
import { DEFAULT_PAGE_SETUP } from '@/docs/doc-editor/page-setup/pageSetup';

import { KhervePDFExporter } from '../KhervePDFExporter';
import { pdfDocsSchemaMappings } from '../mappingPDF';

import { styledBlocks } from './customStylesFixture';

describe('PDF rendering with page setup', () => {
  it('renders Letter landscape pages', async () => {
    const exporter = new KhervePDFExporter(
      blockNoteSchema,
      pdfDocsSchemaMappings,
    );
    const document = await exporter.toReactPDFDocumentWithPageSetup(
      styledBlocks,
      {
        ...DEFAULT_PAGE_SETUP,
        paperSize: 'Letter',
        orientation: 'landscape',
        header: 'Header',
        pageNumbers: 'bottom-right',
      },
    );
    const pdf = (await renderToBuffer(document)).toString('latin1');
    expect(pdf).toMatch(/\/MediaBox \[0 0 792(\.\d+)? 612(\.\d+)?\]/);
    // One content stream per page, each drawing the page number.
    expect(pdf.match(/\/Type \/Page\b/g)?.length).toBeGreaterThan(0);
  }, 60000);
});
