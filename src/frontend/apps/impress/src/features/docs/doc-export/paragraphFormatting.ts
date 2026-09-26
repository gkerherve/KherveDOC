import type { Style } from '@react-pdf/types';
import type { IParagraphOptions } from 'docx';

import { paragraphFormatting } from '@/docs/doc-editor/components/custom-blocks/paragraphProps';

const TWIPS_PER_PT = 20;
const TWIPS_PER_CM = 567;
const PT_PER_CM = 28.3465;

/** Word paragraph spacing (twips; line spacing in 240ths of a line). */
export const docxParagraphFormatting = (
  props: object,
): Pick<IParagraphOptions, 'spacing' | 'indent'> => {
  const f = paragraphFormatting(props);
  const spacing = {
    ...(f.lineSpacing !== undefined && {
      line: Math.round(f.lineSpacing * 240),
    }),
    ...(f.spaceBeforePt !== undefined && {
      before: f.spaceBeforePt * TWIPS_PER_PT,
    }),
    ...(f.spaceAfterPt !== undefined && {
      after: f.spaceAfterPt * TWIPS_PER_PT,
    }),
  };
  return {
    ...(Object.keys(spacing).length && { spacing }),
    ...(f.firstLineIndentCm !== undefined && {
      indent: { firstLine: Math.round(f.firstLineIndentCm * TWIPS_PER_CM) },
    }),
  };
};

export const pdfParagraphFormatting = (props: object): Style => {
  const f = paragraphFormatting(props);
  return {
    ...(f.lineSpacing !== undefined && { lineHeight: f.lineSpacing }),
    ...(f.spaceBeforePt !== undefined && { marginTop: f.spaceBeforePt }),
    ...(f.spaceAfterPt !== undefined && { marginBottom: f.spaceAfterPt }),
    ...(f.firstLineIndentCm !== undefined && {
      textIndent: f.firstLineIndentCm * PT_PER_CM,
    }),
  };
};

/** ODF `style:paragraph-properties` attributes. */
export const odtParagraphFormatting = (
  props: object,
): Record<string, string> => {
  const f = paragraphFormatting(props);
  return {
    ...(f.lineSpacing !== undefined && {
      'fo:line-height': `${Math.round(f.lineSpacing * 100)}%`,
    }),
    ...(f.spaceBeforePt !== undefined && {
      'fo:margin-top': `${f.spaceBeforePt}pt`,
    }),
    ...(f.spaceAfterPt !== undefined && {
      'fo:margin-bottom': `${f.spaceAfterPt}pt`,
    }),
    ...(f.firstLineIndentCm !== undefined && {
      'fo:text-indent': `${f.firstLineIndentCm}cm`,
    }),
  };
};
