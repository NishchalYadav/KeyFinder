import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from './theme';

export function Button({
  label,
  onPress,
  kind = 'primary',
  icon,
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger' | 'ghost';
  icon?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const bg = kind === 'primary' ? t.accent : kind === 'danger' ? t.danger : kind === 'secondary' ? t.surfaceHi : 'transparent';
  const fg = kind === 'primary' ? t.accentText : kind === 'danger' ? '#fff' : t.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, borderColor: kind === 'ghost' ? t.border : 'transparent', opacity: disabled ? 0.4 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      {icon ? <Text style={[styles.btnIcon, { color: fg }]}>{icon}</Text> : null}
      <Text style={[styles.btnLabel, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export function ConfidenceBar({ value }: { value: number }) {
  const t = useTheme();
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  const color = value >= 0.7 ? t.good : value >= 0.4 ? t.warn : t.danger;
  return (
    <View accessible accessibilityLabel={`Confidence ${pct} percent`}>
      <View style={styles.confRow}>
        <Text style={[styles.confLabel, { color: t.textDim }]}>CONFIDENCE</Text>
        <Text style={[styles.confPct, { color: t.text }]}>{pct}%</Text>
      </View>
      <View style={[styles.track, { backgroundColor: t.surfaceHi }]}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

/** Mirrored bars driven by a rolling list of recent loudness values (0..1 RMS). */
export function Visualizer({ levels, active, height = 64 }: { levels: number[]; active: boolean; height?: number }) {
  const t = useTheme();
  return (
    <View style={[styles.viz, { height }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {levels.map((lv, i) => {
        // Perceptual scaling: RMS of music is small, so sqrt makes quiet audio visible.
        const h = active ? Math.max(0.06, Math.min(1, Math.sqrt(lv * 5))) : 0.06;
        return (
          <View
            key={i}
            style={{
              flex: 1,
              marginHorizontal: 1,
              height: height * h,
              borderRadius: 3,
              backgroundColor: t.good,
              opacity: 0.35 + 0.65 * (i / levels.length), // newest bars brightest
            }}
          />
        );
      })}
    </View>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const t = useTheme();
  return (
    <View style={[styles.seg, { backgroundColor: t.surfaceHi }]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={[styles.segItem, on && { backgroundColor: t.accent }]}
          >
            <Text style={{ color: on ? t.accentText : t.textDim, fontWeight: '600' }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }, style]}>{children}</View>;
}

export const fmtTime = (s: number) => {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, '0')}`;
};

const styles = StyleSheet.create({
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, paddingHorizontal: 18, borderRadius: 16, borderWidth: 1 },
  btnIcon: { fontSize: 18 },
  btnLabel: { fontSize: 16, fontWeight: '700' },
  confRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  confLabel: { fontSize: 11, letterSpacing: 1.2, fontWeight: '600' },
  confPct: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  viz: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  seg: { flexDirection: 'row', borderRadius: 12, padding: 3 },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 9 },
  card: { borderRadius: 20, borderWidth: 1, padding: 18 },
});
