import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AlertListItem } from '../components/AlertListItem';
import type { RootStackParamList, TabParamList } from '../navigation/types';
import { useMesh } from '../state/MeshContext';
import { colors, radius, space } from '../theme';

type Props = CompositeScreenProps<BottomTabScreenProps<TabParamList, 'Alerts'>, NativeStackScreenProps<RootStackParamList>>;

export function AlertHistoryScreen({ navigation }: Props) {
  const { snapshot } = useMesh();
  const [tab, setTab] = useState<'SELF' | 'RELAY'>('SELF');
  const all = snapshot?.messages ?? [];
  const data = all.filter(m => m.origin === tab);
  const count = (o: 'SELF' | 'RELAY') => all.filter(m => m.origin === o).length;

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <Text style={s.h1}>Alert history</Text>
      <View style={s.seg}>
        {(['SELF', 'RELAY'] as const).map(t => (
          <Pressable key={t} onPress={() => setTab(t)} style={[s.segBtn, tab === t && s.segOn]} accessibilityRole="tab" accessibilityState={{ selected: tab === t }}>
            <Text style={[s.segText, tab === t && { color: colors.white }]}>
              {t === 'SELF' ? 'My SOS' : 'Carrying for others'} ({count(t)})
            </Text>
          </Pressable>
        ))}
      </View>
      <FlatList
        data={data}
        keyExtractor={m => m.msg.message_id}
        contentContainerStyle={s.list}
        renderItem={({ item }) => <AlertListItem m={item} onPress={() => navigation.navigate('SOSStatus', { id: item.msg.message_id })} />}
        ListEmptyComponent={
          <Text style={s.empty}>
            {tab === 'SELF'
              ? 'No SOS alerts sent from this phone yet.'
              : 'This phone is not carrying any SOS for other people. When a nearby RescueMesh phone shares an alert, it is stored here and forwarded until it reaches a gateway.'}
          </Text>
        }
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  h1: { fontSize: 24, fontWeight: '800', color: colors.navy, paddingHorizontal: space(5), paddingTop: space(4) },
  seg: { flexDirection: 'row', margin: space(5), marginBottom: space(3), backgroundColor: colors.bg, borderRadius: radius.md, padding: 4 },
  segBtn: { flex: 1, paddingVertical: space(3), borderRadius: radius.sm, alignItems: 'center' },
  segOn: { backgroundColor: colors.navy },
  segText: { fontWeight: '700', color: colors.navy, fontSize: 13.5 },
  list: { paddingHorizontal: space(5), paddingBottom: space(10) },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: space(10), lineHeight: 21, paddingHorizontal: space(4) },
});
