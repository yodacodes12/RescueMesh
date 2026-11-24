import { ChevronRight } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { StoredMessage } from '../mesh/core/types';
import { colors, priorityColor, radius, space } from '../theme';
import { TYPE_LABEL, TypeIcon } from './emergency';
import { PriorityPill, SimTag, StatusPill, shortId, timeAgo } from './ui';

export function AlertListItem({ m, onPress }: { m: StoredMessage; onPress: () => void }) {
  const relay = m.origin === 'RELAY';
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [s.item, pressed && { opacity: 0.8 }]}>
      <View style={[s.icon, { backgroundColor: `${priorityColor[m.msg.priority]}1A` }]}>
        <TypeIcon type={m.msg.emergency_type} color={priorityColor[m.msg.priority]} />
      </View>
      <View style={s.body}>
        <View style={s.line}>
          <Text style={s.title}>{TYPE_LABEL[m.msg.emergency_type]}</Text>
          <PriorityPill p={m.msg.priority} />
          {m.msg.is_simulated && <SimTag />}
        </View>
        <Text style={s.meta}>
          #{shortId(m.msg.message_id)} · {timeAgo(m.msg.created_at)}{relay ? ` · carrying for ${m.msg.hop_count} hop${m.msg.hop_count === 1 ? '' : 's'}` : ''}
        </Text>
        <View style={s.statusRow}><StatusPill s={m.delivery_status} /></View>
      </View>
      <ChevronRight size={20} color={colors.textMuted} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  item: { flexDirection: 'row', alignItems: 'center', gap: space(3), backgroundColor: colors.white, borderRadius: radius.lg, padding: space(3), marginBottom: space(2), borderWidth: 1, borderColor: colors.border },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 3 },
  line: { flexDirection: 'row', alignItems: 'center', gap: space(2), flexWrap: 'wrap' },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  meta: { fontSize: 12.5, color: colors.textMuted },
  statusRow: { marginTop: 2 },
});
