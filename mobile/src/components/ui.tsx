import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, priorityColor, radius, shadow, space } from '../theme';
import type { DeliveryStatus, Priority } from '../mesh/core/types';
import { STATUS_LABEL } from '../mesh/core/status';

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {right}
    </View>
  );
}

type Variant = 'primary' | 'danger' | 'ghost' | 'success';

export function Button({
  title, onPress, variant = 'primary', disabled, loading, icon, style, accessibilityHint,
}: {
  title: string; onPress: () => void; variant?: Variant; disabled?: boolean; loading?: boolean;
  icon?: React.ReactNode; style?: StyleProp<ViewStyle>; accessibilityHint?: string;
}) {
  const bg = { primary: colors.blue, danger: colors.coral, ghost: colors.white, success: colors.green }[variant];
  const fg = variant === 'ghost' ? colors.navy : colors.white;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={accessibilityHint}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        variant === 'ghost' && styles.btnGhost,
        style,
      ]}>
      {loading ? <ActivityIndicator color={fg} /> : icon}
      <Text style={[styles.btnText, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

export function Pill({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.pillText, { color }]}>{label}</Text>
    </View>
  );
}

export function PriorityPill({ p }: { p: Priority }) {
  return <Pill label={p} color={priorityColor[p]} bg={`${priorityColor[p]}1A`} />;
}

export function statusColors(s: DeliveryStatus): { color: string; bg: string } {
  switch (s) {
    case 'CREATED_LOCAL':
      return { color: colors.amber, bg: colors.amberSoft };
    case 'SEND_FAILED':
    case 'EXPIRED':
    case 'REJECTED':
      return { color: colors.coralDark, bg: colors.coralSoft };
    case 'RELAYED':
    case 'GATEWAY_REACHED':
      return { color: colors.blue, bg: colors.blueSoft };
    case 'SERVER_RECEIVED':
    case 'COORDINATOR_ACKNOWLEDGED':
      return { color: colors.green, bg: colors.greenSoft };
    case 'ASSIGNED':
      return { color: colors.violet, bg: colors.violetSoft };
    default:
      return { color: colors.textMuted, bg: '#F1F5F9' };
  }
}

export function StatusPill({ s }: { s: DeliveryStatus }) {
  const c = statusColors(s);
  return <Pill label={STATUS_LABEL[s]} {...c} />;
}

export function SimTag() {
  return <Pill label="SIMULATED" color="#92400E" bg="#FDE68A" />;
}

export function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {typeof value === 'string' || typeof value === 'number' ? (
        <Text style={[styles.rowValue, mono && styles.mono]} selectable>{value}</Text>
      ) : (
        <View style={styles.rowValueBox}>{value}</View>
      )}
    </View>
  );
}

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function timeAgo(iso: string | null): string {
  if (!iso) {
    return 'never';
  }
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) {
    return `${s}s ago`;
  }
  if (s < 3600) {
    return `${Math.floor(s / 60)} min ago`;
  }
  if (s < 86400) {
    return `${Math.floor(s / 3600)} h ago`;
  }
  return `${Math.floor(s / 86400)} d ago`;
}

export const shortId = (id: string) => id.slice(0, 8).toUpperCase();

export const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: space(4), ...shadow },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space(5), marginBottom: space(2) },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.6, textTransform: 'uppercase' },
  btn: { minHeight: 52, borderRadius: radius.md, paddingHorizontal: space(4), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space(2) },
  btnGhost: { borderWidth: 1.5, borderColor: colors.border },
  btnText: { fontSize: 16, fontWeight: '700' },
  pill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { fontSize: 12, fontWeight: '700' },
  row: { flexDirection: 'row', paddingVertical: space(2), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: space(3) },
  rowLabel: { width: 120, color: colors.textMuted, fontSize: 14 },
  rowValue: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '500' },
  rowValueBox: { flex: 1 },
  mono: { fontFamily: 'monospace', fontSize: 13 },
});
