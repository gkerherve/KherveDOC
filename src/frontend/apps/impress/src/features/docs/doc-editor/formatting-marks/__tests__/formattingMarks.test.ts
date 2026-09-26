import { Schema } from '@tiptap/pm/model';
import { describe, expect, it } from 'vitest';

import { buildMarkDecorations } from '../formattingMarks';

const schema = new Schema({
  nodes: {
    doc: { content: 'paragraph+' },
    paragraph: { content: 'inline*', group: 'block' },
    text: { group: 'inline' },
    hardBreak: { inline: true, group: 'inline' },
  },
});

describe('buildMarkDecorations', () => {
  it('marks spaces, non-breaking spaces, tabs and line breaks', () => {
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [
        schema.text('a b c\td'),
        schema.node('hardBreak'),
        schema.text('e'),
      ]),
    ]);

    const found = buildMarkDecorations(doc)
      .find()
      .map((decoration) => ({
        from: decoration.from,
        to: decoration.to,
        class: (
          decoration as unknown as { type: { attrs?: { class?: string } } }
        ).type.attrs?.class,
      }));

    // Text starts at 1: "a"=1, " "=2, "b"=3, nbsp=4, "c"=5, tab=6, "d"=7,
    // then the hard break at 8.
    expect(found).toEqual([
      { from: 2, to: 3, class: 'kherve-mark-space' },
      { from: 4, to: 5, class: 'kherve-mark-nbsp' },
      { from: 6, to: 7, class: 'kherve-mark-tab' },
      { from: 8, to: 8, class: undefined },
    ]);
  });

  it('adds nothing to text without spaces', () => {
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [schema.text('word')]),
    ]);
    expect(buildMarkDecorations(doc).find()).toHaveLength(0);
  });
});
