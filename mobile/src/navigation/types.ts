import type { NavigatorScreenParams } from '@react-navigation/native';

export type TabParamList = {
  Home: undefined;
  Alerts: undefined;
  Map: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Splash: undefined;
  Onboarding: undefined;
  Main: NavigatorScreenParams<TabParamList> | undefined;
  CreateSOS: undefined;
  SOSStatus: { id: string; justCreated?: boolean };
  MeshStatus: undefined;
};
