/**
 * A note's handwriting: pen and highlighter strokes drawn over its text,
 * kept in the note's shared Yjs document beside the text (one JSON stroke
 * per map entry, so collaborators draw at the same time without clashing).
 *
 * Points are in page units: the page is PAGE_WIDTH wide whatever the
 * screen, so a drawing stays on the words it was drawn over.
 */
import * as Y from 'yjs';

export const INK = 'note-ink';
export const PAGE_WIDTH = 800;

/** Transactions made by this window (undoable by this user). */
export const LOCAL_ORIGIN = 'sov-notes-local';

export type InkTool = 'pen' | 'highlighter';

export interface Stroke {
  id: string;
  tool: InkTool;
  color: string;
  width: number;
  /** x, y pairs in page units. */
  points: number[];
  /** When it was drawn: later strokes draw on top. */
  at: number;
}

const newId = () =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const parse = (json: string): Stroke | undefined => {
  try {
    const stroke = JSON.parse(json) as Stroke;
    return Array.isArray(stroke.points) ? stroke : undefined;
  } catch {
    return undefined;
  }
};

export class NoteInk {
  readonly ydoc: Y.Doc;
  readonly yInk: Y.Map<string>;
  readonly undoManager: Y.UndoManager;
  private version = 0;
  private cache?: Stroke[];
  private listeners = new Set<() => void>();

  constructor(ydoc: Y.Doc) {
    this.ydoc = ydoc;
    this.yInk = ydoc.getMap<string>(INK);
    this.undoManager = new Y.UndoManager(this.yInk, {
      trackedOrigins: new Set([LOCAL_ORIGIN]),
      captureTimeout: 0,
    });
    this.yInk.observe(this.changed);
    this.undoManager.on('stack-item-added', this.changed);
    this.undoManager.on('stack-item-popped', this.changed);
  }

  dispose() {
    this.yInk.unobserve(this.changed);
    this.undoManager.destroy();
    this.listeners.clear();
  }

  private changed = () => {
    this.cache = undefined;
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

  /** Every stroke, highlighters first (under the pen), oldest first. */
  strokes(): Stroke[] {
    if (!this.cache) {
      const list: Stroke[] = [];
      this.yInk.forEach((json) => {
        const stroke = parse(json);
        if (stroke) {
          list.push(stroke);
        }
      });
      list.sort(
        (a, b) =>
          Number(a.tool !== 'highlighter') - Number(b.tool !== 'highlighter') ||
          a.at - b.at,
      );
      this.cache = list;
    }
    return this.cache;
  }

  /** How far down the page the drawing goes (page units). */
  bottom(): number {
    let bottom = 0;
    for (const stroke of this.strokes()) {
      for (let i = 1; i < stroke.points.length; i += 2) {
        bottom = Math.max(bottom, stroke.points[i]);
      }
    }
    return bottom;
  }

  add(stroke: Omit<Stroke, 'id' | 'at'>): string {
    const id = newId();
    this.ydoc.transact(() => {
      this.yInk.set(id, JSON.stringify({ ...stroke, id, at: Date.now() }));
    }, LOCAL_ORIGIN);
    return id;
  }

  remove(ids: string[]) {
    if (ids.length) {
      this.ydoc.transact(() => {
        ids.forEach((id) => this.yInk.delete(id));
      }, LOCAL_ORIGIN);
    }
  }

  clear() {
    this.remove(Array.from(this.yInk.keys()));
  }

  undo() {
    this.undoManager.undo();
  }

  redo() {
    this.undoManager.redo();
  }

  canUndo() {
    return this.undoManager.canUndo();
  }

  canRedo() {
    return this.undoManager.canRedo();
  }
}

const round = (n: number) => Math.round(n * 10) / 10;

/** A smooth SVG path through the points (quadratic curves between
 * midpoints), or a dot for a single point. */
export const strokePath = (points: number[]): string => {
  const n = points.length / 2;
  if (n === 0) {
    return '';
  }
  const x = (i: number) => round(points[2 * i]);
  const y = (i: number) => round(points[2 * i + 1]);
  if (n === 1) {
    return `M${x(0)} ${y(0)}l0.01 0`;
  }
  let d = `M${x(0)} ${y(0)}`;
  for (let i = 1; i < n - 1; i++) {
    const mx = round((points[2 * i] + points[2 * i + 2]) / 2);
    const my = round((points[2 * i + 1] + points[2 * i + 3]) / 2);
    d += `Q${x(i)} ${y(i)} ${mx} ${my}`;
  }
  return d + `L${x(n - 1)} ${y(n - 1)}`;
};

const segmentDistance = (
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
) => {
  const dx = bx - ax;
  const dy = by - ay;
  const length = dx * dx + dy * dy;
  const t =
    length === 0
      ? 0
      : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

/** Whether an eraser of this radius at (x, y) touches the stroke. */
export const hitsStroke = (
  stroke: Stroke,
  x: number,
  y: number,
  radius: number,
): boolean => {
  const p = stroke.points;
  const reach = radius + stroke.width / 2;
  if (p.length === 2) {
    return Math.hypot(x - p[0], y - p[1]) <= reach;
  }
  for (let i = 0; i + 3 < p.length; i += 2) {
    if (segmentDistance(x, y, p[i], p[i + 1], p[i + 2], p[i + 3]) <= reach) {
      return true;
    }
  }
  return false;
};
