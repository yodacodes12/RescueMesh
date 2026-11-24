/**
 * App-wide state: owns the single MeshEngine, its SQLite store, the active
 * transport (real Nearby or clearly-labelled simulation), connectivity
 * monitoring and the periodic tick.
 */
import NetInfo from '@react-native-community/netinfo';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ToastAndroid, Vibration } from 'react-native';
import { TICK_INTERVAL_MS } from '../config';
import { MeshEngine, type CreateSOSInput, type EngineSnapshot } from '../mesh/core/engine';
import { GatewayClient } from '../mesh/core/gatewayClient';
import { RANK, STATUS_LABEL } from '../mesh/core/status';
import type { StoredMessage } from '../mesh/core/types';
import { FloodScenario, type ScenarioStep } from '../mesh/simulation/FloodScenario';
import { isNearbyAvailable, NearbyTransport } from '../mesh/transports/NearbyTransport';
import { SimulatedNetwork, SimulatedTransport } from '../mesh/transports/SimulatedTransport';
import { requestNearby } from '../services/permissions';
import { loadDeviceId, loadSettings, saveSettings, type MeshMode, type Settings } from '../services/settings';
import { SQLiteStore } from '../storage/SQLiteStore';

export interface ScenarioView {
  steps: ScenarioStep[];
  b: { holds: number; connected: string[] };
  c: { holds: number; connected: string[]; gateway: boolean; lastError: string | null };
}

export interface MeshApi {
  ready: boolean;
  initError: string | null;
  snapshot: EngineSnapshot | null;
  settings: Settings;
  internetReachable: boolean;
  nearbyAvailable: boolean | null;
  nearbyPermission: boolean | null;
  scenario: ScenarioView | null;
  updateSettings(patch: Partial<Settings>): Promise<void>;
  createSOS(input: CreateSOSInput): Promise<StoredMessage>;
  retry(id: string): Promise<void>;
  setMode(mode: MeshMode): Promise<void>;
  setInternetSuppressed(v: boolean): Promise<void>;
  setScenarioStep(step: ScenarioStep, on: boolean): Promise<void>;
  requestNearbyPermissions(): Promise<boolean>;
  /** Small app-level values (e.g. the SOS draft) in the same SQLite database. */
  getKV(key: string): Promise<string | null>;
  setKV(key: string, value: string): Promise<void>;
}

const Ctx = createContext<MeshApi | null>(null);

export function useMesh(): MeshApi {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error('useMesh outside MeshProvider');
  }
  return v;
}

function scenarioView(s: FloodScenario): ScenarioView {
  const b = s.personB.engine.snapshot();
  const c = s.personC.engine.snapshot();
  return {
    steps: [...s.steps],
    b: { holds: b.messages.length, connected: b.peers.filter(p => p.state === 'CONNECTED').map(p => p.name) },
    c: { holds: c.messages.length, connected: c.peers.filter(p => p.state === 'CONNECTED').map(p => p.name), gateway: c.gatewayCapable, lastError: c.lastError },
  };
}

export function MeshProvider({ children }: { children: React.ReactNode }) {
  const engineRef = useRef<MeshEngine | null>(null);
  const storeRef = useRef<SQLiteStore | null>(null);
  const settingsRef = useRef<Settings | null>(null);
  const scenarioRef = useRef<FloodScenario | null>(null);
  const prevStatus = useRef(new Map<string, string>());

  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<EngineSnapshot | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [internetReachable, setInternetReachable] = useState(false);
  const [nearbyAvailable, setNearbyAvailable] = useState<boolean | null>(null);
  const [nearbyPermission, setNearbyPermission] = useState<boolean | null>(null);
  const [scenario, setScenario] = useState<ScenarioView | null>(null);

  /** Notify the user when one of THEIR messages moves forward. */
  const notifyChanges = useCallback((snap: EngineSnapshot) => {
    const prev = prevStatus.current;
    for (const m of snap.messages) {
      if (m.origin !== 'SELF') {
        continue;
      }
      const before = prev.get(m.msg.message_id);
      if (before && before !== m.delivery_status && RANK[m.delivery_status] > RANK[before as keyof typeof RANK]) {
        if (settingsRef.current?.vibrateOnUpdates) {
          Vibration.vibrate([0, 120, 80, 120]);
          ToastAndroid.show(`SOS update: ${STATUS_LABEL[m.delivery_status]}`, ToastAndroid.LONG);
        }
      }
      prev.set(m.msg.message_id, m.delivery_status);
    }
  }, []);

  const applyTransport = useCallback(async (mode: MeshMode) => {
    const engine = engineRef.current!;
    if (scenarioRef.current) {
      await scenarioRef.current.stop();
      scenarioRef.current = null;
      setScenario(null);
    }
    if (mode === 'SIMULATION') {
      const network = new SimulatedNetwork(250);
      const sc = new FloodScenario(engine.identity.deviceId, () => settingsRef.current!.serverUrl, network);
      scenarioRef.current = sc;
      await engine.setTransport(new SimulatedTransport(network));
      await sc.start();
      sc.subscribe(() => setScenario(scenarioView(sc)));
      setScenario(scenarioView(sc));
      // Default for the demo: this phone plays Person A, who has no internet.
      await engine.setInternetSuppressed(true);
      return;
    }
    await engine.setInternetSuppressed(false);
    const available = await isNearbyAvailable();
    setNearbyAvailable(available);
    if (!available) {
      await engine.setTransport(null);
      return;
    }
    const granted = await requestNearby();
    setNearbyPermission(granted);
    await engine.setTransport(granted ? new NearbyTransport() : null);
  }, []);

  // ---- boot
  useEffect(() => {
    let tick: ReturnType<typeof setInterval> | null = null;
    let unsubNet: (() => void) | null = null;
    let unsubEngine: (() => void) | null = null;
    (async () => {
      try {
        const store = await SQLiteStore.open();
        storeRef.current = store;
        const s = await loadSettings(store);
        settingsRef.current = s;
        setSettings(s);
        const deviceId = await loadDeviceId(store);
        const engine = new MeshEngine({
          identity: { deviceId, name: s.name || `RescueMesh ${deviceId.slice(3, 7).toUpperCase()}` },
          store,
          api: new GatewayClient(() => settingsRef.current?.serverUrl ?? ''),
        });
        await engine.init();
        engineRef.current = engine;
        unsubEngine = engine.subscribe(() => {
          const snap = engine.snapshot();
          notifyChanges(snap);
          setSnapshot(snap);
        });
        const first = engine.snapshot();
        first.messages.forEach(m => prevStatus.current.set(m.msg.message_id, m.delivery_status));
        setSnapshot(first);

        unsubNet = NetInfo.addEventListener(st => {
          const reachable = !!st.isConnected && st.isInternetReachable !== false;
          setInternetReachable(reachable);
          void engine.setInternetReachable(reachable);
        });
        await applyTransport(s.meshMode);
        tick = setInterval(() => void engine.tick(), TICK_INTERVAL_MS);
        setReady(true);
      } catch (e) {
        setInitError(String(e));
      }
    })();
    return () => {
      if (tick) {
        clearInterval(tick);
      }
      unsubNet?.();
      unsubEngine?.();
      void scenarioRef.current?.stop();
      void engineRef.current?.setTransport(null);
    };
  }, [applyTransport, notifyChanges]);

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    const next = { ...settingsRef.current!, ...patch };
    settingsRef.current = next;
    setSettings(next);
    await saveSettings(storeRef.current!, next);
    if (patch.serverUrl !== undefined) {
      const e = engineRef.current!;
      e.setApi(new GatewayClient(() => settingsRef.current?.serverUrl ?? ''));
      await e.setInternetReachable(internetReachable);
    }
  }, [internetReachable]);

  const api = useMemo<MeshApi>(() => ({
    ready,
    initError,
    snapshot,
    settings: settings ?? ({} as Settings),
    internetReachable,
    nearbyAvailable,
    nearbyPermission,
    scenario,
    updateSettings,
    createSOS: input => engineRef.current!.createSOS({ ...input, is_simulated: settingsRef.current?.meshMode === 'SIMULATION' }),
    retry: id => engineRef.current!.deliver(id),
    setMode: async mode => {
      await updateSettings({ meshMode: mode });
      await applyTransport(mode);
    },
    setInternetSuppressed: v => engineRef.current!.setInternetSuppressed(v),
    setScenarioStep: async (step, on) => {
      await scenarioRef.current?.setStep(step, on);
    },
    requestNearbyPermissions: async () => {
      const ok = await requestNearby();
      setNearbyPermission(ok);
      if (ok && settingsRef.current?.meshMode === 'NEARBY') {
        await applyTransport('NEARBY');
      }
      return ok;
    },
    getKV: async key => (await storeRef.current?.getKV(key)) || null,
    setKV: async (key, value) => storeRef.current?.setKV(key, value),
  }), [ready, initError, snapshot, settings, internetReachable, nearbyAvailable, nearbyPermission, scenario, updateSettings, applyTransport]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
