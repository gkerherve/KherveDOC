type FootnoteItem = {
  type?: string;
  props?: { text?: unknown; number?: number };
};

/** Visits every footnote in document order (blocks, tables, then children). */
const forEachFootnote = (
  blocks: readonly unknown[],
  visit: (footnote: FootnoteItem) => void,
) => {
  const visitInline = (content: unknown) => {
    if (!Array.isArray(content)) {
      return;
    }
    for (const item of content as FootnoteItem[]) {
      if (item?.type === 'footnote') {
        visit(item);
      }
    }
  };

  const visitBlock = (block: { content?: unknown; children?: unknown[] }) => {
    const { content } = block;
    if (Array.isArray(content)) {
      visitInline(content);
    } else if (
      content &&
      typeof content === 'object' &&
      'rows' in content &&
      Array.isArray(content.rows)
    ) {
      for (const row of (content as { rows: { cells?: unknown[] }[] }).rows) {
        for (const cell of row.cells ?? []) {
          visitInline(
            Array.isArray(cell)
              ? cell
              : (cell as { content?: unknown } | undefined)?.content,
          );
        }
      }
    }
    for (const child of block.children ?? []) {
      visitBlock(child as typeof block);
    }
  };

  for (const block of blocks) {
    visitBlock(block as { content?: unknown; children?: unknown[] });
  }
};

const footnoteText = (item: FootnoteItem) =>
  typeof item.props?.text === 'string' ? item.props.text : '';

/** Footnote texts in document order. */
export const collectFootnotes = (blocks: readonly unknown[]): string[] => {
  const notes: string[] = [];
  forEachFootnote(blocks, (item) => notes.push(footnoteText(item)));
  return notes;
};

/**
 * Stamps each footnote with its number in document order. Exporters visit a
 * block's children before its own content, so they cannot count themselves.
 * Mutates `blocks`: pass a copy such as `editor.document`.
 */
export const numberFootnotes = <T extends readonly unknown[]>(blocks: T): T => {
  let number = 0;
  forEachFootnote(blocks, (item) => {
    number += 1;
    item.props = { ...item.props, number };
  });
  return blocks;
};
