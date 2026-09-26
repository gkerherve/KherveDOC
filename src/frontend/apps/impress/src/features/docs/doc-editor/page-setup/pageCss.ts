import { CM_TO_PX, PageSetup, pageDimensions } from './pageSetup';

/** A CSS string literal; header/footer text comes from collaborators. */
export const cssString = (text: string) =>
  `"${text.replace(/[\\"]/g, '\\$&').replace(/[\r\n]+/g, ' ')}"`;

const px = (cm: number) => `${(cm * CM_TO_PX).toFixed(2)}px`;

/** The editing area drawn as a sheet of paper with the document's margins. */
export const screenPageCss = (setup: PageSetup) => {
  if (!setup.showPage) {
    return '';
  }
  const { width, height } = pageDimensions(setup);
  const { top, bottom, left, right } = setup.margins;

  return `
    @media screen {
      #mainContent {
        background: var(--c--contextuals--background--surface--tertiary, #eceef2);
      }
      .--docs--doc-editor {
        box-sizing: border-box;
        /* Grow with the pages instead of filling the window. */
        flex: 0 0 auto !important;
        height: auto !important;
        width: min(${px(width)}, calc(100% - 32px)) !important;
        max-width: none !important;
        margin: 16px auto 64px !important;
        --kherve-notes-inline: ${px(left)} ${px(right)};
      }
      /* Title, owner and last update sit above the paper, not on it. */
      .--docs--doc-editor .--docs--doc-editor-header {
        padding: 0 ${px(left)} 12px !important;
      }
      .--docs--doc-editor .--docs--doc-editor-content {
        position: relative;
        box-sizing: border-box;
        min-height: ${px(height)};
        padding: ${px(top)} 0
          calc(${px(bottom)} + var(--kherve-last-page-fill, 0px)) !important;
        background: var(--c--contextuals--background--surface--primary);
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12), 0 6px 20px rgba(0, 0, 0, 0.06);
      }
      .--docs--doc-editor .--docs--editor-container {
        padding: 0 !important;
      }
      .--docs--doc-editor .bn-editor {
        padding-left: ${px(left)} !important;
        padding-right: ${px(right)} !important;
      }
      .--docs--doc-editor .kherve-page-head,
      .--docs--doc-editor .kherve-page-foot {
        display: flex;
        align-items: center;
        gap: 12px;
        box-sizing: border-box;
        font-size: 11px;
        color: var(--c--contextuals--content--semantic--neutral--tertiary);
        white-space: nowrap;
        overflow: hidden;
        pointer-events: none;
        user-select: none;
      }
      .--docs--doc-editor .kherve-page-head > span:first-child,
      .--docs--doc-editor .kherve-page-foot > span:first-child {
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .--docs--doc-editor .kherve-page-number--bottom-right,
      .--docs--doc-editor .kherve-page-number--top-right {
        margin-left: auto;
      }
      .--docs--doc-editor .kherve-page-number--bottom-center {
        position: absolute;
        left: 50%;
        transform: translateX(-50%);
      }
      .--docs--doc-editor .kherve-page-foot {
        position: relative;
      }
      .--docs--doc-editor .kherve-sheet-head,
      .--docs--doc-editor .kherve-sheet-foot {
        position: absolute;
        left: 0;
        right: 0;
      }
      .--docs--doc-editor .kherve-sheet-head {
        top: 0;
      }
      .--docs--doc-editor .kherve-sheet-foot {
        bottom: 0;
      }
      .--docs--doc-editor .kherve-page-gap {
        user-select: none;
      }
      .--docs--doc-editor .kherve-page-band {
        background: var(--c--contextuals--background--surface--tertiary, #eceef2);
        box-shadow:
          inset 0 6px 6px -6px rgba(0, 0, 0, 0.18),
          inset 0 -6px 6px -6px rgba(0, 0, 0, 0.12);
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
      .kherve-page-gap,
      .kherve-sheet-head,
      .kherve-sheet-foot {
        display: none !important;
      }
      .--docs--doc-editor .bn-editor {
        padding-left: 0 !important;
        padding-right: 0 !important;
      }
    }
  `;
};
