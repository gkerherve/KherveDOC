import { Text } from '@react-pdf/renderer';
import { FootnoteReferenceRun, Paragraph, TextRun } from 'docx';
import React from 'react';

import { DocsExporterDocx, DocsExporterODT, DocsExporterPDF } from '../types';

/**
 * Footnotes numbered in the order the exporter meets them, which is document
 * order. One registry per exporter instance, i.e. per export.
 */
interface FootnoteRegistry {
  notes: string[];
  /** Word footnote definitions, handed to the DOCX `Document` options. */
  docx: Record<number, { children: Paragraph[] }>;
}

const registries = new WeakMap<object, FootnoteRegistry>();

export const footnoteRegistry = (exporter: object): FootnoteRegistry => {
  let registry = registries.get(exporter);
  if (!registry) {
    registry = { notes: [], docx: {} };
    registries.set(exporter, registry);
  }
  return registry;
};

/**
 * Uses the number stamped by `numberFootnotes` (document order); exporters
 * reach nested blocks before their parent's text, so counting calls is wrong.
 */
const addNote = (exporter: object, props: { text: string }) => {
  const registry = footnoteRegistry(exporter);
  const stamped = (props as { number?: unknown }).number;
  const number =
    typeof stamped === 'number' && stamped > 0
      ? stamped
      : registry.notes.filter((note) => note !== undefined).length + 1;
  registry.notes[number - 1] = props.text;
  return { registry, number };
};

export const inlineContentMappingFootnoteDocx: DocsExporterDocx['mappings']['inlineContentMapping']['footnote'] =
  (inlineContent, exporter) => {
    const { registry, number } = addNote(exporter, inlineContent.props);
    registry.docx[number] = {
      children: [
        new Paragraph({ children: [new TextRun(inlineContent.props.text)] }),
      ],
    };
    return new FootnoteReferenceRun(number);
  };

export const inlineContentMappingFootnoteODT: DocsExporterODT['mappings']['inlineContentMapping']['footnote'] =
  (inlineContent, exporter) => {
    const { number } = addNote(exporter, inlineContent.props);
    return React.createElement(
      'text:note',
      { 'text:id': `ftn${number}`, 'text:note-class': 'footnote' },
      React.createElement('text:note-citation', null, `${number}`),
      React.createElement(
        'text:note-body',
        null,
        React.createElement('text:p', null, inlineContent.props.text),
      ),
    );
  };

export const inlineContentMappingFootnotePDF: DocsExporterPDF['mappings']['inlineContentMapping']['footnote'] =
  (inlineContent, exporter) => {
    const { number } = addNote(exporter, inlineContent.props);
    return (
      <Text
        key={`footnote-${number}`}
        style={{ fontSize: 8, verticalAlign: 'super' }}
      >
        {`${number}`}
      </Text>
    );
  };
