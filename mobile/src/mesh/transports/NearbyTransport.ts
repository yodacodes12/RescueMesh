/**
 * REAL device-to-device transport: Google Nearby Connections via the Kotlin
 * TurboModule in android/app/src/main/java/org/rescuemesh/nearby/.
 * Requires Google Play services and runtime Bluetooth/Wi-Fi/location
 * permissions (see services/permissions.ts).
 */
import { DeviceEventEmitter } from 'react-native';
import { SERVICE_ID } from '../core/constants';
import { Emitter, type Transport, type TransportEvent } from '../core/transport';
import NativeNearby from '../native/NativeRescueMeshNearby';

const EVENT = 'RescueMeshNearbyEvent';

export async function isNearbyAvailable(): Promise<boolean> {
  if (!NativeNearby) {
    return false;
  }
  try {
    return await NativeNearby.isAvailable();
  } catch {
    return false;
  }
}

export class NearbyTransport implements Transport {
  readonly kind = 'NEARBY' as const;
  private events = new Emitter<TransportEvent>();
  private sub: { remove(): void } | null = null;

  async start(self: { deviceId: string; name: string }) {
    if (!NativeNearby) {
      throw new Error('Nearby native module not available in this build');
    }
    this.sub = DeviceEventEmitter.addListener(EVENT, (e: Record<string, string>) => this.onNative(e));
    // '|' separates id and name inside the advertised endpoint name.
    const safeName = self.name.replace(/\|/g, '/').slice(0, 40);
    await NativeNearby.start(`${self.deviceId}|${safeName}`, SERVICE_ID);
  }

  async stop() {
    try {
      await NativeNearby?.stop();
    } finally {
      this.sub?.remove();
      this.sub = null;
    }
  }

  async send(peerId: string, data: string) {
    if (!NativeNearby) {
      throw new Error('Nearby unavailable');
    }
    await NativeNearby.send(peerId, data);
  }

  onEvent(l: (e: TransportEvent) => void) {
    return this.events.on(l);
  }

  private onNative(e: Record<string, string>) {
    switch (e.type) {
      case 'peerFound':
      case 'connected':
        this.events.emit({ type: e.type, peerId: e.peerId, name: e.name ?? e.peerId, deviceId: e.deviceId ?? null });
        break;
      case 'peerLost':
      case 'disconnected':
        this.events.emit({ type: e.type, peerId: e.peerId });
        break;
      case 'data':
        this.events.emit({ type: 'data', peerId: e.peerId, data: e.data });
        break;
      case 'state':
        this.events.emit({ type: 'state', state: e.state as 'RUNNING', detail: e.detail });
        break;
    }
  }
}
