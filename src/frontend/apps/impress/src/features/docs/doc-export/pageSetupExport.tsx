import { Text } from '@react-pdf/renderer';
import {
  AlignmentType,
  Footer,
  Header,
  ISectionOptions,
  PageNumber,
  PageOrientation,
  Paragraph,
  TextRun,
} from 'docx';
import JSZip from 'jszip';

import {
  CM_TO_PT,
  CM_TO_TWIPS,
  PAPER_SIZES,
  PageSetup,
  pageDimensions,
} from '@/docs/doc-editor/page-setup/pageSetup';

const twips = (cm: number) => Math.round(cm * CM_TO_TWIPS);
const HEADER_FOOTER_TEXT_PT = 9;
const HEADER_FOOTER_COLOR = '555555';

/* ---------------------------------- DOCX --------------------------------- */

const docxPageNumber = (
  alignment: (typeof AlignmentType)[keyof typeof AlignmentType],
) =>
  new Paragraph({
    alignment,
    children: [
      new TextRun({
        children: [PageNumber.CURRENT],
        size: HEADER_FOOTER_TEXT_PT * 2,
        color: HEADER_FOOTER_COLOR,
      }),
    ],
  });

const docxText = (text: string) =>
  new Paragraph({
    children: [
      new TextRun({
        text,
        size: HEADER_FOOTER_TEXT_PT * 2,
        color: HEADER_FOOTER_COLOR,
      }),
    ],
  });

export const docxSectionOptions = (
  setup: PageSetup,
): Omit<ISectionOptions, 'children'> => {
  // docx swaps width and height itself for landscape pages.
  const paper = PAPER_SIZES[setup.paperSize];
  const headerChildren = [
    ...(setup.header ? [docxText(setup.header)] : []),
    ...(setup.pageNumbers === 'top-right'
      ? [docxPageNumber(AlignmentType.RIGHT)]
      : []),
  ];
  const footerChildren = [
    ...(setup.footer ? [docxText(setup.footer)] : []),
    ...(setup.pageNumbers === 'bottom-center'
      ? [docxPageNumber(AlignmentType.CENTER)]
      : setup.pageNumbers === 'bottom-right'
        ? [docxPageNumber(AlignmentType.RIGHT)]
        : []),
  ];

  return {
    properties: {
      page: {
        size: {
          width: twips(paper.width),
          height: twips(paper.height),
          orientation:
            setup.orientation === 'landscape'
              ? PageOrientation.LANDSCAPE
              : PageOrientation.PORTRAIT,
        },
        margin: {
          top: twips(setup.margins.top),
          bottom: twips(setup.margins.bottom),
          left: twips(setup.margins.left),
          right: twips(setup.margins.right),
          header: twips(Math.min(1.25, setup.margins.top / 2)),
          footer: twips(Math.min(1.25, setup.margins.bottom / 2)),
        },
      },
    },
    ...(headerChildren.length && {
      headers: { default: new Header({ children: headerChildren }) },
    }),
    ...(footerChildren.length && {
      footers: { default: new Footer({ children: footerChildren }) },
    }),
  };
};

/* ----------------------------------- PDF --------------------------------- */

export const pdfPageSize = (setup: PageSetup): [number, number] => {
  const { width, height } = pageDimensions(setup);
  return [width * CM_TO_PT, height * CM_TO_PT];
};

export const pdfPagePadding = (setup: PageSetup) => ({
  paddingTop: setup.margins.top * CM_TO_PT,
  paddingBottom: setup.margins.bottom * CM_TO_PT,
  paddingLeft: setup.margins.left * CM_TO_PT,
  paddingRight: setup.margins.right * CM_TO_PT,
});

/** Header, footer and page number, drawn on every page. */
export const pdfPageDecorations = (setup: PageSetup) => {
  const { top, bottom, left, right } = setup.margins;
  const text = {
    position: 'absolute' as const,
    left: left * CM_TO_PT,
    right: right * CM_TO_PT,
    fontSize: HEADER_FOOTER_TEXT_PT,
    color: `#${HEADER_FOOTER_COLOR}`,
    // No lineHeight here: react-pdf silently drops `render` (page number)
    // text that has or inherits one.
  };
  const headerTop = Math.max((top / 2) * CM_TO_PT - HEADER_FOOTER_TEXT_PT, 8);
  const footerBottom = Math.max(
    (bottom / 2) * CM_TO_PT - HEADER_FOOTER_TEXT_PT,
    8,
  );
  const numberAlign =
    setup.pageNumbers === 'bottom-center' ? 'center' : 'right';
  const numberAtTop = setup.pageNumbers === 'top-right';

  if (!setup.header && !setup.footer && setup.pageNumbers === 'none') {
    return undefined;
  }

  return (
    <>
      {setup.header && (
        <Text style={{ ...text, top: headerTop }}>{setup.header}</Text>
      )}
      {setup.footer && (
        <Text style={{ ...text, bottom: footerBottom }}>{setup.footer}</Text>
      )}
      {setup.pageNumbers !== 'none' && (
        <Text
          style={{
            ...text,
            textAlign: numberAlign,
            ...(numberAtTop ? { top: headerTop } : { bottom: footerBottom }),
          }}
          fixed
          render={({ pageNumber }) => `${pageNumber}`}
        />
      )}
    </>
  );
};

/* ----------------------------------- ODT --------------------------------- */

const xmlEscape = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const ODT_PARAGRAPH_STYLES = `
  <style:style style:name="Kherve_Header_Footer" style:family="paragraph">
    <style:text-properties fo:font-size="${HEADER_FOOTER_TEXT_PT}pt" fo:color="#${HEADER_FOOTER_COLOR}"/>
  </style:style>
  <style:style style:name="Kherve_Header_Footer_Center" style:family="paragraph" style:parent-style-name="Kherve_Header_Footer">
    <style:paragraph-properties fo:text-align="center"/>
  </style:style>
  <style:style style:name="Kherve_Header_Footer_Right" style:family="paragraph" style:parent-style-name="Kherve_Header_Footer">
    <style:paragraph-properties fo:text-align="end"/>
  </style:style>
`;

const odtParagraph = (content: string, style = 'Kherve_Header_Footer') =>
  `<text:p text:style-name="${style}">${content}</text:p>`;
const ODT_PAGE_NUMBER = '<text:page-number text:select-page="current"/>';

/** Rewrites styles.xml with the page size, margins, header and footer. */
export const applyOdtPageSetup = (stylesXml: string, setup: PageSetup) => {
  const { width, height } = pageDimensions(setup);
  const { top, bottom, left, right } = setup.margins;
  const setAttribute = (xml: string, name: string, value: string) =>
    xml.replace(new RegExp(`${name}="[^"]*"`), `${name}="${value}"`);

  // The page layout used by the "Standard" master page (not the default one).
  const pageLayout =
    /(<style:page-layout style:name="Mpm1">\s*)(<style:page-layout-properties\b[^>]*>)/;
  let xml = stylesXml.replace(
    pageLayout,
    (_match, opening: string, tag: string) =>
      opening +
      [
        ['fo:page-width', `${width}cm`],
        ['fo:page-height', `${height}cm`],
        ['style:print-orientation', setup.orientation],
        ['fo:margin-top', `${top}cm`],
        ['fo:margin-bottom', `${bottom}cm`],
        ['fo:margin-left', `${left}cm`],
        ['fo:margin-right', `${right}cm`],
      ].reduce((acc, [name, value]) => setAttribute(acc, name, value), tag),
  );

  const header = [
    setup.header && odtParagraph(xmlEscape(setup.header)),
    setup.pageNumbers === 'top-right' &&
      odtParagraph(ODT_PAGE_NUMBER, 'Kherve_Header_Footer_Right'),
  ].filter(Boolean);
  const footer = [
    setup.footer && odtParagraph(xmlEscape(setup.footer)),
    setup.pageNumbers === 'bottom-center' &&
      odtParagraph(ODT_PAGE_NUMBER, 'Kherve_Header_Footer_Center'),
    setup.pageNumbers === 'bottom-right' &&
      odtParagraph(ODT_PAGE_NUMBER, 'Kherve_Header_Footer_Right'),
  ].filter(Boolean);

  xml = xml.replace(
    '</office:styles>',
    `${ODT_PARAGRAPH_STYLES}</office:styles>`,
  );
  xml = xml.replace(
    /<style:master-page style:name="Standard"([^>]*?)\/>/,
    (_match, attributes: string) =>
      `<style:master-page style:name="Standard"${attributes}>` +
      (header.length ? `<style:header>${header.join('')}</style:header>` : '') +
      (footer.length ? `<style:footer>${footer.join('')}</style:footer>` : '') +
      '</style:master-page>',
  );
  return xml;
};

/** ODF needs `mimetype` stored first and uncompressed, so the zip is rebuilt. */
export const odtWithPageSetup = async (odt: Blob, setup: PageSetup) => {
  const source = await JSZip.loadAsync(await odt.arrayBuffer());
  const target = new JSZip();
  target.file('mimetype', 'application/vnd.oasis.opendocument.text', {
    compression: 'STORE',
  });
  for (const [name, entry] of Object.entries(source.files)) {
    if (name === 'mimetype' || entry.dir) {
      continue;
    }
    if (name === 'styles.xml') {
      target.file(name, applyOdtPageSetup(await entry.async('string'), setup));
    } else {
      target.file(name, await entry.async('uint8array'));
    }
  }
  return target.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.oasis.opendocument.text',
    compression: 'DEFLATE',
  });
};
