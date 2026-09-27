/**
 * A presentation bound to its shared Yjs document (see types.ts): what the
 * editor reads, and every change it makes, as one undoable step each.
 */
import * as Y from 'yjs';

import { LayoutId, NewElement, layoutElements } from './layouts';
import { Theme, themeById } from './themes';
import {
  DECK,
  ELEMENTS,
  PlacedElement,
  SLIDES,
  Slide,
  SlideElement,
  SlideMeta,
  newId,
  parseJson,
} from './types';

/** Transactions made by this window (undoable by this user). */
export const LOCAL_ORIGIN = 'kherve-slides-local';

export interface ImportedSlide {
  background?: string;
  notes?: string;
  elements: NewElement[];
}

export class SlideDeck {
  readonly ydoc: Y.Doc;
  readonly ySlides: Y.Map<string>;
  readonly yElements: Y.Map<string>;
  readonly yDeck: Y.Map<string>;
  readonly undoManager: Y.UndoManager;
  private version = 0;
  private listeners = new Set<() => void>();

  constructor(ydoc: Y.Doc) {
    this.ydoc = ydoc;
    this.ySlides = ydoc.getMap<string>(SLIDES);
    this.yElements = ydoc.getMap<string>(ELEMENTS);
    this.yDeck = ydoc.getMap<string>(DECK);
    this.undoManager = new Y.UndoManager(
      [this.ySlides, this.yElements, this.yDeck],
      { trackedOrigins: new Set([LOCAL_ORIGIN]), captureTimeout: 400 },
    );
    this.ySlides.observe(this.changed);
    this.yElements.observe(this.changed);
    this.yDeck.observe(this.changed);
    this.undoManager.on('stack-item-added', this.changed);
    this.undoManager.on('stack-item-popped', this.changed);
  }

  dispose() {
    this.ySlides.unobserve(this.changed);
    this.yElements.unobserve(this.changed);
    this.yDeck.unobserve(this.changed);
    this.undoManager.destroy();
    this.listeners.clear();
  }

  // ── Change notifications (useSyncExternalStore) ──────────────────
  private changed = () => {
    this.version += 1;
    this.listeners.forEach((listener) => listener());
  };

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getVersion = () => this.version;

  private transact(fn: () => void) {
    this.ydoc.transact(fn, LOCAL_ORIGIN);
  }

  /** Ends the current undo step, so the next change is a step of its own. */
  stopCapturing() {
    this.undoManager.stopCapturing();
  }

  undo() {
    this.undoManager.undo();
  }

  redo() {
    this.undoManager.redo();
  }

  // ── Reading ──────────────────────────────────────────────────────
  slides(): Slide[] {
    const list: Slide[] = [];
    this.ySlides.forEach((raw, id) => {
      const meta = parseJson<SlideMeta>(raw);
      if (meta) {
        list.push({ id, meta });
      }
    });
    return list.sort(
      (a, b) => a.meta.order - b.meta.order || a.id.localeCompare(b.id),
    );
  }

  slide(id: string): SlideMeta | undefined {
    return parseJson<SlideMeta>(this.ySlides.get(id));
  }

  elements(slideId: string): PlacedElement[] {
    const list: PlacedElement[] = [];
    this.yElements.forEach((raw, id) => {
      const el = parseJson<SlideElement>(raw);
      if (el && el.slide === slideId) {
        list.push({ id, el });
      }
    });
    return list.sort((a, b) => a.el.z - b.el.z || a.id.localeCompare(b.id));
  }

  element(id: string): SlideElement | undefined {
    return parseJson<SlideElement>(this.yElements.get(id));
  }

  theme(): Theme {
    return themeById(this.yDeck.get('theme'));
  }

  isEmpty() {
    return this.ySlides.size === 0;
  }

  // ── Slides ───────────────────────────────────────────────────────
  private putElements(slideId: string, elements: NewElement[], z0 = 0) {
    elements.forEach((el, i) => {
      this.yElements.set(
        newId(),
        JSON.stringify({ ...el, slide: slideId, z: z0 + i }),
      );
    });
  }

  /** Renumber the slides in *ids* order. */
  private reorder(ids: string[]) {
    ids.forEach((id, order) => {
      const meta = this.slide(id);
      if (meta && meta.order !== order) {
        this.ySlides.set(id, JSON.stringify({ ...meta, order }));
      }
    });
  }

  /** A new slide after *afterId* (else at the end); returns its id. */
  addSlide(layout: LayoutId, afterId?: string): string {
    const id = newId();
    this.transact(() => {
      const ids = this.slides().map((s) => s.id);
      const at = afterId ? ids.indexOf(afterId) + 1 : ids.length;
      ids.splice(at > 0 ? at : ids.length, 0, id);
      this.ySlides.set(id, JSON.stringify({ order: ids.indexOf(id) }));
      this.reorder(ids);
      this.putElements(id, layoutElements(layout));
    });
    return id;
  }

  /** The first slide of a brand-new presentation. */
  ensureFirstSlide() {
    if (this.isEmpty()) {
      this.ydoc.transact(() => {
        const id = newId();
        this.ySlides.set(id, JSON.stringify({ order: 0 }));
        this.putElements(id, layoutElements('title'));
      });
    }
  }

  duplicateSlide(id: string): string | undefined {
    const meta = this.slide(id);
    if (!meta) {
      return undefined;
    }
    const copy = newId();
    this.transact(() => {
      const ids = this.slides().map((s) => s.id);
      ids.splice(ids.indexOf(id) + 1, 0, copy);
      this.ySlides.set(copy, JSON.stringify({ ...meta }));
      this.reorder(ids);
      this.elements(id).forEach(({ el }) => {
        this.yElements.set(newId(), JSON.stringify({ ...el, slide: copy }));
      });
    });
    return copy;
  }

  removeSlide(id: string) {
    this.transact(() => {
      this.elements(id).forEach(({ id: elId }) => this.yElements.delete(elId));
      this.ySlides.delete(id);
      this.reorder(this.slides().map((s) => s.id));
    });
  }

  /** Move a slide to position *index*. */
  moveSlide(id: string, index: number) {
    const ids = this.slides().map((s) => s.id);
    const from = ids.indexOf(id);
    if (from < 0) {
      return;
    }
    ids.splice(from, 1);
    ids.splice(Math.max(0, Math.min(index, ids.length)), 0, id);
    this.transact(() => this.reorder(ids));
  }

  setSlide(id: string, patch: Partial<SlideMeta>) {
    const meta = this.slide(id);
    if (meta) {
      this.transact(() =>
        this.ySlides.set(id, JSON.stringify({ ...meta, ...patch })),
      );
    }
  }

  setTheme(themeId: string) {
    this.transact(() => this.yDeck.set('theme', themeId));
  }

  // ── Boxes on a slide ─────────────────────────────────────────────
  addElement(slideId: string, el: NewElement): string {
    const id = newId();
    const top = Math.max(-1, ...this.elements(slideId).map((e) => e.el.z));
    this.transact(() =>
      this.yElements.set(
        id,
        JSON.stringify({ ...el, slide: slideId, z: top + 1 }),
      ),
    );
    return id;
  }

  updateElement(id: string, patch: Partial<SlideElement>) {
    const el = this.element(id);
    if (el) {
      this.transact(() =>
        this.yElements.set(id, JSON.stringify({ ...el, ...patch })),
      );
    }
  }

  /** Several boxes changed at once (one undo step). */
  updateElements(patches: [string, Partial<SlideElement>][]) {
    this.transact(() => {
      for (const [id, patch] of patches) {
        const el = this.element(id);
        if (el) {
          this.yElements.set(id, JSON.stringify({ ...el, ...patch }));
        }
      }
    });
  }

  removeElements(ids: string[]) {
    this.transact(() => ids.forEach((id) => this.yElements.delete(id)));
  }

  /** Bring a box to the front (or send it to the back). */
  restack(id: string, toFront: boolean) {
    const el = this.element(id);
    if (!el) {
      return;
    }
    const zs = this.elements(el.slide).map((e) => e.el.z);
    const z = toFront ? Math.max(...zs) + 1 : Math.min(...zs) - 1;
    this.updateElement(id, { z });
  }

  // ── Importing ────────────────────────────────────────────────────
  /**
   * Add imported slides (from PowerPoint). A presentation that still holds
   * only its untouched first slide is replaced. Returns the first new id.
   */
  importSlides(slides: ImportedSlide[], themeId?: string): string | undefined {
    const existing = this.slides();
    const pristine =
      existing.length === 1 &&
      this.elements(existing[0].id).every(
        ({ el }) =>
          !el.text ||
          el.text === 'Click to add a title' ||
          el.text === 'Click to add a subtitle',
      );
    let first: string | undefined;
    this.transact(() => {
      if (pristine) {
        this.elements(existing[0].id).forEach(({ id }) =>
          this.yElements.delete(id),
        );
        this.ySlides.delete(existing[0].id);
      }
      let order = pristine
        ? 0
        : Math.max(-1, ...existing.map((s) => s.meta.order)) + 1;
      for (const slide of slides) {
        const id = newId();
        first ??= id;
        const meta: SlideMeta = { order: order++ };
        if (slide.background) {
          meta.background = slide.background;
        }
        if (slide.notes) {
          meta.notes = slide.notes;
        }
        this.ySlides.set(id, JSON.stringify(meta));
        this.putElements(id, slide.elements);
      }
      if (themeId) {
        this.yDeck.set('theme', themeId);
      }
    });
    return first;
  }
}
