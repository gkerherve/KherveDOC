// @vitest-environment node
// jsdom's Blob has no stream(), which the ODT zip writer needs.
import { ODTExporter } from '@blocknote/xl-odt-exporter';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import { blockNoteSchema } from '@/docs/doc-editor/components/BlockNoteEditor';
import {
  DocStyles,
  EMPTY_FORMAT,
  applyDocStyles,
  docStylesCss,
  sanitizeDocStyles,
  styleIdFor,
} from '@/docs/doc-editor/doc-styles/docStyles';

import { odtDocsSchemaMappings } from '../mappingODT';

const styles: DocStyles = {
  builtins: {
    paragraph: {
      ...EMPTY_FORMAT,
      fontFamily: 'Liberation Serif',
      lineSpacing: '1.5',
    },
  },
  custom: [
    {
      ...EMPTY_FORMAT,
      id: 'abstract',
      name: 'Abstract',
      fontSize: '10pt',
      italic: true,
      textAlignment: 'justify',
      spaceAfter: '12',
      firstLineIndent: '1',
    },
  ],
};

const paragraph = (
  props: Record<string, unknown>,
  text: string,
  textStyles = {},
) => ({
  id: text,
  type: 'paragraph',
  props: {
    backgroundColor: 'default',
    textColor: 'default',
    textAlignment: 'left',
    lineSpacing: 'default',
    spaceBefore: 'default',
    spaceAfter: 'default',
    firstLineIndent: 'default',
    styleName: '',
    ...props,
  },
  content: [{ type: 'text', text, styles: textStyles }],
  children: [],
});

describe('document paragraph styles', () => {
  it('drops invalid or unsafe entries', () => {
    const clean = sanitizeDocStyles({
      builtins: {
        paragraph: {
          fontFamily: 'x;} body{display:none',
          fontSize: '12px',
          lineSpacing: '7',
        },
        bogus: {},
      },
      custom: [
        { id: 'ok', name: 'Fine', textColor: 'red' },
        { id: 'ok', name: 'Duplicate' },
        { id: 'Bad Id"', name: 'Bad' },
        { id: 'noname', name: '  ' },
      ],
    });
    expect(clean.builtins).toEqual({ paragraph: EMPTY_FORMAT });
    expect(clean.custom.map((style) => style.id)).toEqual(['ok']);
    expect(clean.custom[0].textColor).toBe('red');
  });

  it('derives unique ids from names', () => {
    expect(styleIdFor('Légende de figure', [])).toBe('legende-de-figure');
    expect(styleIdFor('Abstract', ['abstract'])).toBe('abstract-2');
    expect(styleIdFor('!!!', [])).toBe('style');
  });

  it('renders editor CSS for built-in and custom styles', () => {
    const css = docStylesCss(styles);
    expect(css).toContain(
      '.bn-block-content[data-content-type="paragraph"]:not([data-style-name]) .bn-inline-content',
    );
    expect(css).toContain('line-height: 1.5;');
    expect(css).toContain(
      '.bn-block-content[data-style-name="abstract"] { --level: 10pt !important; text-align: justify; margin-bottom: 12pt; }',
    );
    expect(css).toContain('font-style: italic;');
    expect(css).toContain('text-indent: 1cm;');
  });

  it('bakes styles into blocks for export, letting direct formatting win', () => {
    const blocks = applyDocStyles(
      [
        paragraph({}, 'Body'),
        paragraph({ styleName: 'abstract', spaceAfter: '3' }, 'Abstract', {
          fontSize: '14pt',
        }),
      ],
      styles,
    );
    const [body, abstract] = blocks;

    expect(body.props.lineSpacing).toBe('1.5');
    expect(body.content[0].styles).toEqual({ fontFamily: 'Liberation Serif' });

    // The custom style replaces the built-in one entirely.
    expect(abstract.props.lineSpacing).toBe('default');
    expect(abstract.props.textAlignment).toBe('justify');
    expect(abstract.props.firstLineIndent).toBe('1');
    expect(abstract.props.spaceAfter).toBe('3');
    expect(abstract.content[0].styles).toEqual({
      fontSize: '14pt',
      italic: true,
    });
  });

  it('reaches the ODT export', async () => {
    const exporter = new ODTExporter(blockNoteSchema, odtDocsSchemaMappings);
    const blob = await exporter.toODTDocument(
      applyDocStyles(
        [paragraph({ styleName: 'abstract' }, 'Styled')],
        styles,
      ) as never,
    );
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = (await zip.file('content.xml')?.async('string')) ?? '';

    expect(xml).toContain('fo:text-align="justify"');
    expect(xml).toContain('fo:margin-bottom="12pt"');
    expect(xml).toContain('fo:font-size="10pt"');
    expect(xml).toContain('fo:font-style="italic"');
  });
});
