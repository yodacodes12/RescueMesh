/**
 * Relay decisions: which of our stored messages may be offered to a peer, and
 * in what order. Kept separate from transport and storage so the rules can be
 * tested on their own.
 *
 * A message is eligible for forwarding to `peer` when ALL hold:
 *  - it has not expired and the server is not already known to have it
 *  - forwarding would not exceed MAX_HOP_COUNT
 *  - the peer does not already hold it (inventory, earlier receipt) and the
 *    peer's device is not already on its relay path (prevents loops A->B->A)
 *  - we have not already failed MAX_ATTEMPTS_PER_PEER times with that peer
 * Eligible messages are sent highest priorityScore first, in batches.
 */
import { FORWARD_BATCH_SIZE, MAX_ATTEMPTS_PER_PEER, MAX_HOP_COUNT } from './constants';
import { priorityScore } from './priority';
import { isDeliveryFinished } from './status';
import type { PeerInfo, StoredMessage } from './types';

export function isExpired(m: StoredMessage, now: number): boolean {
  return Date.parse(m.msg.expiry_at) <= now;
}

export function canForwardTo(m: StoredMessage, peer: PeerInfo, now: number): boolean {
  if (isDeliveryFinished(m.delivery_status) || isExpired(m, now)) {
    return false;
  }
  if (m.msg.hop_count + 1 > MAX_HOP_COUNT) {
    return false;
  }
  const id = m.msg.message_id;
  if (peer.knownIds.has(id) || m.relayed_to.includes(peer.peerId)) {
    return false;
  }
  if (peer.deviceId && m.msg.relay_history.some(h => h.device_id === peer.deviceId)) {
    return false;
  }
  if ((m.attempts[peer.peerId] ?? 0) >= MAX_ATTEMPTS_PER_PEER) {
    return false;
  }
  return true;
}

export function selectForPeer(
  messages: StoredMessage[],
  peer: PeerInfo,
  now: number,
  inFlight: Set<string> = new Set(),
  batch: number = FORWARD_BATCH_SIZE,
): StoredMessage[] {
  return messages
    .filter(m => !inFlight.has(m.msg.message_id) && canForwardTo(m, peer, now))
    .sort((a, b) => priorityScore(b.msg, now) - priorityScore(a.msg, now))
    .slice(0, batch);
}
