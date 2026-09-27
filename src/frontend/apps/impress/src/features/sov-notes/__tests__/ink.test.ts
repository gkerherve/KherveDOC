import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { NoteInk, hitsStroke, strokePath } from '../model/ink';

const pen = (points: number[]) => ({
  tool: 'pen' as const,
  color: '#000',
  width: 2,
  points,
});

describe('NoteInk', () => {
  it('keeps strokes in the shared document, highlighters underneath', () => {
    const ydoc = new Y.Doc();
    const ink = new NoteInk(ydoc);
    ink.add(pen([0, 0, 10, 10]));
    ink.add({ ...pen([5, 5, 50, 300]), tool: 'highlighter' });

    const other = new NoteInk(ydoc);
    expect(other.strokes().map((s) => s.tool)).toEqual(['highlighter', 'pen']);
    expect(other.bottom()).toBe(300);
  });

  it('undoes and redoes this window’s drawing', () => {
    const ink = new NoteInk(new Y.Doc());
    const id = ink.add(pen([0, 0, 10, 10]));
    ink.remove([id]);
    expect(ink.strokes()).toHaveLength(0);
    ink.undo();
    expect(ink.strokes()).toHaveLength(1);
    ink.undo();
    expect(ink.strokes()).toHaveLength(0);
    ink.redo();
    expect(ink.canUndo()).toBe(true);
  });

  it('clears everything', () => {
    const ink = new NoteInk(new Y.Doc());
    ink.add(pen([0, 0]));
    ink.add(pen([1, 1]));
    ink.clear();
    expect(ink.strokes()).toHaveLength(0);
  });
});

describe('geometry', () => {
  it('draws a dot, then smooth curves', () => {
    expect(strokePath([3, 4])).toBe('M3 4l0.01 0');
    expect(strokePath([0, 0, 10, 0, 20, 10])).toBe('M0 0Q10 0 15 5L20 10');
  });

  it('erases only what the eraser touches', () => {
    const stroke = { ...pen([0, 0, 100, 0]), id: 'a', at: 0 };
    expect(hitsStroke(stroke, 50, 5, 5)).toBe(true);
    expect(hitsStroke(stroke, 50, 20, 5)).toBe(false);
  });
});
