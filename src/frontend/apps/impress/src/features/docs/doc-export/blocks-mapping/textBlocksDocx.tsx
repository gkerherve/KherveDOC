import { CheckBox, Paragraph, TextRun } from 'docx';

import { docxParagraphFormatting } from '../paragraphFormatting';
import { DocsExporterDocx } from '../types';
import { docxBlockPropsToStyles } from '../utils';

// Mirrors BlockNote's default DOCX text-block mappings, plus the paragraph
// spacing and indent props.

type BlockMapping = DocsExporterDocx['mappings']['blockMapping'];

const MAX_LIST_LEVEL = 8;
const listLevel = (nestingLevel: number) =>
  Math.min(Math.max(nestingLevel, 0), MAX_LIST_LEVEL);

const baseOptions = (
  props: Parameters<typeof docxBlockPropsToStyles>[0],
  exporter: Parameters<BlockMapping['paragraph']>[1],
) => ({
  ...docxBlockPropsToStyles(props, exporter.options.colors),
  ...docxParagraphFormatting(props),
});

export const blockMappingParagraphDocx: BlockMapping['paragraph'] = (
  block,
  exporter,
) =>
  new Paragraph({
    ...baseOptions(block.props, exporter),
    children: exporter.transformInlineContent(block.content),
  });

export const blockMappingHeadingDocx: BlockMapping['heading'] = (
  block,
  exporter,
) =>
  new Paragraph({
    ...baseOptions(block.props, exporter),
    children: exporter.transformInlineContent(block.content),
    heading: `Heading${block.props.level as 1 | 2 | 3 | 4 | 5 | 6}`,
  });

export const blockMappingBulletListItemDocx: BlockMapping['bulletListItem'] = (
  block,
  exporter,
  nestingLevel,
) =>
  new Paragraph({
    ...baseOptions(block.props, exporter),
    children: exporter.transformInlineContent(block.content),
    numbering: {
      reference: 'blocknote-bullet-list',
      level: listLevel(nestingLevel),
    },
  });

export const blockMappingNumberedListItemDocx: BlockMapping['numberedListItem'] =
  (block, exporter, nestingLevel) =>
    new Paragraph({
      ...baseOptions(block.props, exporter),
      children: exporter.transformInlineContent(block.content),
      numbering: {
        reference: 'blocknote-numbered-list',
        level: listLevel(nestingLevel),
      },
    });

export const blockMappingCheckListItemDocx: BlockMapping['checkListItem'] = (
  block,
  exporter,
) =>
  new Paragraph({
    ...baseOptions(block.props, exporter),
    children: [
      new CheckBox({ checked: block.props.checked }),
      new TextRun({ children: [' '] }),
      ...exporter.transformInlineContent(block.content),
    ],
  });

export const blockMappingToggleListItemDocx: BlockMapping['toggleListItem'] = (
  block,
  exporter,
) =>
  new Paragraph({
    ...baseOptions(block.props, exporter),
    children: [
      new TextRun({ children: ['> '] }),
      ...exporter.transformInlineContent(block.content),
    ],
  });
