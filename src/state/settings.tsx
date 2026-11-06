import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { loadJson, saveJson } from './storage';

export type ThemePref = 'system' | 'dark' | 'light';

export interface Settings {
  /** 0..1, see engine/params.ts. UI offers Low / Medium / High presets. */
  sensitivity: number;
  /** Seconds between live updates (2-4 per the spec). */
  updateSec: 2 | 3 | 4;
  /** Experimental Dorian/Phrygian/Lydian/Mixolydian candidates. */
  includeModes: boolean;
  theme: ThemePref;
}

export const DEFAULT_SETTINGS: Settings = {
  sensitivity: 0.5,
  updateSec: 3,
  includeModes: false,
  theme: 'dark',
};

const KEY = 'keyfinder.settings.v1';

interface Ctx {
  settings: Settings;
  ready: boolean;
  update: (patch: Partial<Settings>) => void;
}
const SettingsContext = createContext<Ctx>({ settings: DEFAULT_SETTINGS, ready: false, update: () => {} });

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadJson(KEY, DEFAULT_SETTINGS).then((s) => { setSettings(s); setReady(true); });
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveJson(KEY, next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ settings, ready, update }), [settings, ready, update]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export const useSettings = () => useContext(SettingsContext);
