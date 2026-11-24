/**
 * SIMULATION ONLY - the hackathon flood scenario with virtual phones.
 *
 *   Person A (this phone, or a virtual one)  --sim radio-->  Person B (relay)
 *   Person B  --sim radio-->  Person C (gets internet -> gateway)  --HTTP-->  backend
 *
 * The *radio links* are simulated. Everything else is real: each virtual
 * phone runs the production MeshEngine with its own store, and Person C
 * uploads to the real backend over real HTTP (flagged is_simulated so the
 * dashboard shows a SIMULATED badge).
 */
import { MeshEngine } from '../core/engine';
import { GatewayClient } from '../core/gatewayClient';
import { InMemoryStore } from '../core/store';
import { SimulatedNetwork, SimulatedTransport } from '../transports/SimulatedTransport';

export type ScenarioStep = 'B_MEETS_A' | 'B_MEETS_C' | 'C_ONLINE';

export interface VirtualPhone {
  label: string;
  engine: MeshEngine;
  transport: SimulatedTransport;
}

function rid() {
  return Math.random().toString(36).slice(2, 8);
}

export class FloodScenario {
  readonly network: SimulatedNetwork;
  readonly personB: VirtualPhone;
  readonly personC: VirtualPhone;
  private timer: ReturnType<typeof setInterval> | null = null;
  readonly steps = new Set<ScenarioStep>();
  private listeners = new Set<() => void>();

  constructor(
    /** Engine of Person A (the real phone's engine, using a SimulatedTransport on `network`). */
    private readonly personAId: string,
    apiBaseUrl: () => string,
    network?: SimulatedNetwork,
    fetchImpl?: ConstructorParameters<typeof GatewayClient>[1],
  ) {
    this.network = network ?? new SimulatedNetwork();
    const make = (label: string, name: string, withApi: boolean): VirtualPhone => {
      const engine = new MeshEngine({
        identity: { deviceId: `sim-${label}-${rid()}`, name },
        store: new InMemoryStore(),
        api: withApi ? new GatewayClient(apiBaseUrl, fetchImpl) : null,
      });
      return { label, engine, transport: new SimulatedTransport(this.network) };
    };
    this.personB = make('b', 'Person B (simulated relay)', false);
    this.personC = make('c', 'Person C (simulated gateway)', true);
  }

  async start() {
    for (const p of [this.personB, this.personC]) {
      await p.engine.init();
      await p.engine.setTransport(p.transport);
      p.engine.subscribe(() => this.emit());
    }
    // Person C starts with no internet; the demo turns it on.
    await this.personC.engine.setInternetReachable(false);
    this.timer = setInterval(() => {
      void this.personB.engine.tick();
      void this.personC.engine.tick();
    }, 3000);
  }

  async stop() {
    if (this.timer) {
      clearInterval(this.timer);
    }
    for (const p of [this.personB, this.personC]) {
      await p.engine.setTransport(null);
    }
  }

  /** Apply a scenario step. Steps can be undone (e.g. B walks out of range). */
  async setStep(step: ScenarioStep, on: boolean) {
    const a = this.personAId;
    const b = this.personB.engine.identity.deviceId;
    const c = this.personC.engine.identity.deviceId;
    if (on) {
      this.steps.add(step);
    } else {
      this.steps.delete(step);
    }
    switch (step) {
      case 'B_MEETS_A':
        on ? this.network.link(a, b) : this.network.unlink(a, b);
        break;
      case 'B_MEETS_C':
        on ? this.network.link(b, c) : this.network.unlink(b, c);
        break;
      case 'C_ONLINE':
        await this.personC.engine.setInternetReachable(on);
        break;
    }
    this.emit();
  }

  subscribe(l: () => void) {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }
  private emit() {
    for (const l of [...this.listeners]) {
      l();
    }
  }
}
