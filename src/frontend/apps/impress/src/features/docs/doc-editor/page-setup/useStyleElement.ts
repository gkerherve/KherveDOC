import { useEffect, useRef } from 'react';

/**
 * Keeps a <style> element in <head> in sync with `css`, one per mounted
 * instance. Used for CSS computed from document settings: styled-components'
 * dynamic global styles lose their rules when a sibling instance unmounts
 * (the read-only editor is swapped for the editable one on load).
 */
export const useStyleElement = (css: string) => {
  const element = useRef<HTMLStyleElement | null>(null);

  useEffect(() => {
    const style = document.createElement('style');
    style.setAttribute('data-kherve-style', '');
    document.head.appendChild(style);
    element.current = style;
    return () => {
      style.remove();
      element.current = null;
    };
  }, []);

  useEffect(() => {
    if (element.current) {
      element.current.textContent = css;
    }
  }, [css]);
};
