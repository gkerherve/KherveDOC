// @vitest-environment node
// jsdom's Blob has no stream(), which the ODT zip writer needs.
import { ODTExporter } from '@blocknote/xl-odt-exporter';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import { blockNoteSchema } from '@/docs/doc-editor/components/BlockNoteEditor';

import { odtDocsSchemaMappings } from '../mappingODT';
import {
  docxParagraphFormatting,
  pdfParagraphFormatting,
  pdfTextFormatting,
} from '../paragraphFormatting';

const spaced = {
  lineSpacing: '1.5',
  spaceBefore: '12',
  spaceAfter: '6',
  firstLineIndent: '1.25',
};

describe('paragraph spacing and indent in exports', () => {
  it('converts to Word units', () => {
    expect(docxParagraphFormatting(spaced)).toEqual({
      spacing: { line: 360, before: 240, after: 120 },
      indent: { firstLine: 709 },
    });
    expect(docxParagraphFormatting({ lineSpacing: 'default' })).toEqual({});
  });

  it('converts to PDF points', () => {
    expect(pdfParagraphFormatting(spaced)).toEqual({
      lineHeight: 1.5,
      marginTop: 12,
      marginBottom: 6,
    });
    const text = pdfTextFormatting(spaced);
    expect(text.lineHeight).toBe(1.5);
    expect(text.textIndent).toBeCloseTo(35.43, 1);
  });

  it('writes an ODT paragraph style', async () => {
    const exporter = new ODTExporter(blockNoteSchema, odtDocsSchemaMappings);
    const blob = await exporter.toODTDocument([
      {
        id: 'p1',
        type: 'paragraph',
        props: {
          backgroundColor: 'default',
          textColor: 'default',
          textAlignment: 'justify',
          styleName: '',
          ...spaced,
        },
        content: [{ type: 'text', text: 'Spaced', styles: {} }],
        children: [],
      },
    ] as never);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = (await zip.file('content.xml')?.async('string')) ?? '';

    expect(xml).toContain('fo:line-height="150%"');
    expect(xml).toContain('fo:margin-top="12pt"');
    expect(xml).toContain('fo:margin-bottom="6pt"');
    expect(xml).toContain('fo:text-indent="1.25cm"');
    expect(xml).toContain('fo:text-align="justify"');
    expect(xml).toContain('Spaced');
  });
});
