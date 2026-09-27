import { ServerBlockNoteEditor } from '@blocknote/server-util';
import { describe, expect, test } from 'vitest';

import { docsBlockNoteSchema } from '@/blockSpecs';

// Text carrying a mark the server schema does not know is dropped when a
// Yjs document is read, so the editor's custom styles must round-trip here.
describe('custom text styles', () => {
  const editor = ServerBlockNoteEditor.create({ schema: docsBlockNoteSchema });

  const blocks = [
    {
      type: 'paragraph' as const,
      content: [
        {
          type: 'text' as const,
          text: 'Serif 14',
          styles: { fontFamily: 'Liberation Serif', fontSize: '14pt' },
        },
        { type: 'text' as const, text: 'sup', styles: { superscript: true } },
        { type: 'text' as const, text: 'sub', styles: { subscript: true } },
      ],
    },
  ];

  test('survive a Yjs round trip', () => {
    const ydoc = editor.blocksToYDoc(blocks, 'document-store');
    const [paragraph] = editor.yDocToBlocks(ydoc, 'document-store');

    expect(paragraph.content).toEqual([
      {
        type: 'text',
        text: 'Serif 14',
        styles: { fontFamily: 'Liberation Serif', fontSize: '14pt' },
      },
      { type: 'text', text: 'sup', styles: { superscript: true } },
      { type: 'text', text: 'sub', styles: { subscript: true } },
    ]);
  });

  test('keep paragraph spacing, indent and style name', () => {
    const props = {
      lineSpacing: '1.5',
      spaceBefore: '12',
      spaceAfter: '6',
      firstLineIndent: '1.25',
      styleName: 'Abstract',
    };
    const ydoc = editor.blocksToYDoc(
      [{ type: 'paragraph', props, content: 'Spaced' }],
      'document-store',
    );
    const [paragraph] = editor.yDocToBlocks(ydoc, 'document-store');

    expect(paragraph.props).toMatchObject(props);
  });

  test('keep footnotes', () => {
    const ydoc = editor.blocksToYDoc(
      [
        {
          type: 'paragraph',
          content: ['See', { type: 'footnote', props: { text: 'A note' } }],
        },
      ],
      'document-store',
    );
    const [paragraph] = editor.yDocToBlocks(ydoc, 'document-store');

    expect(paragraph.content).toEqual([
      { type: 'text', text: 'See', styles: {} },
      { type: 'footnote', props: { text: 'A note' } },
    ]);
  });

  test('keep SOV Sheets spreadsheet tables', async () => {
    const snapshot = JSON.stringify({
      columns: ['Sample', 'Mass'],
      rows: [['A', '1.5']],
    });
    const props = { docId: 'abc123', tableId: 'Table1', name: 'Lab', snapshot };
    const ydoc = editor.blocksToYDoc(
      [{ type: 'spreadsheet', props }],
      'document-store',
    );
    const [block] = editor.yDocToBlocks(ydoc, 'document-store');

    expect(block.type).toBe('spreadsheet');
    expect(block.props).toEqual(props);

    const html = await editor.blocksToHTMLLossy([
      { type: 'spreadsheet', props },
    ]);
    expect(html).toMatch(/<th[^>]*>Mass<\/th>/);
    expect(html).toMatch(/<td[^>]*>1\.5<\/td>/);
  });

  test('render to HTML', async () => {
    const html = await editor.blocksToHTMLLossy(blocks);

    expect(html).toContain('font-size: 14pt');
    expect(html).toMatch(/<sup[^>]*>sup<\/sup>/);
    expect(html).toMatch(/<sub[^>]*>sub<\/sub>/);
  });
});
