// @vitest-environment node
// jsdom's Blob has no stream(), which the ODT zip writer needs.
import { ODTExporter } from '@blocknote/xl-odt-exporter';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import { blockNoteSchema } from '@/docs/doc-editor/components/BlockNoteEditor';

import { odtDocsSchemaMappings } from '../mappingODT';
import { pdfDocsSchemaMappings } from '../mappingPDF';

import { styledBlocks } from './customStylesFixture';

describe('custom text styles in ODT and PDF exports', () => {
  it('writes font, size, superscript and subscript to ODT', async () => {
    const exporter = new ODTExporter(blockNoteSchema, odtDocsSchemaMappings);
    const blob = await exporter.toODTDocument(styledBlocks);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = (await zip.file('content.xml')?.async('string')) ?? '';

    expect(xml).toContain('fo:font-family="Liberation Serif"');
    expect(xml).toContain('fo:font-size="14pt"');
    expect(xml).toContain('style:text-position="super 58%"');
    expect(xml).toContain('style:text-position="sub 58%"');
  });

  it('maps styles to the standard PDF fonts', () => {
    const { styleMapping } = pdfDocsSchemaMappings;
    const exporter = {} as never;

    expect(styleMapping.fontFamily('Liberation Serif', exporter)).toEqual({
      fontFamily: 'Times-Roman',
    });
    expect(styleMapping.fontFamily('Liberation Mono', exporter)).toEqual({
      fontFamily: 'Courier',
    });
    expect(styleMapping.fontFamily('Liberation Sans', exporter)).toEqual({});
    expect(styleMapping.fontSize('14pt', exporter)).toEqual({ fontSize: 14 });
    expect(styleMapping.fontSize('huge', exporter)).toEqual({});
    expect(styleMapping.superscript(true, exporter)).toEqual({
      verticalAlign: 'super',
    });
  });
});
