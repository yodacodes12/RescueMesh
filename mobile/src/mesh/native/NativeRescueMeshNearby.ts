/**
 * TurboModule spec for the Kotlin Nearby Connections bridge
 * (android/app/src/main/java/org/rescuemesh/nearby/NearbyModule.kt).
 * React Native codegen generates the Kotlin/Java base class from this file.
 */
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  /** Google Play services with Nearby Connections is present on this device. */
  isAvailable(): Promise<boolean>;
  /** Start advertising + discovery. `endpointName` encodes "<deviceId>|<display name>". */
  start(endpointName: string, serviceId: string): Promise<void>;
  stop(): Promise<void>;
  /** Send a UTF-8 payload (BYTES, max 32 KiB) to a connected endpoint. */
  send(endpointId: string, data: string): Promise<void>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

// `get` (not getEnforcing): returns null in Jest / when the native side is missing,
// and the app then offers the clearly-labelled simulation mode instead.
export default TurboModuleRegistry.get<Spec>('RescueMeshNearby');
