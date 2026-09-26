// Keep in sync with src/frontend/servers/y-provider/src/blockSpecs/paragraphProps.ts.

export const LINE_SPACINGS = ['1', '1.15', '1.5', '2', '2.5', '3'] as const;
/** Paragraph spacing, in points. */
export const PARAGRAPH_SPACINGS = [
  '0',
  '3',
  '6',
  '8',
  '10',
  '12',
  '18',
  '24',
  '36',
] as const;
/** First-line indent, in centimetres. */
export const FIRST_LINE_INDENTS = [
  '0',
  '0.5',
  '1',
  '1.25',
  '1.5',
  '2',
] as const;

export const TEXT_BLOCK_TYPES = [
  'paragraph',
  'heading',
  'quote',
  'bulletListItem',
  'numberedListItem',
  'checkListItem',
  'toggleListItem',
] as const;

export const paragraphProps = {
  lineSpacing: {
    default: 'default' as const,
    values: ['default', ...LINE_SPACINGS] as const,
  },
  spaceBefore: {
    default: 'default' as const,
    values: ['default', ...PARAGRAPH_SPACINGS] as const,
  },
  spaceAfter: {
    default: 'default' as const,
    values: ['default', ...PARAGRAPH_SPACINGS] as const,
  },
  firstLineIndent: {
    default: 'default' as const,
    values: ['default', ...FIRST_LINE_INDENTS] as const,
  },
  /** Name of a document paragraph style (see the Styles panel). */
  styleName: {
    default: '' as const,
  },
};

export type ParagraphProps = {
  lineSpacing?: string;
  spaceBefore?: string;
  spaceAfter?: string;
  firstLineIndent?: string;
  styleName?: string;
};

type AnyBlockSpec = {
  config: { propSchema: Record<string, unknown> };
};

/**
 * Adds the paragraph-formatting props to a built-in text block. BlockNote
 * builds each node's attributes from `config.propSchema` when the schema is
 * created, and renders non-default props as `data-*` attributes styled by CSS.
 */
export const withParagraphProps = <T extends AnyBlockSpec>(spec: T) =>
  ({
    ...spec,
    config: {
      ...spec.config,
      propSchema: { ...spec.config.propSchema, ...paragraphProps },
    },
  }) as T & {
    config: T['config'] & { propSchema: typeof paragraphProps };
  };

const isSet = (value?: string) => !!value && value !== 'default';

/** Resolved paragraph formatting in physical units, for exporters. */
export const paragraphFormatting = (blockProps: object) => {
  const props = blockProps as ParagraphProps;
  return {
    lineSpacing: isSet(props.lineSpacing)
      ? Number(props.lineSpacing)
      : undefined,
    spaceBeforePt: isSet(props.spaceBefore)
      ? Number(props.spaceBefore)
      : undefined,
    spaceAfterPt: isSet(props.spaceAfter)
      ? Number(props.spaceAfter)
      : undefined,
    firstLineIndentCm: isSet(props.firstLineIndent)
      ? Number(props.firstLineIndent)
      : undefined,
  };
};
