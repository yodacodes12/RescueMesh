import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { History, House, Map as MapIcon, User } from 'lucide-react-native';
import React from 'react';
import { AlertHistoryScreen } from '../screens/AlertHistoryScreen';
import { CreateSOSScreen } from '../screens/CreateSOSScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { MapScreen } from '../screens/MapScreen';
import { MeshStatusScreen } from '../screens/MeshStatusScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { SOSStatusScreen } from '../screens/SOSStatusScreen';
import { SplashScreen } from '../screens/SplashScreen';
import { useMesh } from '../state/MeshContext';
import { colors } from '../theme';
import type { RootStackParamList, TabParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<TabParamList>();

const theme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, primary: colors.blue, background: colors.white } };

function MainTabs() {
  const { snapshot } = useMesh();
  const pending = snapshot?.messages.filter(m => m.origin === 'SELF' && ['CREATED_LOCAL', 'SEND_FAILED', 'RELAYED', 'GATEWAY_REACHED'].includes(m.delivery_status)).length ?? 0;
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.blue,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        tabBarStyle: { height: 64, paddingTop: 6, paddingBottom: 8 },
      }}>
      <Tabs.Screen name="Home" component={HomeScreen} options={{ tabBarIcon: ({ color }) => <House color={color} size={24} /> }} />
      <Tabs.Screen name="Alerts" component={AlertHistoryScreen}
        options={{ tabBarIcon: ({ color }) => <History color={color} size={24} />, tabBarBadge: pending || undefined, tabBarBadgeStyle: { backgroundColor: colors.coral } }} />
      <Tabs.Screen name="Map" component={MapScreen} options={{ tabBarIcon: ({ color }) => <MapIcon color={color} size={24} /> }} />
      <Tabs.Screen name="Profile" component={ProfileScreen} options={{ tabBarIcon: ({ color }) => <User color={color} size={24} /> }} />
    </Tabs.Navigator>
  );
}

export function RootNavigator() {
  return (
    <NavigationContainer theme={theme}>
      <Stack.Navigator
        initialRouteName="Splash"
        screenOptions={{ headerTintColor: colors.white, headerStyle: { backgroundColor: colors.navy }, headerTitleStyle: { fontWeight: '700' } }}>
        <Stack.Screen name="Splash" component={SplashScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
        <Stack.Screen name="CreateSOS" component={CreateSOSScreen}
          options={{ title: 'Create SOS', headerStyle: { backgroundColor: colors.coral } }} />
        <Stack.Screen name="SOSStatus" component={SOSStatusScreen} options={{ title: 'SOS status' }} />
        <Stack.Screen name="MeshStatus" component={MeshStatusScreen} options={{ title: 'Mesh network' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
