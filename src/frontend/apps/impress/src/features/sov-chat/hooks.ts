import type { HocuspocusProvider } from '@hocuspocus/provider';
import { useEffect, useState, useSyncExternalStore } from 'react';

import { ChatRoom } from './model/chat';

/** The conversation of a chat, re-rendering on every new message. */
export const useChatRoom = (provider: HocuspocusProvider) => {
  const [room, setRoom] = useState<ChatRoom>();

  useEffect(() => {
    const created = new ChatRoom(provider.document);
    setRoom(created);
    return () => created.dispose();
  }, [provider]);

  const version = useSyncExternalStore(
    room?.subscribe ?? noopSubscribe,
    room?.getVersion ?? zero,
    zero,
  );
  return { room, version };
};

const noopSubscribe = () => () => undefined;
const zero = () => 0;

export interface ChatPresence {
  clientId: number;
  id: string;
  name: string;
  color: string;
  typing: boolean;
}

/** Who else has the chat open (and who is typing), and publishing ours. */
export const useChatPresence = (
  provider: HocuspocusProvider,
  local: Omit<ChatPresence, 'clientId'>,
) => {
  const [others, setOthers] = useState<ChatPresence[]>([]);
  const awareness = provider.awareness;
  const { id, name, color, typing } = local;

  useEffect(() => {
    awareness?.setLocalStateField('sovChat', { id, name, color, typing });
  }, [awareness, id, name, color, typing]);

  useEffect(() => {
    if (!awareness) {
      return;
    }
    const update = () => {
      const list: ChatPresence[] = [];
      const seen = new Set<string>();
      awareness.getStates().forEach((state, clientId) => {
        const who = (state as { sovChat?: Omit<ChatPresence, 'clientId'> })
          .sovChat;
        // One entry per person, even with the chat open in two windows.
        if (clientId !== awareness.clientID && who && !seen.has(who.id)) {
          seen.add(who.id);
          list.push({ ...who, clientId });
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
