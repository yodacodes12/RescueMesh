import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Radio, Server, Siren } from 'lucide-react-native';
import React, { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Logo } from '../components/Logo';
import { Button } from '../components/ui';
import type { RootStackParamList } from '../navigation/types';
import { useMesh } from '../state/MeshContext';
import { colors, radius, space } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;

const STEPS = [
  { Icon: Siren, color: colors.coral, title: 'Send emergency SOS alerts', body: 'Report what is happening, how urgent it is and where you are — even with no signal. Your SOS is saved on your phone first.' },
  { Icon: Radio, color: colors.blue, title: 'Connect through nearby phones', body: 'Phones running RescueMesh pass your SOS to each other over Bluetooth and Wi-Fi, hop by hop, without internet.' },
  { Icon: Server, color: colors.green, title: 'Reach rescue coordinators', body: 'As soon as any phone in the chain gets internet, it uploads the SOS. You see when coordinators receive and act on it.' },
];

export function OnboardingScreen({ navigation }: Props) {
  const { updateSettings, settings } = useMesh();
  const [name, setName] = useState(settings.name ?? '');

  async function start() {
    await updateSettings({ onboarded: true, name: name.trim() });
    navigation.replace('Main');
  }

  return (
    <SafeAreaView style={s.root}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView contentContainerStyle={s.content}>
          <View style={s.header}>
            <Logo size={64} />
            <Text style={s.h1}>Welcome to RescueMesh</Text>
            <Text style={s.lead}>An emergency network that keeps working when mobile networks go down.</Text>
          </View>
          {STEPS.map(({ Icon, color, title, body }, i) => (
            <View key={title} style={s.step}>
              <View style={[s.stepIcon, { backgroundColor: `${color}1A` }]}><Icon size={26} color={color} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.stepNo}>STEP {i + 1}</Text>
                <Text style={s.stepTitle}>{title}</Text>
                <Text style={s.stepBody}>{body}</Text>
              </View>
            </View>
          ))}
          <Text style={s.label}>Your name (shown to rescuers, optional)</Text>
          <TextInput value={name} onChangeText={setName} placeholder="e.g. Asha Varghese" style={s.input} maxLength={60} placeholderTextColor={colors.textMuted} />
          <Button title="Get Started" onPress={start} style={{ marginTop: space(6) }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  content: { padding: space(6) },
  header: { alignItems: 'center', marginBottom: space(6) },
  h1: { fontSize: 26, fontWeight: '800', color: colors.navy, marginTop: space(3) },
  lead: { fontSize: 15, color: colors.textMuted, textAlign: 'center', marginTop: space(2), lineHeight: 22 },
  step: { flexDirection: 'row', gap: space(4), backgroundColor: colors.bg, borderRadius: radius.lg, padding: space(4), marginBottom: space(3) },
  stepIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  stepNo: { fontSize: 11, fontWeight: '800', color: colors.blue, letterSpacing: 1 },
  stepTitle: { fontSize: 17, fontWeight: '700', color: colors.navy, marginTop: 2 },
  stepBody: { fontSize: 14, color: colors.textMuted, marginTop: 4, lineHeight: 20 },
  label: { marginTop: space(4), fontSize: 14, fontWeight: '600', color: colors.text },
  input: { marginTop: space(2), borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space(4), height: 52, fontSize: 16, color: colors.text },
});
