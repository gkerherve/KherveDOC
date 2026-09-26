import { useCallback, useEffect, useState } from 'react';
import { createGlobalStyle } from 'styled-components';

import { useProviderStore } from '@/docs/doc-management';

import { SETTINGS_MAP } from '../page-setup/pageSetup';

import {
  DocStyles,
  docStylesCss,
  readDocStyles,
  writeDocStyles,
} from './docStyles';

/** The open document's paragraph styles, kept in sync across collaborators. */
export const useDocStyles = () => {
  const ydoc = useProviderStore((state) => state.provider?.document);
  const [styles, setStyles] = useState<DocStyles>(() => readDocStyles(ydoc));

  useEffect(() => {
    if (!ydoc) {
      return;
    }
    const map = ydoc.getMap(SETTINGS_MAP);
    const refresh = () => setStyles(readDocStyles(ydoc));
    refresh();
    map.observe(refresh);
    return () => map.unobserve(refresh);
  }, [ydoc]);

  const save = useCallback(
    (next: DocStyles) => {
      if (ydoc) {
        writeDocStyles(ydoc, next);
      }
    },
    [ydoc],
  );

  return { styles, save };
};

const DocStylesGlobalStyle = createGlobalStyle<{ $css: string }>`
  ${({ $css }) => $css}
`;

/** Applies the document's paragraph styles in the editor. */
export const DocStylesStyle = () => {
  const { styles } = useDocStyles();
  return <DocStylesGlobalStyle $css={docStylesCss(styles)} />;
};
