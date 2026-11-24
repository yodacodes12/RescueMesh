/**
 * Transport abstraction: device discovery, connection, transmission and
 * reception. The engine never knows whether bytes travel over Google Nearby
 * Connections (BLE + Bluetooth + Wi-Fi) or an in-app simulation.
 */
export type TransportKind = 'NEARBY' | 'SIMULATED';

export type TransportEvent =
  | { type: 'peerFound'; peerId: string; name: string; deviceId: string | null }
  | { type: 'peerLost'; peerId: string }
  | { type: 'connected'; peerId: string; name: string; deviceId: string | null }
  | { type: 'disconnected'; peerId: string }
  | { type: 'data'; peerId: string; data: string }
  | { type: 'state'; state: 'STARTING' | 'RUNNING' | 'STOPPED' | 'ERROR'; detail?: string };

export interface Transport {
  readonly kind: TransportKind;
  start(self: { deviceId: string; name: string }): Promise<void>;
  stop(): Promise<void>;
  /** Resolves when the transport accepted the bytes; delivery is confirmed by a RECEIPT packet. */
  send(peerId: string, data: string): Promise<void>;
  onEvent(listener: (e: TransportEvent) => void): () => void;
}

export class Emitter<T> {
  private listeners = new Set<(e: T) => void>();
  on(l: (e: T) => void): () => void {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }
  emit(e: T) {
    for (const l of [...this.listeners]) {
      l(e);
    }
  }
}
