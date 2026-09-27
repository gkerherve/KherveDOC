import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { SlideDeck } from '../model/deck';
import { readPptx, writePptx } from '../model/pptx';

const texts = (deck: SlideDeck, slideId: string) =>
  deck.elements(slideId).map(({ el }) => el.text);

describe('SlideDeck', () => {
  it('starts with a title slide, adds, duplicates, moves and removes', () => {
    const deck = new SlideDeck(new Y.Doc());
    deck.ensureFirstSlide();
    const [first] = deck.slides();
    expect(texts(deck, first.id)).toEqual([
      'Click to add a title',
      'Click to add a subtitle',
    ]);

    const second = deck.addSlide('content', first.id);
    const copy = deck.duplicateSlide(second)!;
    expect(deck.slides().map((s) => s.id)).toEqual([first.id, second, copy]);
    expect(texts(deck, copy)).toEqual(texts(deck, second));

    deck.moveSlide(copy, 0);
    expect(deck.slides().map((s) => s.id)).toEqual([copy, first.id, second]);

    deck.removeSlide(second);
    expect(deck.slides()).toHaveLength(2);
    expect(deck.elements(second)).toEqual([]);
  });

  it('undoes its own changes', () => {
    const deck = new SlideDeck(new Y.Doc());
    deck.ensureFirstSlide();
    const [slide] = deck.slides();
    const id = deck.addElement(slide.id, {
      type: 'shape',
      shape: 'star',
      x: 10,
      y: 10,
      w: 50,
      h: 50,
    });
    deck.stopCapturing();
    deck.updateElement(id, { x: 300 });
    deck.undo();
    expect(deck.element(id)?.x).toBe(10);
    deck.undo();
    expect(deck.element(id)).toBeUndefined();
  });

  it('replaces an untouched first slide with imported slides', () => {
    const deck = new SlideDeck(new Y.Doc());
    deck.ensureFirstSlide();
    deck.importSlides([
      { elements: [{ type: 'text', x: 0, y: 0, w: 100, h: 50, text: 'One' }] },
      { notes: 'Say hello', elements: [] },
    ]);
    const slides = deck.slides();
    expect(slides).toHaveLength(2);
    expect(texts(deck, slides[0].id)).toEqual(['One']);
    expect(slides[1].meta.notes).toBe('Say hello');
  });
});

describe('PowerPoint files', () => {
  it('reads back what it writes', async () => {
    const deck = new SlideDeck(new Y.Doc());
    deck.ensureFirstSlide();
    const [slide] = deck.slides();
    const [title] = deck.elements(slide.id);
    deck.updateElement(title.id, { text: 'Hello PowerPoint' });
    deck.setSlide(slide.id, { notes: 'Speak slowly', background: '#ffd23f' });
    deck.addElement(slide.id, {
      type: 'shape',
      shape: 'ellipse',
      x: 100,
      y: 300,
      w: 200,
      h: 100,
      fill: '#ee4266',
      text: 'Inside',
    });
    deck.addElement(slide.id, {
      type: 'shape',
      shape: 'arrow',
      x: 400,
      y: 400,
      w: 200,
      h: 4,
    });

    const blob = await writePptx(deck, 'Test');
    const slides = await readPptx(await blob.arrayBuffer());

    expect(slides).toHaveLength(1);
    expect(slides[0].notes).toBe('Speak slowly');
    expect(slides[0].background?.toLowerCase()).toBe('#ffd23f');
    const byText = Object.fromEntries(
      slides[0].elements.filter((e) => e.text).map((e) => [e.text, e]),
    );
    expect(byText['Hello PowerPoint'].style?.bold).toBe(true);
    expect(byText['Hello PowerPoint'].style?.size).toBeCloseTo(56, 0);
    const ellipse = byText['Inside'];
    expect(ellipse.shape).toBe('ellipse');
    expect(ellipse.fill?.toLowerCase()).toBe('#ee4266');
    expect(ellipse.x).toBeCloseTo(100, 0);
    expect(ellipse.w).toBeCloseTo(200, 0);
    expect(slides[0].elements.some((e) => e.shape === 'arrow')).toBe(true);
  });
});
