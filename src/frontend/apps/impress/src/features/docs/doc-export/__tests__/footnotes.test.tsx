// @vitest-environment node
// jsdom's Blob has no stream(), which the ODT zip writer needs.
import { ODTExporter } from '@blocknote/xl-odt-exporter';
import { FootnoteReferenceRun } from 'docx';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import { blockNoteSchema } from '@/docs/doc-editor/components/BlockNoteEditor';
import {
  collectFootnotes,
  numberFootnotes,
} from '@/docs/doc-editor/components/custom-inline-content';

import {
  footnoteRegistry,
  inlineContentMappingFootnoteDocx,
} from '../inline-content-mapping/footnotes';
import { odtDocsSchemaMappings } from '../mappingODT';

const paragraph = (
  id: string,
  content: unknown[],
  children: unknown[] = [],
) => ({
  id,
  type: 'paragraph',
  props: {
    backgroundColor: 'default',
    textColor: 'default',
    textAlignment: 'left',
  },
  content,
  children,
});

const note = (text: string) => ({ type: 'footnote', props: { text } });

const blocks = [
  paragraph(
    'p1',
    [{ type: 'text', text: 'First', styles: {} }, note('One')],
    [paragraph('p2', [note('Two (nested)')])],
  ),
  {
    id: 't1',
    type: 'table',
    props: { textColor: 'default' },
    content: {
      type: 'tableContent',
      columnWidths: [undefined],
      rows: [
        {
          cells: [
            {
              type: 'tableCell',
              content: [
                { type: 'text', text: 'Cell', styles: {} },
                note('Three (table)'),
              ],
              props: {},
            },
          ],
        },
      ],
    },
    children: [],
  },
];

describe('footnotes', () => {
  it('are collected in document order', () => {
    expect(collectFootnotes(blocks)).toEqual([
      'One',
      'Two (nested)',
      'Three (table)',
    ]);
  });

  it('become native ODT notes', async () => {
    const exporter = new ODTExporter(blockNoteSchema, odtDocsSchemaMappings);
    const blob = await exporter.toODTDocument(
      numberFootnotes(structuredClone(blocks)) as never,
    );
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = (await zip.file('content.xml')?.async('string')) ?? '';

    expect(xml).toContain(
      '<text:note text:id="ftn1" text:note-class="footnote"><text:note-citation>1</text:note-citation><text:note-body><text:p>One</text:p></text:note-body></text:note>',
    );
    expect(xml).toContain('<text:note-citation>3</text:note-citation>');
    expect(xml).toContain('Three (table)');
  });

  it('become Word footnote references with their definitions', () => {
    const exporter = {} as never;
    const run = inlineContentMappingFootnoteDocx(
      { type: 'footnote', props: { text: 'Word note' } } as never,
      exporter,
    );
    inlineContentMappingFootnoteDocx(
      { type: 'footnote', props: { text: 'Second' } } as never,
      exporter,
    );

    expect(run).toBeInstanceOf(FootnoteReferenceRun);
    expect(Object.keys(footnoteRegistry(exporter).docx)).toEqual(['1', '2']);
    expect(footnoteRegistry(exporter).notes).toEqual(['Word note', 'Second']);
  });
});
