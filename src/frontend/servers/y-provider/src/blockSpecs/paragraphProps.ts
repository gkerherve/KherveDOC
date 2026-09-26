// Server twin of the frontend's paragraph props
// (apps/impress/src/features/docs/doc-editor/components/custom-blocks/paragraphProps.ts).
// Attributes missing from the schema are silently dropped when reading Yjs.

const LINE_SPACINGS = ['1', '1.15', '1.5', '2', '2.5', '3'] as const;
const PARAGRAPH_SPACINGS = [
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
const FIRST_LINE_INDENTS = ['0', '0.5', '1', '1.25', '1.5', '2'] as const;

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
  styleName: {
    default: '' as const,
  },
};

type AnyBlockSpec = {
  config: { propSchema: Record<string, unknown> };
};

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
