/** Persistence boundary of the mesh engine (SQLite on Android, memory in tests/simulation). */
import type { StoredMessage } from './types';

export interface MessageStore {
  get(id: string): Promise<StoredMessage | null>;
  /** Must be durable when the promise resolves: store-before-forward relies on it. */
  put(m: StoredMessage): Promise<void>;
  list(): Promise<StoredMessage[]>;
  getKV(key: string): Promise<string | null>;
  setKV(key: string, value: string): Promise<void>;
}

/** Deep-copies on read/write so callers can never mutate stored state by accident. */
export class InMemoryStore implements MessageStore {
  private messages = new Map<string, string>();
  private kv = new Map<string, string>();

  async get(id: string) {
    const s = this.messages.get(id);
    return s ? (JSON.parse(s) as StoredMessage) : null;
  }
  async put(m: StoredMessage) {
    this.messages.set(m.msg.message_id, JSON.stringify(m));
  }
  async list() {
    return [...this.messages.values()].map(s => JSON.parse(s) as StoredMessage);
  }
  async getKV(key: string) {
    return this.kv.get(key) ?? null;
  }
  async setKV(key: string, value: string) {
    this.kv.set(key, value);
  }
}
