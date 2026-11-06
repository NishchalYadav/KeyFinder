import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { KeyId } from '../engine';
import { loadList, saveJson } from './storage';

export interface HistoryEntry extends KeyId {
  id: string;
  /** File name for in-app analysis; "Microphone detection" for mic. User can rename. */
  title: string;
  source: 'mic' | 'file';
  confidence: number; // 0..1
  timestamp: number; // epoch ms
}

const KEY = 'keyfinder.history.v1';
const MAX_ENTRIES = 100;

interface Ctx {
  entries: HistoryEntry[];
  add: (e: Omit<HistoryEntry, 'id' | 'timestamp'>) => void;
  rename: (id: string, title: string) => void;
  remove: (id: string) => void;
  clear: () => void;
}
const HistoryContext = createContext<Ctx>({ entries: [], add: () => {}, rename: () => {}, remove: () => {}, clear: () => {} });

export function HistoryProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);

  useEffect(() => { loadList<HistoryEntry>(KEY).then(setEntries); }, []);

  const commit = useCallback((fn: (prev: HistoryEntry[]) => HistoryEntry[]) => {
    setEntries((prev) => {
      const next = fn(prev).slice(0, MAX_ENTRIES);
      saveJson(KEY, next);
      return next;
    });
  }, []);

  const add = useCallback<Ctx['add']>((e) => {
    const entry: HistoryEntry = { ...e, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, timestamp: Date.now() };
    commit((prev) => [entry, ...prev]);
  }, [commit]);

  const rename = useCallback<Ctx['rename']>((id, title) => commit((p) => p.map((e) => (e.id === id ? { ...e, title } : e))), [commit]);
  const remove = useCallback<Ctx['remove']>((id) => commit((p) => p.filter((e) => e.id !== id)), [commit]);
  const clear = useCallback(() => commit(() => []), [commit]);

  const value = useMemo(() => ({ entries, add, rename, remove, clear }), [entries, add, rename, remove, clear]);
  return <HistoryContext.Provider value={value}>{children}</HistoryContext.Provider>;
}

export const useHistory = () => useContext(HistoryContext);
