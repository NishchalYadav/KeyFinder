import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { HistoryProvider } from './src/state/history';
import { SettingsProvider } from './src/state/settings';
import { HomeScreen } from './src/screens/HomeScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { useTheme } from './src/ui/theme';

type Tab = 'home' | 'history' | 'settings';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'home', label: 'Detect', icon: '♫' },
  { id: 'history', label: 'History', icon: '☰' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

function Shell() {
  const t = useTheme();
  const [tab, setTab] = useState<Tab>('home');
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top', 'bottom']}>
      <StatusBar style={t.isDark ? 'light' : 'dark'} />
      {/* Screens stay mounted (just hidden) so a live mic session or playback
          keeps running while you look at History or Settings. */}
      <View style={{ flex: 1 }}>
        <View style={[styles.fill, tab !== 'home' && styles.hidden]}><HomeScreen /></View>
        <View style={[styles.fill, tab !== 'history' && styles.hidden]}><HistoryScreen /></View>
        <View style={[styles.fill, tab !== 'settings' && styles.hidden]}><SettingsScreen /></View>
      </View>
      <View style={[styles.bar, { backgroundColor: t.surface, borderTopColor: t.border }]}>
        {TABS.map((x) => (
          <Pressable key={x.id} style={styles.tab} onPress={() => setTab(x.id)} accessibilityRole="tab" accessibilityState={{ selected: tab === x.id }}>
            <Text style={{ fontSize: 20, color: tab === x.id ? t.accent : t.textDim }}>{x.icon}</Text>
            <Text style={{ fontSize: 11, fontWeight: '600', color: tab === x.id ? t.accent : t.textDim }}>{x.label}</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <HistoryProvider>
          <Shell />
        </HistoryProvider>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject },
  hidden: { display: 'none' },
  bar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 8 },
  tab: { flex: 1, alignItems: 'center', gap: 2 },
});
