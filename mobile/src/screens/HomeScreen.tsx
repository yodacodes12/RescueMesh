import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ChevronRight, CloudOff, FlaskConical, Radio, Router, Smartphone, Wifi } from 'lucide-react-native';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AlertListItem } from '../components/AlertListItem';
import { Logo } from '../components/Logo';
import { Card, SectionTitle, StatusPill, timeAgo } from '../components/ui';
import { nextStepHint } from '../mesh/core/status';
import type { RootStackParamList, TabParamList } from '../navigation/types';
import { useMesh } from '../state/MeshContext';
import { colors, radius, shadow, space } from '../theme';

type Props = CompositeScreenProps<BottomTabScreenProps<TabParamList, 'Home'>, NativeStackScreenProps<RootStackParamList>>;

export function HomeScreen({ navigation }: Props) {
  const { snapshot, internetReachable, settings } = useMesh();
  const sim = settings.meshMode === 'SIMULATION';
  const mine = (snapshot?.messages ?? []).filter(m => m.origin === 'SELF');
  const latest = mine[0];
  const connected = (snapshot?.peers ?? []).filter(p => p.state === 'CONNECTED');
  const discovered = snapshot?.peers.length ?? 0;
  const online = !!snapshot?.gatewayCapable;
  const suppressed = !!snapshot?.internetSuppressed;
  const peerGateway = connected.some(p => p.isGateway);
  const meshRunning = snapshot?.transportState === 'RUNNING';

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.brand}>
          <Logo size={40} />
          <View style={{ flex: 1 }}>
            <Text style={s.brandName}>RescueMesh</Text>
            <Text style={s.brandSub}>Offline emergency network</Text>
          </View>
          {sim && (
            <View style={s.simBadge}><FlaskConical size={14} color="#92400E" /><Text style={s.simText}>SIMULATION</Text></View>
          )}
        </View>

        <View style={[s.conn, { backgroundColor: online ? colors.greenSoft : colors.coralSoft }]}>
          {online ? <Wifi size={22} color={colors.green} /> : <CloudOff size={22} color={colors.coralDark} />}
          <View style={{ flex: 1 }}>
            <Text style={[s.connTitle, { color: online ? colors.green : colors.coralDark }]}>{online ? 'ONLINE' : 'OFFLINE'}</Text>
            <Text style={s.connSub}>
              {online
                ? 'Connected to rescue server. SOS is sent directly.'
                : suppressed
                  ? 'Internet disabled for the simulation demo.'
                  : internetReachable
                    ? 'Internet available, but rescue server not reachable.'
                    : 'No internet. SOS will travel through nearby phones.'}
            </Text>
          </View>
        </View>

        <View style={s.statsRow}>
          <Stat icon={<Smartphone size={18} color={colors.blue} />} value={String(connected.length)}
            label={sim ? 'Simulated peers' : 'Nearby devices'} sub={discovered > connected.length ? `${discovered} discovered` : 'connected'} />
          <Stat icon={<Radio size={18} color={meshRunning ? colors.blue : colors.textMuted} />}
            value={meshRunning ? 'Active' : snapshot?.transportKind ? 'Starting' : 'Off'} label="Mesh" sub={sim ? 'simulated radio' : 'Bluetooth / Wi-Fi'} />
          <Stat icon={<Router size={18} color={online || peerGateway ? colors.green : colors.textMuted} />}
            value={String(snapshot?.pendingCount ?? 0)} label="Pending" sub={online ? 'this phone is a gateway' : peerGateway ? 'gateway nearby' : 'no gateway yet'} />
        </View>

        <Pressable
          onPress={() => navigation.navigate('CreateSOS')}
          accessibilityRole="button"
          accessibilityLabel="Send SOS"
          accessibilityHint="Opens the emergency report form"
          style={({ pressed }) => [s.sosOuter, pressed && { transform: [{ scale: 0.97 }] }]}>
          <View style={s.sosInner}>
            <Text style={s.sosText}>SEND</Text>
            <Text style={s.sosBig}>SOS</Text>
          </View>
        </Pressable>
        <Text style={s.sosHint}>Works with or without internet</Text>

        {latest && (
          <>
            <SectionTitle>Latest delivery status</SectionTitle>
            <Pressable onPress={() => navigation.navigate('SOSStatus', { id: latest.msg.message_id })}>
              <Card>
                <StatusPill s={latest.delivery_status} />
                <Text style={s.latestHint}>{nextStepHint(latest.delivery_status)}</Text>
                <Text style={s.latestMeta}>Updated {timeAgo(latest.delivery_log[latest.delivery_log.length - 1]?.at ?? latest.received_at)} · tap for full history</Text>
              </Card>
            </Pressable>
          </>
        )}

        <Pressable onPress={() => navigation.navigate('MeshStatus')} style={s.meshLink} accessibilityRole="button">
          <Radio size={20} color={colors.navy} />
          <Text style={s.meshLinkText}>Mesh network status{snapshot?.relayHoldingCount ? ` · carrying ${snapshot.relayHoldingCount} SOS for others` : ''}</Text>
          <ChevronRight size={20} color={colors.textMuted} />
        </Pressable>

        <SectionTitle right={mine.length > 3 ? <Text onPress={() => navigation.navigate('Alerts')} style={s.link}>See all</Text> : undefined}>
          Recent SOS alerts
        </SectionTitle>
        {mine.length === 0 ? (
          <Text style={s.empty}>You have not sent any SOS alerts.</Text>
        ) : (
          mine.slice(0, 3).map(m => (
            <AlertListItem key={m.msg.message_id} m={m} onPress={() => navigation.navigate('SOSStatus', { id: m.msg.message_id })} />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ icon, value, label, sub }: { icon: React.ReactNode; value: string; label: string; sub: string }) {
  return (
    <View style={s.stat}>
      {icon}
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={s.statSub} numberOfLines={2}>{sub}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  content: { padding: space(5), paddingBottom: space(10) },
  brand: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  brandName: { fontSize: 22, fontWeight: '800', color: colors.navy },
  brandSub: { fontSize: 13, color: colors.textMuted },
  simBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FDE68A', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  simText: { fontSize: 11, fontWeight: '800', color: '#92400E' },
  conn: { flexDirection: 'row', alignItems: 'center', gap: space(3), borderRadius: radius.lg, padding: space(4), marginTop: space(5) },
  connTitle: { fontSize: 15, fontWeight: '800', letterSpacing: 1 },
  connSub: { fontSize: 13, color: colors.text, marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: space(2), marginTop: space(3) },
  stat: { flex: 1, backgroundColor: colors.bg, borderRadius: radius.md, padding: space(3), gap: 2 },
  statValue: { fontSize: 20, fontWeight: '800', color: colors.navy, marginTop: 4 },
  statLabel: { fontSize: 12, fontWeight: '700', color: colors.text },
  statSub: { fontSize: 11, color: colors.textMuted },
  sosOuter: { alignSelf: 'center', marginTop: space(8), width: 200, height: 200, borderRadius: 100, backgroundColor: `${colors.coral}33`, alignItems: 'center', justifyContent: 'center' },
  sosInner: { width: 168, height: 168, borderRadius: 84, backgroundColor: colors.coral, alignItems: 'center', justifyContent: 'center', ...shadow, shadowColor: colors.coral, shadowOpacity: 0.4, elevation: 10 },
  sosText: { color: colors.white, fontSize: 16, fontWeight: '700', letterSpacing: 3 },
  sosBig: { color: colors.white, fontSize: 52, fontWeight: '900', letterSpacing: 2, marginTop: -4 },
  sosHint: { textAlign: 'center', marginTop: space(3), color: colors.textMuted, fontSize: 13 },
  latestHint: { marginTop: space(2), fontSize: 14, color: colors.text },
  latestMeta: { marginTop: space(1), fontSize: 12, color: colors.textMuted },
  meshLink: { flexDirection: 'row', alignItems: 'center', gap: space(3), marginTop: space(4), padding: space(4), borderRadius: radius.lg, backgroundColor: colors.blueSoft },
  meshLinkText: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.navy },
  link: { color: colors.blue, fontWeight: '700' },
  empty: { color: colors.textMuted, fontSize: 14, paddingVertical: space(3) },
});
