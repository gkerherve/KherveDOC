import { DefaultProps } from '@blocknote/core';
import { odtDefaultSchemaMappings } from '@blocknote/xl-odt-exporter';
import React from 'react';

import { odtParagraphFormatting } from '../paragraphFormatting';
import { DocsExporterODT } from '../types';

// Paragraphs, headings and quotes with spacing or indent get their own ODF
// paragraph style; without them BlockNote's default mapping is used as is.

type BlockMapping = DocsExporterODT['mappings']['blockMapping'];
// The mapping signature types the exporter generically; at runtime it is the
// ODTExporter, which registers automatic styles.
type Exporter = Parameters<BlockMapping['paragraph']>[1] & {
  registerStyle: (style: (name: string) => React.ReactNode) => string;
};

const ALIGN: Record<string, string> = {
  center: 'center',
  right: 'end',
  justify: 'justify',
};

const tabs = (nestingLevel: number) =>
  Array.from({ length: nestingLevel }, (_, i) =>
    React.createElement('text:tab', { key: i }),
  );

const registerParagraphStyle = (
  exporter: Exporter,
  props: Partial<DefaultProps>,
  parentStyleName: string,
  extraParagraph: Record<string, string> = {},
  extraText: Record<string, string> = {},
) => {
  const colors = exporter.options.colors;
  const background =
    props.backgroundColor && props.backgroundColor !== 'default'
      ? colors[props.backgroundColor]?.background
      : undefined;
  const color =
    props.textColor && props.textColor !== 'default'
      ? colors[props.textColor]?.text
      : undefined;

  const paragraphAttributes = {
    ...extraParagraph,
    ...(props.textAlignment &&
      ALIGN[props.textAlignment] && {
        'fo:text-align': ALIGN[props.textAlignment],
      }),
    ...(background && { 'fo:background-color': background }),
    ...odtParagraphFormatting(props),
  };
  const textAttributes = { ...extraText, ...(color && { 'fo:color': color }) };

  return exporter.registerStyle((name: string) =>
    React.createElement(
      'style:style',
      {
        'style:name': name,
        'style:family': 'paragraph',
        'style:parent-style-name': parentStyleName,
      },
      React.createElement('style:paragraph-properties', paragraphAttributes),
      Object.keys(textAttributes).length
        ? React.createElement('style:text-properties', textAttributes)
        : undefined,
    ),
  );
};

const hasFormatting = (props: object) =>
  Object.keys(odtParagraphFormatting(props)).length > 0;

const defaults =
  odtDefaultSchemaMappings.blockMapping as unknown as BlockMapping;

export const blockMappingParagraphODT: BlockMapping['paragraph'] = (
  block,
  exporter,
  nestingLevel,
  ...rest
) => {
  if (!hasFormatting(block.props)) {
    return defaults.paragraph(block, exporter, nestingLevel, ...rest);
  }
  return React.createElement(
    'text:p',
    {
      'text:style-name': registerParagraphStyle(
        exporter as Exporter,
        block.props,
        'Standard',
      ),
    },
    ...tabs(nestingLevel),
    ...exporter.transformInlineContent(block.content),
  );
};

export const blockMappingHeadingODT: BlockMapping['heading'] = (
  block,
  exporter,
  nestingLevel,
  ...rest
) => {
  if (!hasFormatting(block.props)) {
    return defaults.heading(block, exporter, nestingLevel, ...rest);
  }
  return React.createElement(
    'text:h',
    {
      'text:outline-level': `${block.props.level}`,
      'text:style-name': registerParagraphStyle(
        exporter as Exporter,
        block.props,
        `Heading_20_${block.props.level}`,
      ),
    },
    ...tabs(nestingLevel),
    ...exporter.transformInlineContent(block.content),
  );
};

export const blockMappingQuoteODT: BlockMapping['quote'] = (
  block,
  exporter,
  nestingLevel,
  ...rest
) => {
  if (!hasFormatting(block.props)) {
    return defaults.quote(block, exporter, nestingLevel, ...rest);
  }
  return React.createElement(
    'text:p',
    {
      'text:style-name': registerParagraphStyle(
        exporter as Exporter,
        block.props,
        'Standard',
        { 'fo:border-left': '2pt solid #7D797A', 'fo:padding-left': '0.25in' },
        { 'fo:color': '#7D797A' },
      ),
    },
    ...tabs(nestingLevel),
    ...exporter.transformInlineContent(block.content),
  );
};
