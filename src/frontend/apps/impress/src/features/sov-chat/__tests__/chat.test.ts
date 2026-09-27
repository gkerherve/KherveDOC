import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { ChatRoom, groupMessages, splitLinks } from '../model/chat';

const ada = { id: 'u1', name: 'Ada' };
const bob = { id: 'u2', name: 'Bob' };

describe('ChatRoom', () => {
  it('sends messages that everyone with the document sees, in order', () => {
    const ydoc = new Y.Doc();
    const room = new ChatRoom(ydoc);
    expect(room.send(ada, { text: '  ' })).toBeUndefined();
    room.send(ada, { text: ' Hello ' });
    room.send(bob, { text: 'Hi!' });

    const other = new ChatRoom(ydoc);
    expect(other.messages().map((m) => [m.author.name, m.text])).toEqual([
      ['Ada', 'Hello'],
      ['Bob', 'Hi!'],
    ]);
  });

  it('edits, reacts and deletes in place', () => {
    const room = new ChatRoom(new Y.Doc());
    const id = room.send(ada, { text: 'Helo' }) as string;
    room.send(bob, { text: 'next' });

    room.edit(id, 'Hello');
    room.react(id, '👍', 'u2');
    room.react(id, '👍', 'u1');
    room.react(id, '👍', 'u2');
    let [first] = room.messages();
    expect(first.text).toBe('Hello');
    expect(first.edited).toBeGreaterThan(0);
    expect(first.reactions).toEqual({ '👍': ['u1'] });

    room.remove(id);
    [first] = room.messages();
    expect(first).toMatchObject({ id, deleted: true, text: '' });
    expect(first.reactions).toBeUndefined();
    expect(room.messages()[1].text).toBe('next');
  });
});

describe('display', () => {
  it('finds links', () => {
    expect(splitLinks('see https://example.eu/a now')).toEqual([
      { text: 'see ', link: false },
      { text: 'https://example.eu/a', link: true },
      { text: ' now', link: false },
    ]);
  });

  it('groups by day and author', () => {
    const at = new Date(2026, 8, 27, 10).getTime();
    const base = { text: 'x' };
    const groups = groupMessages([
      { ...base, id: 'a', author: ada, at },
      { ...base, id: 'b', author: ada, at: at + 1000 },
      { ...base, id: 'c', author: bob, at: at + 2000 },
      { ...base, id: 'd', author: bob, at: at + 86400000 },
    ]);
    expect(groups.map((g) => [g.newDay, g.continued])).toEqual([
      [true, false],
      [false, true],
      [false, false],
      [true, false],
    ]);
  });
});
