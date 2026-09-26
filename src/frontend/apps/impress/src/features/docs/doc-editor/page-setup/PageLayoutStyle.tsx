import { useEffect } from 'react';
import { createGlobalStyle } from 'styled-components';

import { printDocumentWithStyles } from '@/docs/doc-export/utils_print';

import { printPageCss, screenPageCss } from './pageCss';
import { PAPER_SIZES, PageSetup } from './pageSetup';
import { usePageSetup } from './usePageSetup';

export const PageLayoutStyle = createGlobalStyle<{ $setup: PageSetup }>`
  ${({ $setup }) => screenPageCss($setup)}
`;

declare global {
  interface Window {
    /** Read by the KherveDOC desktop app to set up its printer. */
    __khervePageSetup?: {
      paperWidthCm: number;
      paperHeightCm: number;
      orientation: PageSetup['orientation'];
      marginsCm: PageSetup['margins'];
    };
  }
}

const PRINT_STYLE_ID = 'kherve-page-setup-print';
const PRINT_CLEANUP_FALLBACK_MS = 60_000;

/** Prints with the document's paper size, margins, header, footer and page numbers. */
export const printWithPageSetup = (setup: PageSetup) => {
  document.getElementById(PRINT_STYLE_ID)?.remove();
  window.__khervePageSetup = {
    paperWidthCm: PAPER_SIZES[setup.paperSize].width,
    paperHeightCm: PAPER_SIZES[setup.paperSize].height,
    orientation: setup.orientation,
    marginsCm: setup.margins,
  };
  // DocS appends its own print styles synchronously; ours go after to win.
  printDocumentWithStyles();
  const style = document.createElement('style');
  style.id = PRINT_STYLE_ID;
  style.textContent = printPageCss(setup);
  document.head.appendChild(style);

  const cleanup = () => style.remove();
  window.addEventListener('afterprint', cleanup, { once: true });
  setTimeout(cleanup, PRINT_CLEANUP_FALLBACK_MS);
};

/** Draws the open document as a page, and prints it with Cmd/Ctrl+P. */
export const DocPageLayout = () => {
  const { setup } = usePageSetup();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        printWithPageSetup(setup);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setup]);

  return <PageLayoutStyle $setup={setup} />;
};
