/** User profile + app settings, persisted in the SQLite kv table. */
import type { MessageStore } from '../mesh/core/store';
import { uuidv4 } from '../mesh/core/uuid';
import { DEFAULT_API_URL } from '../config';

export type MeshMode = 'NEARBY' | 'SIMULATION';

export interface Settings {
  name: string;
  phone: string;
  emergencyContact: string;
  serverUrl: string;
  meshMode: MeshMode;
  vibrateOnUpdates: boolean;
  onboarded: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  name: '',
  phone: '',
  emergencyContact: '',
  serverUrl: DEFAULT_API_URL,
  meshMode: 'NEARBY',
  vibrateOnUpdates: true,
  onboarded: false,
};

const KEY = 'settings';
const DEVICE_KEY = 'device_id';

export async function loadSettings(store: MessageStore): Promise<Settings> {
  const raw = await store.getKV(KEY);
  if (!raw) {
    return { ...DEFAULT_SETTINGS };
  }
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(store: MessageStore, s: Settings): Promise<void> {
  await store.setKV(KEY, JSON.stringify(s));
}

/** Stable, random, non-identifying id for this installation. */
export async function loadDeviceId(store: MessageStore): Promise<string> {
  let id = await store.getKV(DEVICE_KEY);
  if (!id) {
    id = `rm-${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    await store.setKV(DEVICE_KEY, id);
  }
  return id;
}
