/** Validation of messages received from other phones (never trust the radio). */
import { MAX_CLOCK_SKEW_MS, MAX_DESCRIPTION_LENGTH, MAX_EXPIRY_HOURS, MAX_HOP_COUNT } from './constants';
import type { SOSMessage } from './types';
import { UUID_RE } from './uuid';

const TYPES = new Set(['MEDICAL', 'TRAPPED', 'FIRE', 'FLOOD', 'OTHER']);
const PRIORITIES = new Set(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);
const TRANSPORTS = new Set(['LOCAL', 'NEARBY', 'SIMULATED', 'INTERNET']);
const DEVICE_ID_RE = /^[A-Za-z0-9_.:-]{4,64}$/;

export type ValidationResult = { ok: true } | { ok: false; reason: string };

const fail = (reason: string): ValidationResult => ({ ok: false, reason });

function isIso(s: unknown): s is string {
  return typeof s === 'string' && !Number.isNaN(Date.parse(s)) && /(Z|[+-]\d\d:\d\d)$/.test(s);
}

/**
 * Structural + semantic checks for an incoming SOS. `now` is injectable for tests.
 * The receiver will store it with hop_count + 1, so that must not exceed MAX_HOP_COUNT.
 */
export function validateIncoming(m: unknown, now: number = Date.now()): ValidationResult {
  if (typeof m !== 'object' || m === null) {
    return fail('not an object');
  }
  const x = m as Partial<SOSMessage>;
  if (typeof x.message_id !== 'string' || !UUID_RE.test(x.message_id)) {
    return fail('invalid message_id');
  }
  if (typeof x.sender_id !== 'string' || !DEVICE_ID_RE.test(x.sender_id)) {
    return fail('invalid sender_id');
  }
  if (!TYPES.has(x.emergency_type as string)) {
    return fail('invalid emergency_type');
  }
  if (!PRIORITIES.has(x.priority as string)) {
    return fail('invalid priority');
  }
  const hasLat = typeof x.latitude === 'number';
  const hasLon = typeof x.longitude === 'number';
  if (hasLat !== hasLon || (!hasLat && (x.latitude !== null || x.longitude !== null))) {
    return fail('latitude/longitude must both be numbers or both null');
  }
  if (hasLat && (Math.abs(x.latitude!) > 90 || Math.abs(x.longitude!) > 180)) {
    return fail('coordinates out of range');
  }
  if (typeof x.description !== 'string' || x.description.length > MAX_DESCRIPTION_LENGTH) {
    return fail('invalid description');
  }
  if (!isIso(x.created_at) || !isIso(x.expiry_at)) {
    return fail('timestamps must be ISO-8601 with timezone');
  }
  const created = Date.parse(x.created_at);
  const expiry = Date.parse(x.expiry_at);
  if (created > now + MAX_CLOCK_SKEW_MS) {
    return fail('created_at in the future');
  }
  if (expiry <= created || expiry - created > MAX_EXPIRY_HOURS * 3600_000) {
    return fail('invalid expiry window');
  }
  if (expiry <= now) {
    return fail('expired');
  }
  if (!Number.isInteger(x.hop_count) || x.hop_count! < 0) {
    return fail('invalid hop_count');
  }
  if (x.hop_count! + 1 > MAX_HOP_COUNT) {
    return fail('hop limit reached');
  }
  if (!Array.isArray(x.relay_history) || x.relay_history.length > 64) {
    return fail('invalid relay_history');
  }
  for (const h of x.relay_history) {
    if (
      typeof h !== 'object' || h === null ||
      typeof h.device_id !== 'string' || !DEVICE_ID_RE.test(h.device_id) ||
      !Number.isInteger(h.hop) || !TRANSPORTS.has(h.transport) || !isIso(h.received_at)
    ) {
      return fail('invalid relay hop');
    }
  }
  if (typeof x.is_simulated !== 'boolean') {
    return fail('invalid is_simulated');
  }
  return { ok: true };
}
