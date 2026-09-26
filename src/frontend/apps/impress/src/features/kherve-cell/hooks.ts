import type { HocuspocusProvider } from '@hocuspocus/provider';
import { useEffect, useState, useSyncExternalStore } from 'react';

import type { Presence } from './components/SheetGrid';
import { CellEngine } from './model/engineClient';
import { SheetWorkbook } from './model/workbook';

/** The workbook of a spreadsheet document, calculated by its own engine. */
export const useSheetWorkbook = (
  provider: HocuspocusProvider,
  editable: boolean,
  synced: boolean,
) => {
  const [workbook, setWorkbook] = useState<SheetWorkbook>();

  useEffect(() => {
    const engine = new CellEngine();
    const book = new SheetWorkbook(provider.document, engine);
    setWorkbook(book);
    void book.start();
    return () => {
      book.dispose();
      engine.terminate();
    };
  }, [provider]);

  // Only once in sync with the server can "no sheets" mean "new".
  useEffect(() => {
    if (workbook) {
      workbook.editable = editable;
    }
    if (workbook && editable && synced) {
      workbook.ensureFirstSheet();
    }
  }, [workbook, editable, synced]);

  const version = useSyncExternalStore(
    workbook?.subscribe ?? noopSubscribe,
    workbook?.getVersion ?? zero,
    zero,
  );
  return { workbook, version };
};

const noopSubscribe = () => () => undefined;
const zero = () => 0;

interface CellAwareness {
  sheetId: string;
  row: number;
  col: number;
  name: string;
  color: string;
}

/** Collaborators' selected cells, and publishing ours. */
export const useCellPresence = (
  provider: HocuspocusProvider,
  local: CellAwareness | undefined,
) => {
  const [others, setOthers] = useState<(Presence & { sheetId: string })[]>([]);
  const awareness = provider.awareness;

  useEffect(() => {
    if (awareness && local) {
      awareness.setLocalStateField('kherveCell', local);
    }
  }, [awareness, local]);

  useEffect(() => {
    if (!awareness) {
      return;
    }
    const update = () => {
      const list: (Presence & { sheetId: string })[] = [];
      awareness.getStates().forEach((state, clientId) => {
        const cell = (state as { kherveCell?: CellAwareness }).kherveCell;
        if (clientId !== awareness.clientID && cell) {
          list.push({ clientId, ...cell });
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
