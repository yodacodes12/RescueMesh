import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Logo } from '../components/Logo';
import type { RootStackParamList } from '../navigation/types';
import { useMesh } from '../state/MeshContext';
import { colors } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Splash'>;

export function SplashScreen({ navigation }: Props) {
  const { ready, initError, settings } = useMesh();
  const pulse = useRef(new Animated.Value(0)).current;
  const dots = useRef([0, 1, 2].map(() => new Animated.Value(0.3))).current;
  const started = useRef(Date.now());

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ])).start();
    Animated.loop(Animated.stagger(200, dots.map(d => Animated.sequence([
      Animated.timing(d, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(d, { toValue: 0.3, duration: 300, useNativeDriver: true }),
    ])))).start();
  }, [pulse, dots]);

  useEffect(() => {
    if (!ready) {
      return;
    }
    const wait = Math.max(0, 1600 - (Date.now() - started.current));
    const t = setTimeout(() => navigation.replace(settings.onboarded ? 'Main' : 'Onboarding'), wait);
    return () => clearTimeout(t);
  }, [ready, settings.onboarded, navigation]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const ring = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0] });
  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] });

  return (
    <View style={s.root}>
      <View style={s.logoWrap}>
        <Animated.View style={[s.ring, { opacity: ring, transform: [{ scale: ringScale }] }]} />
        <Animated.View style={{ transform: [{ scale }] }}><Logo size={120} /></Animated.View>
      </View>
      <Text style={s.title}>RescueMesh</Text>
      <Text style={s.tagline}>When Networks Fail,{'\n'}Communities Become the Network.</Text>
      {initError ? (
        <Text style={s.error}>Could not start: {initError}</Text>
      ) : (
        <View style={s.dots}>
          {dots.map((d, i) => <Animated.View key={i} style={[s.dot, { opacity: d }]} />)}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center', padding: 32 },
  logoWrap: { alignItems: 'center', justifyContent: 'center', width: 200, height: 200 },
  ring: { position: 'absolute', width: 150, height: 150, borderRadius: 75, backgroundColor: colors.blue },
  title: { marginTop: 12, fontSize: 36, fontWeight: '800', color: colors.white, letterSpacing: 0.5 },
  tagline: { marginTop: 10, fontSize: 16, lineHeight: 24, textAlign: 'center', color: '#BFD3FF' },
  dots: { flexDirection: 'row', gap: 10, marginTop: 48 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.coral },
  error: { marginTop: 32, color: colors.coral, textAlign: 'center' },
});
