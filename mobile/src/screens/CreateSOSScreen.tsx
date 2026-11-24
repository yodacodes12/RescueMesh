import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Clock, MapPin, Save, Send } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TYPE_LABEL, TypeIcon } from '../components/emergency';
import { Button, Card } from '../components/ui';
import { MAX_DESCRIPTION_LENGTH } from '../mesh/core/constants';
import { PRIORITY_DESCRIPTION, SUGGESTED_PRIORITY } from '../mesh/core/priority';
import type { EmergencyType, Priority } from '../mesh/core/types';
import type { RootStackParamList } from '../navigation/types';
import { captureLocation, type Fix } from '../services/location';
import { useMesh } from '../state/MeshContext';
import { colors, priorityColor, radius, space } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'CreateSOS'>;

const TYPES: EmergencyType[] = ['MEDICAL', 'TRAPPED', 'FIRE', 'FLOOD', 'OTHER'];
const PRIORITIES: Priority[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const DRAFT_KEY = 'sos_draft';

interface Draft {
  type: EmergencyType | null;
  priority: Priority | null;
  description: string;
  people: string;
  fix: Fix | null;
}

export function CreateSOSScreen({ navigation }: Props) {
  const { createSOS, snapshot, getKV, setKV } = useMesh();
  const [type, setType] = useState<EmergencyType | null>(null);
  const [priority, setPriority] = useState<Priority | null>(null);
  const [priorityTouched, setPriorityTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [people, setPeople] = useState('');
  const [fix, setFix] = useState<Fix | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [now, setNow] = useState(new Date());
  const [draftNote, setDraftNote] = useState<string | null>(null);

  // Live timestamp, and restore a saved draft.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const getDraft = async (): Promise<Draft | null> => {
    const raw = await getKV(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Draft) : null;
  };
  const setDraft = (d: Draft | null) => setKV(DRAFT_KEY, d ? JSON.stringify(d) : '');
  useEffect(() => {
    getDraft().then(d => {
      if (!d) {
        return;
      }
      setType(d.type);
      setPriority(d.priority);
      setPriorityTouched(!!d.priority);
      setDescription(d.description);
      setPeople(d.people);
      setFix(d.fix);
      setDraftNote('Draft restored');
    });
    // Capture location immediately: in an emergency, every second matters.
    void locate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function locate() {
    setLocating(true);
    setLocError(null);
    try {
      setFix(await captureLocation());
    } catch (e) {
      setLocError((e as Error).message);
    } finally {
      setLocating(false);
    }
  }

  function chooseType(t: EmergencyType) {
    setType(t);
    if (!priorityTouched) {
      setPriority(SUGGESTED_PRIORITY[t]);
    }
  }

  async function saveDraft() {
    await setDraft({ type, priority, description, people, fix });
    setDraftNote(`Draft saved on this device at ${new Date().toLocaleTimeString()}. It has NOT been sent.`);
  }

  async function send() {
    if (!type || !priority) {
      Alert.alert('Choose the emergency', 'Select an emergency category and priority first.');
      return;
    }
    const n = people.trim() ? parseInt(people, 10) : null;
    if (n !== null && (!Number.isFinite(n) || n < 1 || n > 100000)) {
      Alert.alert('People affected', 'Enter a number between 1 and 100000, or leave it empty.');
      return;
    }
    if (!fix) {
      const go = await new Promise<boolean>(resolve =>
        Alert.alert('No GPS location', 'Rescuers will not see where you are. Send anyway? Add landmarks in the description.', [
          { text: 'Try GPS again', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Send without location', style: 'destructive', onPress: () => resolve(true) },
        ]),
      );
      if (!go) {
        void locate();
        return;
      }
    }
    setSending(true);
    try {
      const m = await createSOS({
        emergency_type: type,
        priority,
        latitude: fix?.latitude ?? null,
        longitude: fix?.longitude ?? null,
        location_accuracy_m: fix?.accuracy ?? null,
        description,
        people_affected: n,
      });
      await setDraft(null);
      navigation.replace('SOSStatus', { id: m.msg.message_id, justCreated: true });
    } catch (e) {
      Alert.alert('Could not save SOS', String(e));
      setSending(false);
    }
  }

  const online = !!snapshot?.gatewayCapable;

  return (
    <SafeAreaView style={s.root} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <View style={[s.modeBanner, { backgroundColor: online ? colors.greenSoft : colors.amberSoft }]}>
            <Text style={{ color: online ? colors.green : colors.amber, fontWeight: '700' }}>
              {online ? 'Online: your SOS will be sent directly to the rescue server.' : 'Offline: your SOS will be saved and passed to nearby RescueMesh phones.'}
            </Text>
          </View>

          <Text style={s.label}>Emergency category</Text>
          <View style={s.grid}>
            {TYPES.map(t => {
              const on = type === t;
              return (
                <Pressable key={t} onPress={() => chooseType(t)} accessibilityRole="radio" accessibilityState={{ selected: on }}
                  style={[s.typeChip, on && s.typeChipOn]}>
                  <TypeIcon type={t} color={on ? colors.white : colors.navy} size={26} />
                  <Text style={[s.typeText, on && { color: colors.white }]}>{TYPE_LABEL[t]}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={s.label}>Priority</Text>
          <View style={s.prioRow}>
            {PRIORITIES.map(p => {
              const on = priority === p;
              return (
                <Pressable key={p} onPress={() => { setPriority(p); setPriorityTouched(true); }} accessibilityRole="radio" accessibilityState={{ selected: on }}
                  style={[s.prio, { borderColor: priorityColor[p] }, on && { backgroundColor: priorityColor[p] }]}>
                  <Text style={[s.prioText, { color: on ? colors.white : priorityColor[p] }]}>{p}</Text>
                </Pressable>
              );
            })}
          </View>
          {priority && <Text style={s.help}>{PRIORITY_DESCRIPTION[priority]}{!priorityTouched ? ' (suggested)' : ''}</Text>}

          <Text style={s.label}>Current GPS location</Text>
          <Card style={s.locCard}>
            <MapPin size={22} color={fix ? colors.green : colors.textMuted} />
            <View style={{ flex: 1 }}>
              {locating ? (
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><ActivityIndicator color={colors.blue} /><Text>Getting GPS fix…</Text></View>
              ) : fix ? (
                <>
                  <Text style={s.coords}>{fix.latitude.toFixed(5)}, {fix.longitude.toFixed(5)}</Text>
                  <Text style={s.help}>Accuracy ±{fix.accuracy ? Math.round(fix.accuracy) : '?'} m · {new Date(fix.at).toLocaleTimeString()}</Text>
                </>
              ) : (
                <Text style={{ color: colors.coralDark }}>{locError ?? 'No location yet'}</Text>
              )}
            </View>
          </Card>
          <Button title="Capture Location" variant="ghost" onPress={locate} disabled={locating} icon={<MapPin size={18} color={colors.navy} />} style={{ marginTop: space(2) }} />

          <Text style={s.label}>What is happening?</Text>
          <TextInput value={description} onChangeText={setDescription} multiline maxLength={MAX_DESCRIPTION_LENGTH}
            placeholder="e.g. Water at chest level, 2 children and grandmother on roof. Blue house next to temple."
            placeholderTextColor={colors.textMuted} style={[s.input, s.textarea]} />
          <Text style={s.counter}>{description.length}/{MAX_DESCRIPTION_LENGTH}</Text>

          <Text style={s.label}>People affected (optional)</Text>
          <TextInput value={people} onChangeText={t => setPeople(t.replace(/[^0-9]/g, ''))} keyboardType="number-pad" maxLength={6}
            placeholder="e.g. 4" placeholderTextColor={colors.textMuted} style={s.input} />

          <View style={s.tsRow}><Clock size={16} color={colors.textMuted} /><Text style={s.help}>Timestamp: {now.toLocaleString()}</Text></View>
          {draftNote && <Text style={s.draftNote}>{draftNote}</Text>}

          <View style={s.actions}>
            <Button title="Save draft" variant="ghost" onPress={saveDraft} icon={<Save size={18} color={colors.navy} />} style={{ flex: 1 }}
              accessibilityHint="Keeps the form on this phone without sending it" />
            <Button title="Send SOS" variant="danger" onPress={send} loading={sending} icon={<Send size={18} color={colors.white} />} style={{ flex: 1.4 }} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  content: { padding: space(5), paddingBottom: space(10) },
  modeBanner: { borderRadius: radius.md, padding: space(3) },
  label: { fontSize: 15, fontWeight: '700', color: colors.navy, marginTop: space(5), marginBottom: space(2) },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  typeChip: { width: '31%', flexGrow: 1, minHeight: 78, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.white },
  typeChipOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  typeText: { fontSize: 14, fontWeight: '700', color: colors.navy },
  prioRow: { flexDirection: 'row', gap: space(2) },
  prio: { flex: 1, minHeight: 46, borderRadius: radius.md, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  prioText: { fontSize: 12.5, fontWeight: '800' },
  help: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
  locCard: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  coords: { fontSize: 16, fontWeight: '700', color: colors.text, fontFamily: 'monospace' },
  input: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space(4), minHeight: 52, fontSize: 16, color: colors.text },
  textarea: { minHeight: 110, textAlignVertical: 'top', paddingTop: space(3) },
  counter: { alignSelf: 'flex-end', fontSize: 12, color: colors.textMuted, marginTop: 4 },
  tsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space(4) },
  draftNote: { marginTop: space(2), color: colors.blue, fontSize: 13 },
  actions: { flexDirection: 'row', gap: space(3), marginTop: space(6) },
});
