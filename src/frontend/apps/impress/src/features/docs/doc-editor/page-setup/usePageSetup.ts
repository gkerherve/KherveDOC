import { useCallback, useEffect, useState } from 'react';

import { useProviderStore } from '@/docs/doc-management';

import {
  PageSetup,
  SETTINGS_MAP,
  readPageSetup,
  writePageSetup,
} from './pageSetup';

/** Page setup of the open document, kept in sync across collaborators. */
export const usePageSetup = () => {
  const ydoc = useProviderStore((state) => state.provider?.document);
  const [setup, setSetup] = useState<PageSetup>(() => readPageSetup(ydoc));

  useEffect(() => {
    if (!ydoc) {
      return;
    }
    const map = ydoc.getMap(SETTINGS_MAP);
    const refresh = () => setSetup(readPageSetup(ydoc));
    refresh();
    map.observe(refresh);
    return () => map.unobserve(refresh);
  }, [ydoc]);

  const save = useCallback(
    (next: PageSetup) => {
      if (ydoc) {
        writePageSetup(ydoc, next);
      }
    },
    [ydoc],
  );

  return { setup, save };
};
