/**
 * RescueMesh - offline-first emergency communication.
 */
import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { MeshProvider } from './src/state/MeshContext';

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      <MeshProvider>
        <RootNavigator />
      </MeshProvider>
    </SafeAreaProvider>
  );
}
