import { priorityScore } from '../../src/mesh/core/priority';
import { selectForPeer } from '../../src/mesh/core/relayPolicy';
import { applyStatusUpdate, advanceLocal } from '../../src/mesh/core/status';
import type { PeerInfo, SOSMessage, StoredMessage } from '../../src/mesh/core/types';
import { uuidv4, UUID_RE } from '../../src/mesh/core/uuid';
import { validateIncoming } from '../../src/mesh/core/validation';
import { MAX_HOP_COUNT } from '../../src/mesh/core/constants';

const NOW = Date.parse('2026-06-01T12:00:00Z');

function msg(over: Partial<SOSMessage> = {}): SOSMessage {
  return {
    message_id: uuidv4(),
    sender_id: 'dev-aaaa',
    emergency_type: 'FLOOD',
    priority: 'HIGH',
    latitude: 9.5,
    longitude: 76.3,
    description: 'help',
    created_at: new Date(NOW - 60_000).toISOString(),
    expiry_at: new Date(NOW + 3600_000).toISOString(),
    hop_count: 0,
    relay_history: [{ device_id: 'dev-aaaa', hop: 0, transport: 'LOCAL', received_at: new Date(NOW).toISOString() }],
    is_simulated: false,
    ...over,
  };
}

function stored(m: SOSMessage, over: Partial<StoredMessage> = {}): StoredMessage {
  return {
    msg: m, origin: 'SELF', delivery_status: 'CREATED_LOCAL', rescue_status: null, status_version: null,
    received_at: m.created_at, relayed_to: [], attempts: {}, delivery_log: [], ...over,
  };
}

const peer = (over: Partial<PeerInfo> = {}): PeerInfo => ({
  peerId: 'ep1', name: 'B', deviceId: 'dev-bbbb', state: 'CONNECTED', isGateway: false,
  transport: 'SIMULATED', lastSeen: '', knownIds: new Set(), ...over,
});

describe('uuid', () => {
  it('generates unique v4 ids', () => {
    const ids = new Set(Array.from({ length: 1000 }, uuidv4));
    expect(ids.size).toBe(1000);
    for (const id of ids) {
      expect(id).toMatch(UUID_RE);
    }
  });
});

describe('validateIncoming', () => {
  it('accepts a valid message', () => {
    expect(validateIncoming(msg(), NOW)).toEqual({ ok: true });
  });
  it.each([
    ['bad id', { message_id: 'x' }],
    ['bad priority', { priority: 'URGENT' }],
    ['half location', { latitude: 1, longitude: null }],
    ['lat range', { latitude: 99 }],
    ['expired', { expiry_at: new Date(NOW - 1).toISOString() }],
    ['future', { created_at: new Date(NOW + 3600_000).toISOString(), expiry_at: new Date(NOW + 7200_000).toISOString() }],
    ['hop limit', { hop_count: MAX_HOP_COUNT }],
    ['naive ts', { created_at: '2026-06-01T11:00:00' }],
  ])('rejects %s', (_, over) => {
    expect(validateIncoming(msg(over as Partial<SOSMessage>), NOW).ok).toBe(false);
  });
  it('rejects garbage', () => {
    expect(validateIncoming(null, NOW).ok).toBe(false);
    expect(validateIncoming('hi', NOW).ok).toBe(false);
  });
});

describe('priority', () => {
  it('orders by priority with ageing that never beats a fresh critical', () => {
    const fresh = new Date(NOW).toISOString();
    const old = new Date(NOW - 5 * 3600_000).toISOString();
    const ancient = new Date(NOW - 72 * 3600_000).toISOString();
    expect(priorityScore({ priority: 'LOW', created_at: old }, NOW)).toBeGreaterThanOrEqual(
      priorityScore({ priority: 'HIGH', created_at: fresh }, NOW));
    expect(priorityScore({ priority: 'LOW', created_at: ancient }, NOW)).toBeLessThan(
      priorityScore({ priority: 'CRITICAL', created_at: fresh }, NOW));
  });
});

describe('relay policy', () => {
  it('sends critical first and skips ineligible messages', () => {
    const low = stored(msg({ priority: 'LOW' }));
    const crit = stored(msg({ priority: 'CRITICAL' }));
    const done = stored(msg(), { delivery_status: 'SERVER_RECEIVED' });
    const expired = stored(msg({ expiry_at: new Date(NOW - 1).toISOString() }));
    const maxHops = stored(msg({ hop_count: MAX_HOP_COUNT }));
    const loop = stored(msg({ relay_history: [{ device_id: 'dev-bbbb', hop: 0, transport: 'LOCAL', received_at: msg().created_at }] }));
    const exhausted = stored(msg(), { attempts: { ep1: 3 } });
    const already = stored(msg(), { relayed_to: ['ep1'] });
    const out = selectForPeer([low, crit, done, expired, maxHops, loop, exhausted, already], peer(), NOW);
    expect(out.map(m => m.msg.priority)).toEqual(['CRITICAL', 'LOW']);
  });
  it('skips ids the peer reported in its inventory', () => {
    const m = stored(msg());
    expect(selectForPeer([m], peer({ knownIds: new Set([m.msg.message_id]) }), NOW)).toEqual([]);
  });
});

describe('status rules', () => {
  it('never regresses and never lets a relay claim server receipt', () => {
    const m = stored(msg());
    expect(advanceLocal(m, 'RELAYED', 'x', '')).toBe(true);
    expect(advanceLocal(m, 'CREATED_LOCAL', 'x', '')).toBe(false);
    expect(m.delivery_status).toBe('RELAYED');
    // A GATEWAY-sourced claim can never assert a server state...
    const g = (s: 'SERVER_RECEIVED' | 'GATEWAY_REACHED') =>
      ({ id: '', delivery_status: s, rescue_status: null, version: '2026-01-01T00:00:00Z', source: 'GATEWAY' as const });
    expect(applyStatusUpdate(m, g('SERVER_RECEIVED'), '', '')).toBe(false);
    expect(m.delivery_status).toBe('RELAYED');
    // ...only that a gateway holds the message.
    expect(applyStatusUpdate(m, g('GATEWAY_REACHED'), '', '')).toBe(true);
    expect(m.delivery_status).toBe('GATEWAY_REACHED');
  });
  it('server statuses apply by newest version, allowing re-open', () => {
    const m = stored(msg(), { delivery_status: 'SERVER_RECEIVED' });
    const u = (s: 'RESOLVED' | 'COORDINATOR_ACKNOWLEDGED', v: string) =>
      ({ id: '', delivery_status: s, rescue_status: null, version: v, source: 'SERVER' as const });
    expect(applyStatusUpdate(m, u('RESOLVED', '2026-01-01T00:00:02Z'), '', '')).toBe(true);
    expect(applyStatusUpdate(m, u('COORDINATOR_ACKNOWLEDGED', '2026-01-01T00:00:01Z'), '', '')).toBe(false);
    expect(m.delivery_status).toBe('RESOLVED');
    expect(applyStatusUpdate(m, u('COORDINATOR_ACKNOWLEDGED', '2026-01-01T00:00:03.5Z'), '', '')).toBe(true);
    expect(m.delivery_status).toBe('COORDINATOR_ACKNOWLEDGED');
  });
});
