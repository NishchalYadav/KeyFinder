import { useColorScheme } from 'react-native';
import { useSettings } from '../state/settings';

export interface Palette {
  isDark: boolean;
  bg: string;
  surface: string;
  surfaceHi: string;
  border: string;
  text: string;
  textDim: string;
  accent: string; // primary actions
  accentText: string;
  good: string; // confidence / live
  warn: string;
  danger: string;
}

export const DARK: Palette = {
  isDark: true,
  bg: '#0A0C11',
  surface: '#14181F',
  surfaceHi: '#1C2230',
  border: '#262D3B',
  text: '#F3F5F9',
  textDim: '#8A93A6',
  accent: '#8B7CFF',
  accentText: '#0A0C11',
  good: '#4FE3C1',
  warn: '#FFC857',
  danger: '#FF6B7A',
};

export const LIGHT: Palette = {
  isDark: false,
  bg: '#F6F7FB',
  surface: '#FFFFFF',
  surfaceHi: '#EEF0F7',
  border: '#DADFEA',
  text: '#10131A',
  textDim: '#5F6880',
  accent: '#5B47F0',
  accentText: '#FFFFFF',
  good: '#0E9F83',
  warn: '#B7791F',
  danger: '#D6334A',
};

export function useTheme(): Palette {
  const system = useColorScheme();
  const { settings } = useSettings();
  const pref = settings.theme;
  const dark = pref === 'system' ? system !== 'light' : pref === 'dark';
  return dark ? DARK : LIGHT;
}
