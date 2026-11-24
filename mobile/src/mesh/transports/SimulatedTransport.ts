/**
 * SIMULATION ONLY - in-process "radio" used to demonstrate multi-hop
 * forwarding with a single phone (or in Node tests). Bytes are passed between
 * MeshEngine instances in memory; nothing is transmitted over the air.
 * Every hop made through this transport is recorded as transport=SIMULATED
 * and messages are flagged is_simulated, so the dashboard labels them.
 */
import { Emitter, type Transport, type TransportEvent } from '../core/transport';

export class SimulatedNetwork {
  private nodes = new Map<string, SimulatedTransport>();
  private links = new Set<string>();
  constructor(public latencyMs = 150) {}

  private key(a: string, b: string) {
    return [a, b].sort().join('|');
  }

  register(t: SimulatedTransport) {
    this.nodes.set(t.deviceId, t);
  }
  unregister(t: SimulatedTransport) {
    for (const other of this.nodes.keys()) {
      this.unlink(t.deviceId, other);
    }
    this.nodes.delete(t.deviceId);
  }

  isLinked(a: string, b: string) {
    return this.links.has(this.key(a, b));
  }

  /** Bring two simulated devices into "radio range" and connect them. */
  link(a: string, b: string) {
    const A = this.nodes.get(a);
    const B = this.nodes.get(b);
    if (!A || !B || this.isLinked(a, b)) {
      return;
    }
    this.links.add(this.key(a, b));
    for (const [x, y] of [[A, B], [B, A]] as const) {
      x.emitEvent({ type: 'peerFound', peerId: y.deviceId, name: y.name, deviceId: y.deviceId });
      x.emitEvent({ type: 'connected', peerId: y.deviceId, name: y.name, deviceId: y.deviceId });
    }
  }

  unlink(a: string, b: string) {
    if (!this.links.delete(this.key(a, b))) {
      return;
    }
    for (const [x, y] of [[a, b], [b, a]]) {
      const n = this.nodes.get(x);
      n?.emitEvent({ type: 'disconnected', peerId: y });
      n?.emitEvent({ type: 'peerLost', peerId: y });
    }
  }

  deliver(from: string, to: string, data: string) {
    if (!this.isLinked(from, to)) {
      throw new Error(`simulated link ${from} -> ${to} is down`);
    }
    const target = this.nodes.get(to);
    setTimeout(() => {
      if (this.isLinked(from, to)) {
        target?.emitEvent({ type: 'data', peerId: from, data });
      }
    }, this.latencyMs);
  }
}

export class SimulatedTransport implements Transport {
  readonly kind = 'SIMULATED' as const;
  deviceId = '';
  name = '';
  private events = new Emitter<TransportEvent>();

  constructor(private readonly network: SimulatedNetwork) {}

  async start(self: { deviceId: string; name: string }) {
    this.deviceId = self.deviceId;
    this.name = self.name;
    this.network.register(this);
    this.emitEvent({ type: 'state', state: 'RUNNING', detail: 'Simulation' });
  }
  async stop() {
    this.network.unregister(this);
    this.emitEvent({ type: 'state', state: 'STOPPED' });
  }
  async send(peerId: string, data: string) {
    this.network.deliver(this.deviceId, peerId, data);
  }
  onEvent(l: (e: TransportEvent) => void) {
    return this.events.on(l);
  }
  emitEvent(e: TransportEvent) {
    this.events.emit(e);
  }
}
