/**
 * SQLite persistence (op-sqlite) for the mesh engine.
 *
 * The message table keeps a few indexed columns for querying plus the full
 * StoredMessage as JSON. `message_id` is the PRIMARY KEY, so the database
 * itself refuses a second copy of the same SOS.
 * The database lives in the app's private storage (not readable by other apps).
 */
import { open, type DB } from '@op-engineering/op-sqlite';
import type { MessageStore } from '../mesh/core/store';
import type { StoredMessage } from '../mesh/core/types';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS messages (
     message_id TEXT PRIMARY KEY NOT NULL,
     origin TEXT NOT NULL,
     priority TEXT NOT NULL,
     delivery_status TEXT NOT NULL,
     created_at TEXT NOT NULL,
     expiry_at TEXT NOT NULL,
     data TEXT NOT NULL,
     updated_at TEXT NOT NULL
   )`,
  'CREATE INDEX IF NOT EXISTS ix_messages_status ON messages(delivery_status)',
  'CREATE INDEX IF NOT EXISTS ix_messages_created ON messages(created_at)',
  'CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)',
];

export class SQLiteStore implements MessageStore {
  private constructor(private readonly db: DB) {}

  static async open(name = 'rescuemesh.sqlite'): Promise<SQLiteStore> {
    const db = open({ name });
    for (const sql of SCHEMA) {
      await db.execute(sql);
    }
    return new SQLiteStore(db);
  }

  async get(id: string): Promise<StoredMessage | null> {
    const r = await this.db.execute('SELECT data FROM messages WHERE message_id = ?', [id]);
    const row = r.rows[0];
    return row ? (JSON.parse(String(row.data)) as StoredMessage) : null;
  }

  async put(m: StoredMessage): Promise<void> {
    await this.db.execute(
      `INSERT INTO messages (message_id, origin, priority, delivery_status, created_at, expiry_at, data, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(message_id) DO UPDATE SET
         delivery_status = excluded.delivery_status, priority = excluded.priority,
         data = excluded.data, updated_at = excluded.updated_at`,
      [m.msg.message_id, m.origin, m.msg.priority, m.delivery_status, m.msg.created_at, m.msg.expiry_at,
        JSON.stringify(m), new Date().toISOString()],
    );
  }

  async list(): Promise<StoredMessage[]> {
    const r = await this.db.execute('SELECT data FROM messages ORDER BY created_at DESC');
    return r.rows.map(row => JSON.parse(String(row.data)) as StoredMessage);
  }

  async getKV(key: string): Promise<string | null> {
    const r = await this.db.execute('SELECT value FROM kv WHERE key = ?', [key]);
    return r.rows[0] ? String(r.rows[0].value) : null;
  }

  async setKV(key: string, value: string): Promise<void> {
    await this.db.execute(
      'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, value],
    );
  }
}
