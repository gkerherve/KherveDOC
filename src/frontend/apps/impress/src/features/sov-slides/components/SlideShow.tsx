/**
 * Presenting (the slides full screen, one at a time) and printing (one
 * slide per page, which also saves them as a PDF).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import type { SlideDeck } from '../model/deck';
import { SLIDE_H, SLIDE_W } from '../model/types';

import { SlideView } from './SlideView';

export const Presenter = ({
  deck,
  start,
  onClose,
}: {
  deck: SlideDeck;
  start: number;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const slides = deck.slides();
  const theme = deck.theme();
  const [index, setIndex] = useState(Math.min(start, slides.length - 1));
  const [size, setSize] = useState({
    w: window.innerWidth,
    h: window.innerHeight,
  });
  const root = useRef<HTMLDivElement>(null);
  const [black, setBlack] = useState(false);

  const go = useCallback(
    (delta: number) => {
      setBlack(false);
      setIndex((i) => Math.max(0, Math.min(slides.length - 1, i + delta)));
    },
    [slides.length],
  );

  useEffect(() => {
    const element = root.current;
    element?.focus();
    // Full screen where the browser allows it; the page otherwise.
    element?.requestFullscreen?.().catch(() => undefined);
    const onResize = () =>
      setSize({ w: window.innerWidth, h: window.innerHeight });
    const onFullscreen = () => {
      if (!document.fullscreenElement) {
        onClose();
      }
    };
    window.addEventListener('resize', onResize);
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => {
      window.removeEventListener('resize', onResize);
      document.removeEventListener('fullscreenchange', onFullscreen);
      if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => undefined);
      }
    };
  }, [onClose]);

  const current = slides[index];
  const scale = Math.min(size.w / SLIDE_W, size.h / SLIDE_H);

  return createPortal(
    <div
      ref={root}
      className="ks-present"
      tabIndex={-1}
      role="dialog"
      aria-label={t('Presentation')}
      onKeyDown={(e) => {
        if (
          ['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter', 'n'].includes(
            e.key,
          )
        ) {
          e.preventDefault();
          go(1);
        } else if (
          ['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'p'].includes(e.key)
        ) {
          e.preventDefault();
          go(-1);
        } else if (e.key === 'Home') {
          setIndex(0);
        } else if (e.key === 'End') {
          setIndex(slides.length - 1);
        } else if (e.key === 'b' || e.key === '.') {
          setBlack((b) => !b);
        } else if (e.key === 'Escape') {
          onClose();
        }
      }}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('.ks-present-bar')) {
          return;
        }
        go(1);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        go(-1);
      }}
    >
      {current && !black && (
        <SlideView
          meta={current.meta}
          elements={deck.elements(current.id)}
          theme={theme}
          scale={scale}
        />
      )}
      <div className="ks-present-bar">
        <button
          type="button"
          onClick={() => go(-1)}
          aria-label={t('Previous slide')}
        >
          ‹
        </button>
        <span>
          {index + 1} / {slides.length}
        </span>
        <button
          type="button"
          onClick={() => go(1)}
          aria-label={t('Next slide')}
        >
          ›
        </button>
        <button type="button" onClick={onClose}>
          {t('End show')}
        </button>
      </div>
    </div>,
    document.body,
  );
};

/** Prints once rendered (the desktop app with a slide-sized page). */
export const SlidePrint = ({
  deck,
  onDone,
}: {
  deck: SlideDeck;
  onDone: () => void;
}) => {
  const theme = deck.theme();
  useEffect(() => {
    const previous = window.__khervePageSetup;
    // Paper sizes are given portrait; the orientation turns them.
    window.__khervePageSetup = {
      paperWidthCm: 14.2875,
      paperHeightCm: 25.4,
      orientation: 'landscape',
      marginsCm: { left: 0, top: 0, right: 0, bottom: 0 },
    };
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        window.__khervePageSetup = previous;
        onDone();
      }
    };
    window.addEventListener('afterprint', finish, { once: true });
    const timer = window.setTimeout(() => window.print(), 300);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('afterprint', finish);
    };
    // One print per job.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div className="ks-print-root">
      <style>{'@page { size: 10in 5.625in; margin: 0; }'}</style>
      {deck.slides().map(({ id, meta }) => (
        <div key={id} className="ks-print-page">
          <SlideView
            meta={meta}
            elements={deck.elements(id)}
            theme={theme}
            scale={1}
          />
        </div>
      ))}
    </div>,
    document.body,
  );
};
