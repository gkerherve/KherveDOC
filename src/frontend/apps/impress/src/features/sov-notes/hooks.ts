import type { HocuspocusProvider } from '@hocuspocus/provider';
import { useEffect, useState, useSyncExternalStore } from 'react';

import { NoteInk } from './model/ink';

/** The handwriting of a note, re-rendering on every change. */
export const useNoteInk = (provider: HocuspocusProvider) => {
  const [ink, setInk] = useState<NoteInk>();

  useEffect(() => {
    const created = new NoteInk(provider.document);
    setInk(created);
    return () => created.dispose();
  }, [provider]);

  const version = useSyncExternalStore(
    ink?.subscribe ?? noopSubscribe,
    ink?.getVersion ?? zero,
    zero,
  );
  return { ink, version };
};

const noopSubscribe = () => () => undefined;
const zero = () => 0;
