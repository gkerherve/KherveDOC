import { CM_TO_PX, PageSetup, pageDimensions } from './pageSetup';

/** A CSS string literal; header/footer text comes from collaborators. */
export const cssString = (text: string) =>
  `"${text.replace(/[\\"]/g, '\\$&').replace(/[\r\n]+/g, ' ')}"`;

const px = (cm: number) => `${Math.round(cm * CM_TO_PX)}px`;

/** The editing area drawn as a sheet of paper with the document's margins. */
export const screenPageCss = (setup: PageSetup) => {
  if (!setup.showPage) {
    return '';
  }
  const { width, height } = pageDimensions(setup);
  const { top, bottom, left, right } = setup.margins;
  const marginLabel = `
    position: absolute;
    left: ${px(left)};
    right: ${px(right)};
    font-size: 11px;
    color: var(--c--contextuals--content--semantic--neutral--tertiary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    pointer-events: none;
  `;

  return `
    @media screen {
      #mainContent {
        background: var(--c--contextuals--background--surface--tertiary, #eceef2);
      }
      .--docs--doc-editor {
        position: relative;
        box-sizing: border-box;
        width: min(${px(width)}, calc(100% - 32px)) !important;
        max-width: none !important;
        min-height: ${px(height)};
        margin: 24px auto 64px !important;
        padding: ${px(top)} 0 ${px(bottom)} !important;
        background: var(--c--contextuals--background--surface--primary);
        --kherve-notes-inline: ${px(left)} ${px(right)};
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12), 0 6px 20px rgba(0, 0, 0, 0.06);
      }
      .--docs--doc-editor .--docs--doc-editor-header {
        padding-left: ${px(left)} !important;
        padding-right: ${px(right)} !important;
      }
      .--docs--doc-editor .bn-editor {
        padding-left: ${px(left)} !important;
        padding-right: ${px(right)} !important;
      }
      .--docs--doc-editor::before {
        content: ${cssString(setup.header)};
        top: ${px(Math.max(top / 2 - 0.2, 0.2))};
        ${marginLabel}
      }
      .--docs--doc-editor::after {
        content: ${cssString(setup.footer)};
        bottom: ${px(Math.max(bottom / 2 - 0.2, 0.2))};
        ${marginLabel}
      }
    }
  `;
};

const PAGE_NUMBER_BOX = {
  'bottom-center': '@bottom-center',
  'bottom-right': '@bottom-right',
  'top-right': '@top-right',
} as const;

/** Paper size, margins, header, footer and page numbers for printing. */
export const printPageCss = (setup: PageSetup) => {
  const { width, height } = pageDimensions(setup);
  const { top, bottom, left, right } = setup.margins;
  const box = (content: string) =>
    `{ content: ${content}; font-size: 9pt; color: #555; }`;

  return `
    @media print {
      @page {
        size: ${width}cm ${height}cm;
        margin: ${top}cm ${right}cm ${bottom}cm ${left}cm;
        ${setup.header ? `@top-left ${box(cssString(setup.header))}` : ''}
        ${setup.footer ? `@bottom-left ${box(cssString(setup.footer))}` : ''}
        ${
          setup.pageNumbers !== 'none'
            ? `${PAGE_NUMBER_BOX[setup.pageNumbers]} ${box('counter(page)')}`
            : ''
        }
      }
      .--docs--doc-top,
      .--docs--kherve-toolbar {
        display: none !important;
      }
      .--docs--doc-editor::before,
      .--docs--doc-editor::after {
        display: none !important;
      }
      .--docs--doc-editor .bn-editor {
        padding-left: 0 !important;
        padding-right: 0 !important;
      }
    }
  `;
};
