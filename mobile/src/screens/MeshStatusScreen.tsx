/**
 * Screen 7: mesh network status, mode switch (real Nearby vs SIMULATION) and
 * the controls for the simulated flood scenario.
 */
import { FlaskConical, Radio } from 'lucide-react-native';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NetworkGraph } from '../components/NetworkGraph';
import { Button, Card, Row, SectionTitle, timeAgo } from '../components/ui';
import type { ScenarioStep } from '../mesh/simulation/FloodScenario';
import { useMesh } from '../state/MeshContext';
import { colors, radius, space } from '../theme';

const STEPS: { step: ScenarioStep; title: string; sub: string }[] = [
  { step: 'B_MEETS_A', title: 'Person B is within range of you', sub: 'Simulated relay phone connects to this phone' },
  { step: 'B_MEETS_C', title: 'Person B is within range of Person C', sub: 'B walks to the relief camp where C is' },
  { step: 'C_ONLINE', title: 'Person C gets internet', sub: 'C becomes a gateway and uploads to the REAL server' },
];

export function MeshStatusScreen() {
  const mesh = useMesh();
  const { snapshot: snap, settings, scenario } = mesh;
  const sim = settings.meshMode === 'SIMULATION';
  const peers = snap?.peers ?? [];
  const connected = peers.filter(p => p.state === 'CONNECTED');
  const gatewayText = snap?.gatewayCapable
    ? 'This phone (online)'
    : connected.some(p => p.isGateway)
      ? `Nearby: ${connected.filter(p => p.isGateway).map(p => p.name).join(', ')}`
      : 'None reachable yet';

  return (
    <SafeAreaView style={s.root} edges={['bottom']}>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.modeRow}>
          {(['NEARBY', 'SIMULATION'] as const).map(mode => {
            const on = settings.meshMode === mode;
            return (
              <Pressable key={mode} onPress={() => void mesh.setMode(mode)} style={[s.mode, on && (mode === 'SIMULATION' ? s.modeSimOn : s.modeOn)]}
                accessibilityRole="radio" accessibilityState={{ selected: on }}>
                {mode === 'NEARBY' ? <Radio size={18} color={on ? colors.white : colors.navy} /> : <FlaskConical size={18} color={on ? '#92400E' : colors.navy} />}
                <Text style={[s.modeText, on && { color: mode === 'SIMULATION' ? '#92400E' : colors.white }]}>
                  {mode === 'NEARBY' ? 'Real devices' : 'Simulation'}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={s.modeHelp}>
          {sim
            ? 'SIMULATION: virtual phones B and C run the real mesh engine inside this app. Radio links are simulated; uploads to the rescue server are real and labelled SIMULATED on the dashboard.'
            : 'Real devices: Google Nearby Connections over Bluetooth LE, Bluetooth and Wi-Fi. Other phones must have RescueMesh open.'}
        </Text>

        {!sim && mesh.nearbyAvailable === false && (
          <Card style={s.warn}><Text style={s.warnText}>Nearby Connections is not available on this device (needs Google Play services). Use Simulation mode to demonstrate relaying.</Text></Card>
        )}
        {!sim && mesh.nearbyAvailable && mesh.nearbyPermission === false && (
          <Card style={s.warn}>
            <Text style={s.warnText}>Bluetooth / nearby-device permissions are required to find other phones.</Text>
            <Button title="Grant permissions" onPress={() => void mesh.requestNearbyPermissions()} style={{ marginTop: space(3) }} />
          </Card>
        )}

        <Card style={{ marginTop: space(4) }}>
          <NetworkGraph peers={peers} selfGateway={!!snap?.gatewayCapable} />
          <Text style={s.legend}>● You  ● Connected  ● Gateway  ◌ Discovered, not connected</Text>
        </Card>

        <SectionTitle>Status</SectionTitle>
        <Card>
          <Row label="Mode" value={sim ? 'Simulation (labelled)' : 'Nearby Connections'} />
          <Row label="Radio" value={snap?.transportState ?? '—'} />
          <Row label="Connected" value={`${connected.length} device(s)`} />
          <Row label="Discovered" value={`${peers.length} device(s)`} />
          <Row label="Pending msgs" value={String(snap?.pendingCount ?? 0)} />
          <Row label="Carrying" value={`${snap?.relayHoldingCount ?? 0} for others`} />
          <Row label="Last relay" value={timeAgo(snap?.lastRelayAt ?? null)} />
          <Row label="Gateway" value={gatewayText} />
          <Row label="Last upload" value={timeAgo(snap?.lastGatewaySyncAt ?? null)} />
          <Row label="Device ID" value={snap?.identity.deviceId ?? '—'} mono />
          {snap?.lastError ? <Text style={s.err}>{snap.lastError}</Text> : null}
        </Card>

        {peers.length > 0 && (
          <>
            <SectionTitle>Nearby participating devices</SectionTitle>
            <Card>
              {peers.map(p => (
                <Row key={p.peerId} label={p.state === 'CONNECTED' ? 'Connected' : 'Discovered'}
                  value={`${p.name}${p.isGateway ? ' · gateway' : ''}${p.transport === 'SIMULATED' ? ' · simulated' : ''} · ${timeAgo(p.lastSeen)}`} />
              ))}
            </Card>
          </>
        )}

        {sim && scenario && (
          <>
            <SectionTitle>Flood scenario (simulation)</SectionTitle>
            <Card>
              <View style={s.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.switchTitle}>No internet on this phone</Text>
                  <Text style={s.switchSub}>You play Person A, cut off by the flood</Text>
                </View>
                <Switch value={!!snap?.internetSuppressed} onValueChange={v => void mesh.setInternetSuppressed(v)} trackColor={{ true: colors.coral }} />
              </View>
              {STEPS.map(st => (
                <View key={st.step} style={s.switchRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.switchTitle}>{st.title}</Text>
                    <Text style={s.switchSub}>{st.sub}</Text>
                  </View>
                  <Switch value={scenario.steps.includes(st.step)} onValueChange={v => void mesh.setScenarioStep(st.step, v)} trackColor={{ true: colors.blue }} />
                </View>
              ))}
              <Text style={s.scenarioState}>
                Person B holds {scenario.b.holds} SOS · connected to {scenario.b.connected.join(', ') || 'nobody'}{'\n'}
                Person C holds {scenario.c.holds} SOS · {scenario.c.gateway ? 'ONLINE gateway' : 'offline'}{scenario.c.lastError ? ` · ${scenario.c.lastError}` : ''}
              </Text>
              <Text style={s.switchSub}>Demo: send an SOS, then turn the steps on in order. To bring the acknowledgement back to you, turn off “B within range of C” and turn “B within range of you” on again.</Text>
            </Card>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space(5), paddingBottom: space(10) },
  modeRow: { flexDirection: 'row', gap: space(2) },
  mode: { flex: 1, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', minHeight: 50, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white },
  modeOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  modeSimOn: { backgroundColor: '#FDE68A', borderColor: '#F59E0B' },
  modeText: { fontWeight: '700', color: colors.navy },
  modeHelp: { fontSize: 13, color: colors.textMuted, marginTop: space(2), lineHeight: 19 },
  warn: { marginTop: space(3), backgroundColor: colors.amberSoft },
  warnText: { color: colors.amber, fontWeight: '600' },
  legend: { textAlign: 'center', fontSize: 11.5, color: colors.textMuted, marginTop: space(2) },
  err: { color: colors.coralDark, marginTop: space(2), fontSize: 13 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingVertical: space(3), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  switchTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  switchSub: { fontSize: 12.5, color: colors.textMuted, marginTop: 2, lineHeight: 18 },
  scenarioState: { fontSize: 13, color: colors.navy, marginVertical: space(3), lineHeight: 20, fontFamily: 'monospace' },
});
