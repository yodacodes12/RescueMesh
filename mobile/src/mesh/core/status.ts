/**
 * Delivery-status ordering rules.
 *
 * Statuses only move forward. Below SERVER_RECEIVED, progress is measured by
 * rank (a phone can only learn "it got further"). From SERVER_RECEIVED on, the
 * server is authoritative and the newest server version wins - this allows a
 * coordinator to re-open a RESOLVED request.
 */
import type { DeliveryStatus, RescueStatus, StoredMessage, StatusUpdate } from './types';

export const RANK: Record<DeliveryStatus, number> = {
  CREATED_LOCAL: 0,
  SEND_FAILED: 0,
  RELAYED: 1,
  GATEWAY_REACHED: 2,
  REJECTED: 2,
  EXPIRED: 2,
  SERVER_RECEIVED: 3,
  COORDINATOR_ACKNOWLEDGED: 4,
  ASSIGNED: 5,
  RESOLVED: 6,
  CANCELLED: 6,
};

export const SERVER_RANK = RANK.SERVER_RECEIVED;

/** Compare ISO timestamps numerically (string compare breaks on fractional seconds). */
export function isNewerVersion(a: string, b: string | null): boolean {
  if (!b) {
    return true;
  }
  return Date.parse(a) > Date.parse(b);
}

/** States in which we have stopped trying to deliver the message. */
export function isDeliveryFinished(s: DeliveryStatus): boolean {
  return RANK[s] >= SERVER_RANK || s === 'EXPIRED' || s === 'REJECTED';
}

/** States in which nothing further can happen (no more status polling). */
export function isTerminal(s: DeliveryStatus): boolean {
  return s === 'RESOLVED' || s === 'CANCELLED' || s === 'EXPIRED' || s === 'REJECTED';
}

/** Map a server (delivery, rescue) pair to the single local pipeline status. */
export function fromServer(delivery: string, rescue: RescueStatus): DeliveryStatus {
  switch (rescue) {
    case 'RESOLVED':
      return 'RESOLVED';
    case 'CANCELLED':
      return 'CANCELLED';
    case 'ASSIGNED':
    case 'IN_PROGRESS':
      return 'ASSIGNED';
    case 'ACKNOWLEDGED':
      return 'COORDINATOR_ACKNOWLEDGED';
    default:
      return delivery === 'COORDINATOR_ACKNOWLEDGED' ? 'COORDINATOR_ACKNOWLEDGED' : 'SERVER_RECEIVED';
  }
}

/**
 * Decide whether `u` improves what we know about `m`. Returns true if `m` was
 * changed (caller persists it).
 */
export function applyStatusUpdate(m: StoredMessage, u: StatusUpdate, detail: string, nowIso: string): boolean {
  const cur = m.delivery_status;
  if (u.source === 'SERVER') {
    if (m.status_version && !isNewerVersion(u.version, m.status_version)) {
      return false;
    }
    m.status_version = u.version;
    const changed = cur !== u.delivery_status || m.rescue_status !== u.rescue_status;
    m.delivery_status = u.delivery_status;
    m.rescue_status = u.rescue_status;
    if (changed) {
      m.delivery_log.push({ at: nowIso, status: u.delivery_status, detail });
    }
    return true;
  }
  // A GATEWAY claim may only say "a gateway holds it": it can never assert a
  // server state, because only the server can confirm server receipt.
  if (u.delivery_status !== 'GATEWAY_REACHED') {
    return false;
  }
  if (RANK[u.delivery_status] > RANK[cur] && RANK[cur] < SERVER_RANK) {
    m.delivery_status = u.delivery_status;
    m.delivery_log.push({ at: nowIso, status: u.delivery_status, detail });
    return true;
  }
  return false;
}

/** Move to a local (non-server) status if it is progress. */
export function advanceLocal(m: StoredMessage, next: DeliveryStatus, detail: string, nowIso: string): boolean {
  const cur = m.delivery_status;
  const progress =
    RANK[next] > RANK[cur] ||
    // SEND_FAILED <-> CREATED_LOCAL share rank 0 and may alternate.
    (RANK[next] === RANK[cur] && next !== cur && RANK[cur] === 0);
  if (!progress || RANK[cur] >= SERVER_RANK) {
    // Still record the event so delivery history is complete.
    m.delivery_log.push({ at: nowIso, status: 'INFO', detail });
    return false;
  }
  m.delivery_status = next;
  m.delivery_log.push({ at: nowIso, status: next, detail });
  return true;
}

export const STATUS_LABEL: Record<DeliveryStatus, string> = {
  CREATED_LOCAL: 'Saved on this device',
  SEND_FAILED: 'Send failed - queued for retry',
  RELAYED: 'Relayed to nearby device',
  GATEWAY_REACHED: 'Reached an internet gateway',
  SERVER_RECEIVED: 'Received by rescue server',
  COORDINATOR_ACKNOWLEDGED: 'Acknowledged by coordinator',
  ASSIGNED: 'Rescue team assigned',
  RESOLVED: 'Resolved',
  EXPIRED: 'Expired before delivery',
  REJECTED: 'Rejected by server',
  CANCELLED: 'Closed by coordinator',
};

/** What the user should understand is happening next. */
export function nextStepHint(s: DeliveryStatus): string {
  switch (s) {
    case 'CREATED_LOCAL':
    case 'SEND_FAILED':
      return 'Waiting for a nearby RescueMesh device or internet connection.';
    case 'RELAYED':
      return 'Another phone is carrying your SOS. Waiting for internet gateway.';
    case 'GATEWAY_REACHED':
      return 'A phone with internet has your SOS and is uploading it.';
    case 'SERVER_RECEIVED':
      return 'Rescue coordinators can now see your SOS.';
    case 'COORDINATOR_ACKNOWLEDGED':
      return 'A coordinator has reviewed your SOS.';
    case 'ASSIGNED':
      return 'Help has been assigned and is on the way.';
    default:
      return '';
  }
}
