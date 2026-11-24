/** Protocol limits. Keep in sync with backend/app/core/config.py. */
export const PROTOCOL_VERSION = 1;
/** Nearby Connections service id: only RescueMesh apps discover each other. */
export const SERVICE_ID = 'org.rescuemesh.mesh.v1';
/** A message is never stored by a device that would make it exceed this many hops. */
export const MAX_HOP_COUNT = 8;
export const DEFAULT_EXPIRY_HOURS = 48;
export const MAX_EXPIRY_HOURS = 72;
/** Accept messages stamped up to this far in the future (phone clocks drift). */
export const MAX_CLOCK_SKEW_MS = 15 * 60_000;
/** Give up offering a message to the same peer after this many failed attempts. */
export const MAX_ATTEMPTS_PER_PEER = 3;
/** A SOS we sent is considered lost if no RECEIPT arrives within this time. */
export const RECEIPT_TIMEOUT_MS = 15_000;
/** Messages sent per peer per exchange round, highest priority first. */
export const FORWARD_BATCH_SIZE = 20;
export const MAX_DESCRIPTION_LENGTH = 1000;
/** Max packet size we accept (Nearby BYTES payloads are limited to 32 KiB). */
export const MAX_PACKET_BYTES = 30_000;
