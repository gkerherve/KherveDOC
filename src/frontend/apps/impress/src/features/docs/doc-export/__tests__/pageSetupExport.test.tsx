// @vitest-environment node
// jsdom's Blob has no stream(), which the ODT zip writer needs.
import { ODTExporter } from '@blocknote/xl-odt-exporter';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import { blockNoteSchema } from '@/docs/doc-editor/components/BlockNoteEditor';
import { printPageCss } from '@/docs/doc-editor/page-setup/pageCss';
import {
  DEFAULT_PAGE_SETUP,
  PageSetup,
  sanitizePageSetup,
} from '@/docs/doc-editor/page-setup/pageSetup';

import { odtDocsSchemaMappings } from '../mappingODT';
import {
  docxSectionOptions,
  odtWithPageSetup,
  pdfPageSize,
} from '../pageSetupExport';

import { styledBlocks } from './customStylesFixture';

const setup: PageSetup = {
  ...DEFAULT_PAGE_SETUP,
  paperSize: 'Letter',
  orientation: 'landscape',
  margins: { top: 2, bottom: 3, left: 1.5, right: 1 },
  header: 'Draft <v2> & "notes"',
  footer: 'Confidential',
  pageNumbers: 'bottom-right',
};

describe('page setup', () => {
  it('sanitizes values written by collaborators', () => {
    expect(
      sanitizePageSetup({
        paperSize: 'Huge',
        orientation: 'sideways',
        margins: { top: -4, bottom: 'x', left: 99, right: 2 },
        header: 42,
        pageNumbers: 'everywhere',
      }),
    ).toEqual({
      ...DEFAULT_PAGE_SETUP,
      margins: { top: 0, bottom: 2.5, left: 10, right: 2 },
    });
  });

  it('builds Word section options', () => {
    const options = docxSectionOptions(setup);
    expect(options.properties?.page?.size).toMatchObject({
      width: 12240,
      height: 15840,
      orientation: 'landscape',
    });
    expect(options.properties?.page?.margin).toMatchObject({
      top: 1134,
      bottom: 1701,
      left: 850,
      right: 567,
    });
    expect(options.headers?.default).toBeDefined();
    expect(options.footers?.default).toBeDefined();
    expect(docxSectionOptions(DEFAULT_PAGE_SETUP).headers).toBeUndefined();
  });

  it('sizes PDF pages in points, honouring orientation', () => {
    const [width, height] = pdfPageSize(setup);
    expect(width).toBeCloseTo(792, 0);
    expect(height).toBeCloseTo(612, 0);
  });

  it('writes page size, margins, header and footer into ODT styles', async () => {
    const exporter = new ODTExporter(blockNoteSchema, odtDocsSchemaMappings);
    const odt = await odtWithPageSetup(
      await exporter.toODTDocument(styledBlocks),
      setup,
    );
    const zip = await JSZip.loadAsync(await odt.arrayBuffer());
    const styles = (await zip.file('styles.xml')?.async('string')) ?? '';

    expect(Object.keys(zip.files)[0]).toBe('mimetype');
    expect(styles).toContain('fo:page-width="27.94cm"');
    expect(styles).toContain('fo:page-height="21.59cm"');
    expect(styles).toContain('style:print-orientation="landscape"');
    expect(styles).toContain('fo:margin-left="1.5cm"');
    expect(styles).toContain('Draft &lt;v2&gt; &amp; &quot;notes&quot;');
    expect(styles).toContain(
      '<text:p text:style-name="Kherve_Header_Footer">Confidential</text:p>',
    );
    expect(styles).toContain('<text:page-number text:select-page="current"/>');
    expect(await zip.file('content.xml')?.async('string')).toContain('E=mc');
  });

  it('prints with @page rules and escaped header text', () => {
    const css = printPageCss(setup);
    expect(css).toContain('size: 27.94cm 21.59cm;');
    expect(css).toContain('margin: 2cm 1cm 3cm 1.5cm;');
    expect(css).toContain('@top-left { content: "Draft <v2> & \\"notes\\""');
    expect(css).toContain('@bottom-right { content: counter(page)');
  });
});
