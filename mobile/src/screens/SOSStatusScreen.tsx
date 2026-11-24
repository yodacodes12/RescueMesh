/**
 * Screen 5 (SOS Confirmation) and the per-alert delivery history from Screen 6.
 * Relayed copies (carried for someone else) hide the description and show
 * only an approximate location, to protect the sender's privacy.
 */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Check, CircleCheck, Lock, RefreshCw } from 'lucide-react-native';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TYPE_LABEL, TypeIcon } from '../components/emergency';
import { Button, Card, PriorityPill, Row, SectionTitle, SimTag, StatusPill, fmtTime, statusColors } from '../components/ui';
import { isDeliveryFinished, nextStepHint, RANK, STATUS_LABEL } from '../mesh/core/status';
import type { DeliveryStatus } from '../mesh/core/types';
import type { RootStackParamList } from '../navigation/types';
import { useMesh } from '../state/MeshContext';
import { colors, priorityColor, radius, space } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'SOSStatus'>;

const PIPELINE: DeliveryStatus[] = [
  'CREATED_LOCAL', 'RELAYED', 'GATEWAY_REACHED', 'SERVER_RECEIVED', 'COORDINATOR_ACKNOWLEDGED', 'ASSIGNED', 'RESOLVED',
];

const RESCUE_LABEL: Record<string, string> = {
  RECEIVED: 'Waiting for coordinator', ACKNOWLEDGED: 'Acknowledged', ASSIGNED: 'Team assigned',
  IN_PROGRESS: 'Rescue in progress', RESOLVED: 'Resolved', CANCELLED: 'Closed',
};

export function SOSStatusScreen({ route, navigation }: Props) {
  const { snapshot, retry } = useMesh();
  const m = snapshot?.messages.find(x => x.msg.message_id === route.params.id);

  if (!m) {
    return <View style={s.center}><Text>SOS not found on this device.</Text></View>;
  }
  const { msg } = m;
  const relay = m.origin === 'RELAY';
  const status = m.delivery_status;
  const rank = RANK[status];
  const failed = status === 'EXPIRED' || status === 'REJECTED' || status === 'SEND_FAILED';
  // Directly uploaded messages never pass through RELAYED/GATEWAY_REACHED.
  const steps = PIPELINE.filter(p => {
    const viaMesh = m.delivery_log.some(l => l.status === 'RELAYED' || l.status === 'GATEWAY_REACHED') || rank < RANK.SERVER_RECEIVED;
    return viaMesh || (p !== 'RELAYED' && p !== 'GATEWAY_REACHED');
  });
  // Highest pipeline stage this message ever reached (failures keep earlier progress visible).
  const reached = Math.max(
    0,
    ...[status, ...m.delivery_log.map(l => l.status)]
      .filter((x): x is DeliveryStatus => PIPELINE.includes(x as DeliveryStatus))
      .map(x => RANK[x]),
  );
  const approx = (v: number | null) => (v === null ? null : relay ? v.toFixed(3) : v.toFixed(5));
  const loc = msg.latitude === null ? 'No GPS fix' : `${approx(msg.latitude)}, ${approx(msg.longitude)}${relay ? ' (approx.)' : ''}`;
  const sc = statusColors(status);

  return (
    <SafeAreaView style={s.root} edges={['bottom']}>
      <ScrollView contentContainerStyle={s.content}>
        <View style={[s.hero, { backgroundColor: sc.bg }]}>
          {route.params.justCreated ? <CircleCheck size={44} color={sc.color} /> : <TypeIcon type={msg.emergency_type} size={44} color={sc.color} />}
          <Text style={[s.heroTitle, { color: sc.color }]}>{route.params.justCreated ? 'SOS saved' : STATUS_LABEL[status]}</Text>
          <Text style={s.heroSub}>
            {relay ? 'You are carrying this SOS for someone else. Keep RescueMesh open so it can reach a gateway.' : nextStepHint(status) || STATUS_LABEL[status]}
          </Text>
          {route.params.justCreated && !isDeliveryFinished(status) && rank < RANK.SERVER_RECEIVED && (
            <Text style={s.heroNote}>Being received by a nearby phone does not mean rescuers have it yet. This screen updates as your SOS moves.</Text>
          )}
        </View>

        <SectionTitle>Delivery progress</SectionTitle>
        <Card>
          {steps.map((p, i) => {
            const done = RANK[p] <= reached;
            const current = status === p;
            return (
              <View key={p} style={s.step}>
                <View style={s.stepRail}>
                  <View style={[s.dot, done && { backgroundColor: current ? sc.color : colors.green, borderColor: current ? sc.color : colors.green }]}>
                    {done && <Check size={12} color={colors.white} strokeWidth={3} />}
                  </View>
                  {i < steps.length - 1 && <View style={[s.line, done && !current && { backgroundColor: colors.green }]} />}
                </View>
                <Text style={[s.stepText, done && { color: colors.text }, current && { fontWeight: '800' }]}>{STATUS_LABEL[p]}</Text>
              </View>
            );
          })}
          {failed && <View style={{ marginTop: space(2) }}><StatusPill s={status} /></View>}
          {status === 'CANCELLED' && <View style={{ marginTop: space(2) }}><StatusPill s={status} /></View>}
        </Card>

        <SectionTitle>SOS details</SectionTitle>
        <Card>
          <Row label="Message ID" value={msg.message_id} mono />
          <Row label="Category" value={TYPE_LABEL[msg.emergency_type]} />
          <Row label="Priority" value={<PriorityPill p={msg.priority} />} />
          <Row label="Location" value={loc} mono />
          <Row label="Created" value={fmtTime(msg.created_at)} />
          <Row label="Delivery" value={<StatusPill s={status} />} />
          {m.rescue_status && <Row label="Rescue" value={RESCUE_LABEL[m.rescue_status] ?? m.rescue_status} />}
          <Row label="Hops so far" value={String(msg.hop_count)} />
          {msg.people_affected ? <Row label="People" value={String(msg.people_affected)} /> : null}
          {relay ? (
            <View style={s.private}><Lock size={16} color={colors.textMuted} /><Text style={s.privateText}>Description and exact location are hidden on relaying phones.</Text></View>
          ) : msg.description ? (
            <Row label="Description" value={msg.description} />
          ) : null}
          {msg.is_simulated && <View style={{ marginTop: space(2) }}><SimTag /></View>}
        </Card>

        <SectionTitle>Delivery history</SectionTitle>
        <Card>
          {[...m.delivery_log].reverse().map((l, i) => (
            <View key={i} style={s.log}>
              <View style={[s.logDot, { backgroundColor: l.status === 'INFO' ? colors.border : statusColors(l.status).color }]} />
              <View style={{ flex: 1 }}>
                <Text style={s.logText}>{l.detail}</Text>
                <Text style={s.logTime}>{fmtTime(l.at)}{l.status !== 'INFO' ? ` · ${STATUS_LABEL[l.status]}` : ''}</Text>
              </View>
            </View>
          ))}
        </Card>

        {!relay && !isDeliveryFinished(status) && (
          <Button title="Try to deliver now" variant="primary" icon={<RefreshCw size={18} color={colors.white} />}
            onPress={() => void retry(msg.message_id)} style={{ marginTop: space(5) }} />
        )}
        <Button title="Back to Home" variant="ghost" onPress={() => navigation.navigate('Main', { screen: 'Home' })} style={{ marginTop: space(3) }} />
        <View style={[s.prioBar, { backgroundColor: priorityColor[msg.priority] }]} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: space(5), paddingBottom: space(10) },
  hero: { borderRadius: radius.xl, padding: space(5), alignItems: 'center' },
  heroTitle: { fontSize: 22, fontWeight: '800', marginTop: space(2), textAlign: 'center' },
  heroSub: { fontSize: 14, color: colors.text, marginTop: space(2), textAlign: 'center', lineHeight: 20 },
  heroNote: { fontSize: 12.5, color: colors.textMuted, marginTop: space(3), textAlign: 'center', lineHeight: 18 },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: space(3), minHeight: 38 },
  stepRail: { alignItems: 'center', width: 22 },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  line: { width: 2, flex: 1, minHeight: 16, backgroundColor: colors.border },
  stepText: { fontSize: 15, color: colors.textMuted, paddingTop: 1 },
  private: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: space(3) },
  privateText: { flex: 1, fontSize: 13, color: colors.textMuted },
  log: { flexDirection: 'row', gap: space(3), paddingVertical: space(2) },
  logDot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
  logText: { fontSize: 14, color: colors.text },
  logTime: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  prioBar: { height: 4, borderRadius: 2, marginTop: space(6), opacity: 0.6 },
});
