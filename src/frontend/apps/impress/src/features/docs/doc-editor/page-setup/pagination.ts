import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet, EditorView } from '@tiptap/pm/view';

import { CM_TO_PX, PageSetup, pageDimensions } from './pageSetup';

/**
 * Shows the continuous document as pages while editing: measures where each
 * page fills up and inserts a view-only gap (end of one sheet, the grey space
 * between sheets, top of the next) before the first top-level block that
 * does not fit. Nothing is written to the document.
 */

const GAP_PX = 24;
const MEASURE_DELAY_MS = 120;
const REFRESH = 'khervePaginationRefresh';

interface PageBreak {
  blockId: string;
  /** Blank space left at the bottom of the page that ends here. */
  remaining: number;
  /** Number of the page that ends at this break. */
  page: number;
}

interface PaginationState {
  decorations: DecorationSet;
  version: number;
}

const paginationKey = new PluginKey<PaginationState>('khervePagination');

// Unrounded, like the page CSS, so page positions do not drift.
const px = (cm: number) => cm * CM_TO_PX;

const pageNumberText = (setup: PageSetup, page: number) =>
  setup.pageNumbers === 'none' ? '' : `${page}`;

/** The header or footer strip of a page: text on the left, number aligned. */
const marginStrip = (
  setup: PageSetup,
  kind: 'head' | 'foot',
  page: number,
  heightPx: number,
) => {
  const strip = document.createElement('div');
  strip.className = `kherve-page-${kind}`;
  strip.style.height = `${heightPx}px`;
  strip.style.paddingLeft = `${px(setup.margins.left)}px`;
  strip.style.paddingRight = `${px(setup.margins.right)}px`;

  const text = document.createElement('span');
  text.textContent = kind === 'head' ? setup.header : setup.footer;
  strip.appendChild(text);

  const numberHere =
    kind === 'head'
      ? setup.pageNumbers === 'top-right'
      : setup.pageNumbers === 'bottom-center' ||
        setup.pageNumbers === 'bottom-right';
  if (numberHere) {
    const number = document.createElement('span');
    number.className = `kherve-page-number kherve-page-number--${setup.pageNumbers}`;
    number.textContent = pageNumberText(setup, page);
    strip.appendChild(number);
  }
  return strip;
};

const gapWidget = (setup: PageSetup, pageBreak: PageBreak) => {
  const gap = document.createElement('div');
  gap.className = 'kherve-page-gap';
  gap.contentEditable = 'false';
  gap.setAttribute('aria-hidden', 'true');
  gap.style.marginLeft = `-${px(setup.margins.left)}px`;
  gap.style.marginRight = `-${px(setup.margins.right)}px`;

  const blank = document.createElement('div');
  blank.style.height = `${Math.max(0, pageBreak.remaining)}px`;
  const band = document.createElement('div');
  band.className = 'kherve-page-band';
  band.style.height = `${GAP_PX}px`;

  gap.append(
    blank,
    marginStrip(setup, 'foot', pageBreak.page, px(setup.margins.bottom)),
    band,
    marginStrip(setup, 'head', pageBreak.page + 1, px(setup.margins.top)),
  );
  return gap;
};

/** Top-level block positions in the document, by block id. */
const blockPositions = (view: EditorView) => {
  const positions = new Map<string, number>();
  const group = view.state.doc.firstChild;
  if (!group) {
    return positions;
  }
  group.forEach((node, offset) => {
    const id = node.attrs.id as string | undefined;
    if (id) {
      // Offsets count from the start of the root block group's content (1),
      // so this is the position just before the block: a sibling widget.
      positions.set(id, offset + 1);
    }
  });
  return positions;
};

/** Where pages end, using layout without the gaps already shown. */
const computeBreaks = (
  view: EditorView,
  setup: PageSetup,
  sheet: HTMLElement,
) => {
  const group = view.dom.querySelector<HTMLElement>(':scope > .bn-block-group');
  if (!group) {
    return { breaks: [] as PageBreak[], pages: 1, contentEnd: 0, pageEnd: 0 };
  }
  const { height } = pageDimensions(setup);
  const pageContent = px(height - setup.margins.top - setup.margins.bottom);
  const origin = sheet.getBoundingClientRect().top + px(setup.margins.top);

  const breaks: PageBreak[] = [];
  let shift = 0;
  let page = 1;
  let pageEnd = pageContent;
  let pageHasContent = false;
  let forceBreak = false;
  let contentEnd = 0;

  for (const child of Array.from(group.children) as HTMLElement[]) {
    if (child.classList.contains('kherve-page-gap')) {
      shift += child.getBoundingClientRect().height;
      continue;
    }
    if (!child.classList.contains('bn-block-outer')) {
      continue;
    }
    const rect = child.getBoundingClientRect();
    const top = rect.top - origin - shift;
    const bottom = rect.bottom - origin - shift;
    const blockId = child.getAttribute('data-id') ?? '';

    if (pageHasContent && (forceBreak || bottom > pageEnd)) {
      breaks.push({ blockId, remaining: Math.max(0, pageEnd - top), page });
      page += 1;
      pageEnd = top + pageContent;
    }
    forceBreak = false;
    pageHasContent = true;

    // A block taller than a page cannot be split: let it run over.
    while (bottom > pageEnd) {
      pageEnd += pageContent;
      page += 1;
    }
    if (
      child.querySelector(
        ':scope > .bn-block > .bn-block-content[data-content-type="pageBreak"]',
      )
    ) {
      forceBreak = true;
    }
    contentEnd = bottom;
  }

  return { breaks, pages: page, contentEnd, pageEnd };
};

export interface PaginationOptions {
  getSetup: () => PageSetup | undefined;
}

export const KhervePagination = Extension.create<PaginationOptions>({
  name: 'khervePagination',

  addOptions() {
    return { getSetup: () => undefined };
  },

  addProseMirrorPlugins() {
    const { getSetup } = this.options;

    return [
      new Plugin<PaginationState>({
        key: paginationKey,
        state: {
          init: () => ({ decorations: DecorationSet.empty, version: 0 }),
          apply: (tr, value) => {
            const next = tr.getMeta(paginationKey) as DecorationSet | undefined;
            if (next) {
              return { ...value, decorations: next };
            }
            return {
              decorations: value.decorations.map(tr.mapping, tr.doc),
              version: value.version + (tr.getMeta(REFRESH) ? 1 : 0),
            };
          },
        },
        props: {
          decorations: (state) => paginationKey.getState(state)?.decorations,
        },
        view: (view) => {
          let timer: ReturnType<typeof setTimeout> | undefined;
          let lastKey = '';
          let lastVersion = 0;
          let sheetDecorations: HTMLElement[] = [];

          const clearSheet = (sheet: HTMLElement | null) => {
            sheetDecorations.forEach((element) => element.remove());
            sheetDecorations = [];
            sheet?.style.removeProperty('--kherve-last-page-fill');
          };

          const measure = () => {
            if (view.isDestroyed) {
              return;
            }
            const setup = getSetup();
            const sheet = view.dom.closest<HTMLElement>(
              '.--docs--doc-editor-content',
            );
            if (!setup?.showPage || !sheet) {
              clearSheet(sheet);
              if (lastKey) {
                lastKey = '';
                view.dispatch(
                  view.state.tr
                    .setMeta(paginationKey, DecorationSet.empty)
                    .setMeta('addToHistory', false),
                );
              }
              return;
            }

            const { breaks, pages, contentEnd, pageEnd } = computeBreaks(
              view,
              setup,
              sheet,
            );

            // Fill the last sheet down to its bottom margin, and label it.
            clearSheet(sheet);
            sheet.style.setProperty(
              '--kherve-last-page-fill',
              `${Math.max(0, pageEnd - contentEnd)}px`,
            );
            const head = marginStrip(setup, 'head', 1, px(setup.margins.top));
            head.classList.add('kherve-sheet-head');
            const foot = marginStrip(
              setup,
              'foot',
              pages,
              px(setup.margins.bottom),
            );
            foot.classList.add('kherve-sheet-foot');
            sheet.append(head, foot);
            sheetDecorations = [head, foot];

            const key = JSON.stringify([breaks, setup]);
            if (key === lastKey) {
              return;
            }
            lastKey = key;
            const positions = blockPositions(view);
            const decorations = breaks.flatMap((pageBreak) => {
              const pos = positions.get(pageBreak.blockId);
              return pos === undefined
                ? []
                : [
                    Decoration.widget(pos, () => gapWidget(setup, pageBreak), {
                      side: -1,
                      key: `page-gap-${pageBreak.page}-${Math.round(pageBreak.remaining)}`,
                      ignoreSelection: true,
                    }),
                  ];
            });
            view.dispatch(
              view.state.tr
                .setMeta(
                  paginationKey,
                  DecorationSet.create(view.state.doc, decorations),
                )
                .setMeta('addToHistory', false),
            );
          };

          const schedule = () => {
            clearTimeout(timer);
            timer = setTimeout(measure, MEASURE_DELAY_MS);
          };

          // Images and embeds change height after loading.
          const observer = new ResizeObserver(schedule);
          observer.observe(view.dom);
          window.addEventListener('resize', schedule);
          schedule();

          return {
            update: (updated, previous) => {
              const version =
                paginationKey.getState(updated.state)?.version ?? 0;
              if (
                updated.state.doc !== previous.doc ||
                version !== lastVersion
              ) {
                lastVersion = version;
                schedule();
              }
            },
            destroy: () => {
              clearTimeout(timer);
              observer.disconnect();
              window.removeEventListener('resize', schedule);
              clearSheet(
                view.dom.closest<HTMLElement>('.--docs--doc-editor-content'),
              );
            },
          };
        },
      }),
    ];
  },
});

/** Re-paginates after the page setup changed. */
export const refreshPagination = (view?: EditorView) => {
  if (view && !view.isDestroyed) {
    view.dispatch(
      view.state.tr.setMeta(REFRESH, true).setMeta('addToHistory', false),
    );
  }
};
