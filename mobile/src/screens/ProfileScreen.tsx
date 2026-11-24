import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { Bluetooth, MapPin } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Linking, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Row, SectionTitle } from '../components/ui';
import { GatewayClient } from '../mesh/core/gatewayClient';
import type { RootStackParamList, TabParamList } from '../navigation/types';
import { getPermissionSummary, requestLocation, type PermissionSummary } from '../services/permissions';
import { useMesh } from '../state/MeshContext';
import { colors, radius, space } from '../theme';

type Props = CompositeScreenProps<BottomTabScreenProps<TabParamList, 'Profile'>, NativeStackScreenProps<RootStackParamList>>;

export function ProfileScreen({ navigation }: Props) {
  const mesh = useMesh();
  const { settings } = mesh;
  const [name, setName] = useState(settings.name);
  const [phone, setPhone] = useState(settings.phone);
  const [contact, setContact] = useState(settings.emergencyContact);
  const [server, setServer] = useState(settings.serverUrl);
  const [saved, setSaved] = useState<string | null>(null);
  const [perm, setPerm] = useState<PermissionSummary | null>(null);
  const [test, setTest] = useState<string | null>(null);

  useFocusEffect(useCallback(() => { void getPermissionSummary().then(setPerm); }, []));

  async function save() {
    const url = server.trim().replace(/\/+$/, '');
    if (!/^https?:\/\/[^\s]+$/.test(url)) {
      setSaved('Server URL must start with http:// or https://');
      return;
    }
    await mesh.updateSettings({ name: name.trim(), phone: phone.trim(), emergencyContact: contact.trim(), serverUrl: url });
    setSaved('Saved. A new display name is used for SOS created after the next app restart.');
  }

  async function testServer() {
    setTest('Testing…');
    const ok = await new GatewayClient(() => server.trim()).health();
    setTest(ok ? '✓ RescueMesh server reachable' : '✗ Not reachable (check URL, Wi-Fi, and that the backend is running)');
  }

  const permText = (s?: string) => (s === 'granted' ? 'Granted' : s === 'denied' ? 'Not granted' : 'Unknown');

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <Text style={s.h1}>Profile & settings</Text>

          <SectionTitle>Profile</SectionTitle>
          <Card>
            <Field label="Your name" value={name} onChange={setName} placeholder="Shown to rescuers with your SOS" />
            <Field label="Phone number (optional)" value={phone} onChange={setPhone} placeholder="+91 …" keyboard="phone-pad" />
            <Field label="Emergency contact" value={contact} onChange={setContact} placeholder="Name and phone of a family member" />
            <Text style={s.note}>Phone and emergency contact stay on this phone. They are not included in SOS messages.</Text>
          </Card>

          <SectionTitle>Permissions</SectionTitle>
          <Card>
            <View style={s.permRow}>
              <MapPin size={20} color={perm?.location === 'granted' ? colors.green : colors.coralDark} />
              <Text style={s.permLabel}>Location</Text>
              <Text style={[s.permState, { color: perm?.location === 'granted' ? colors.green : colors.coralDark }]}>{permText(perm?.location)}</Text>
            </View>
            {perm?.location !== 'granted' && <Button title="Allow location" variant="ghost" onPress={() => void requestLocation().then(() => getPermissionSummary().then(setPerm))} style={s.permBtn} />}
            <View style={s.permRow}>
              <Bluetooth size={20} color={perm?.bluetooth === 'granted' ? colors.green : colors.coralDark} />
              <Text style={s.permLabel}>Bluetooth & nearby devices</Text>
              <Text style={[s.permState, { color: perm?.bluetooth === 'granted' ? colors.green : colors.coralDark }]}>{permText(perm?.bluetooth)}</Text>
            </View>
            {perm?.bluetooth !== 'granted' && <Button title="Allow nearby devices" variant="ghost" onPress={() => void mesh.requestNearbyPermissions().then(() => getPermissionSummary().then(setPerm))} style={s.permBtn} />}
            <Text style={s.link} onPress={() => void Linking.openSettings()}>Open Android app settings</Text>
          </Card>

          <SectionTitle>Notifications</SectionTitle>
          <Card>
            <View style={s.permRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.permLabel}>Alert me when my SOS status changes</Text>
                <Text style={s.note}>Vibrates and shows a message when your SOS is relayed, received, acknowledged or assigned.</Text>
              </View>
              <Switch value={settings.vibrateOnUpdates} onValueChange={v => void mesh.updateSettings({ vibrateOnUpdates: v })} trackColor={{ true: colors.blue }} />
            </View>
          </Card>

          <SectionTitle>Application settings</SectionTitle>
          <Card>
            <Field label="Rescue server URL" value={server} onChange={setServer} placeholder="http://192.168.1.20:8000" keyboard="url" />
            <Button title="Test connection" variant="ghost" onPress={testServer} style={{ minHeight: 44 }} />
            {test && <Text style={s.note}>{test}</Text>}
            <View style={{ height: space(3) }} />
            <Row label="Mesh mode" value={settings.meshMode === 'SIMULATION' ? 'Simulation' : 'Real devices (Nearby)'} />
            <Row label="Device ID" value={mesh.snapshot?.identity.deviceId ?? '—'} mono />
            <Button title="Mesh network & mode" variant="ghost" onPress={() => navigation.navigate('MeshStatus')} style={{ marginTop: space(3), minHeight: 44 }} />
          </Card>

          <Button title="Save" onPress={save} style={{ marginTop: space(5) }} />
          {saved && <Text style={[s.saved, !saved.startsWith('Saved') && { color: colors.coralDark }]}>{saved}</Text>}
          <Text style={s.version}>RescueMesh prototype 0.1.0</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, value, onChange, placeholder, keyboard }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; keyboard?: 'phone-pad' | 'url';
}) {
  return (
    <View style={{ marginBottom: space(3) }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.textMuted}
        keyboardType={keyboard === 'phone-pad' ? 'phone-pad' : keyboard === 'url' ? 'url' : 'default'}
        autoCapitalize={keyboard === 'url' ? 'none' : 'words'} autoCorrect={false} style={s.input} maxLength={120} />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space(5), paddingBottom: space(12) },
  h1: { fontSize: 24, fontWeight: '800', color: colors.navy },
  fieldLabel: { fontSize: 13.5, fontWeight: '600', color: colors.text, marginBottom: 6 },
  input: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space(3), height: 48, fontSize: 15.5, color: colors.text, backgroundColor: colors.white },
  note: { fontSize: 12.5, color: colors.textMuted, marginTop: 4, lineHeight: 18 },
  permRow: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingVertical: space(2) },
  permLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  permState: { fontWeight: '700' },
  permBtn: { minHeight: 42, marginBottom: space(2) },
  link: { color: colors.blue, fontWeight: '700', marginTop: space(2) },
  saved: { marginTop: space(3), color: colors.green, textAlign: 'center' },
  version: { marginTop: space(6), color: colors.textMuted, textAlign: 'center', fontSize: 12 },
});
