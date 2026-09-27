import type { HocuspocusProvider } from '@hocuspocus/provider';
import { useEffect, useState, useSyncExternalStore } from 'react';

import { SlideDeck } from './model/deck';

/** The presentation of a slides document. */
export const useSlideDeck = (
  provider: HocuspocusProvider,
  editable: boolean,
  synced: boolean,
) => {
  const [deck, setDeck] = useState<SlideDeck>();

  useEffect(() => {
    const created = new SlideDeck(provider.document);
    setDeck(created);
    return () => created.dispose();
  }, [provider]);

  // Only once in sync with the server can "no slides" mean "new".
  useEffect(() => {
    if (deck && editable && synced) {
      deck.ensureFirstSlide();
    }
  }, [deck, editable, synced]);

  const version = useSyncExternalStore(
    deck?.subscribe ?? noopSubscribe,
    deck?.getVersion ?? zero,
    zero,
  );
  return { deck, version };
};

const noopSubscribe = () => () => undefined;
const zero = () => 0;

export interface SlidePresence {
  clientId: number;
  slide: string;
  name: string;
  color: string;
}

/** Which slide each collaborator is on, and publishing ours. */
export const useSlidePresence = (
  provider: HocuspocusProvider,
  local: Omit<SlidePresence, 'clientId'> | undefined,
) => {
  const [others, setOthers] = useState<SlidePresence[]>([]);
  const awareness = provider.awareness;

  useEffect(() => {
    if (awareness && local) {
      awareness.setLocalStateField('kherveSlides', local);
    }
  }, [awareness, local]);

  useEffect(() => {
    if (!awareness) {
      return;
    }
    const update = () => {
      const list: SlidePresence[] = [];
      awareness.getStates().forEach((state, clientId) => {
        const where = (state as { kherveSlides?: SlidePresence }).kherveSlides;
        if (clientId !== awareness.clientID && where) {
          list.push({ ...where, clientId });
        }
      });
      setOthers(list);
    };
    update();
    awareness.on('change', update);
    return () => awareness.off('change', update);
  }, [awareness]);

  return others;
};
