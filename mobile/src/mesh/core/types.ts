/**
 * Core data types of the RescueMesh store-and-forward protocol.
 *
 * `SOSMessage` is the wire format: the same JSON travels phone -> phone over
 * the mesh and phone -> server over HTTP (backend/app/schemas/sos.py,
 * SOSMessageIn). `StoredMessage` adds purely local bookkeeping that never
 * leaves the device.
 */

export type EmergencyType = 'MEDICAL' | 'TRAPPED' | 'FIRE' | 'FLOOD' | 'OTHER';
export type Priority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

/** How a hop was made. SIMULATED is never real radio traffic. */
export type HopTransport = 'LOCAL' | 'NEARBY' | 'SIMULATED' | 'INTERNET';

export interface RelayHop {
  device_id: string;
  device_name?: string | null;
  hop: number;
  transport: HopTransport;
  received_at: string; // ISO-8601 UTC
}

export interface SOSMessage {
  message_id: string; // UUID v4, generated once on the originating phone
  sender_id: string;
  sender_name?: string | null;
  emergency_type: EmergencyType;
  priority: Priority;
  latitude: number | null;
  longitude: number | null;
  location_accuracy_m?: number | null;
  description: string;
  people_affected?: number | null;
  created_at: string;
  expiry_at: string;
  hop_count: number;
  relay_history: RelayHop[];
  is_simulated: boolean;
}

/**
 * Local delivery state of a message, as far as THIS device can know it.
 *
 * Happy path:
 *   CREATED_LOCAL -> RELAYED -> GATEWAY_REACHED -> SERVER_RECEIVED
 *     -> COORDINATOR_ACKNOWLEDGED -> ASSIGNED -> RESOLVED
 *
 * A phone receiving our message (RELAYED) is NOT delivery to the rescue
 * server. Only a server response (direct, or relayed back as a status update)
 * can move a message to SERVER_RECEIVED or beyond.
 *
 * Side states: SEND_FAILED (direct upload failed; message stays queued),
 * EXPIRED (passed expiry_at before reaching the server), REJECTED (server
 * refused it as invalid), CANCELLED (coordinator closed it, e.g. false alarm).
 */
export type DeliveryStatus =
  | 'CREATED_LOCAL'
  | 'SEND_FAILED'
  | 'RELAYED'
  | 'GATEWAY_REACHED'
  | 'SERVER_RECEIVED'
  | 'COORDINATOR_ACKNOWLEDGED'
  | 'ASSIGNED'
  | 'RESOLVED'
  | 'EXPIRED'
  | 'REJECTED'
  | 'CANCELLED';

/** Rescue-operation status as reported by the server. */
export type RescueStatus =
  | 'RECEIVED'
  | 'ACKNOWLEDGED'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'RESOLVED'
  | 'CANCELLED';

export interface DeliveryLogEntry {
  at: string;
  status: DeliveryStatus | 'INFO';
  detail: string;
}

export interface StoredMessage {
  msg: SOSMessage;
  /** SELF = created on this phone; RELAY = carried on behalf of someone else. */
  origin: 'SELF' | 'RELAY';
  delivery_status: DeliveryStatus;
  rescue_status: RescueStatus | null;
  /** Version of the newest server-sourced status we hold (server updated_at). */
  status_version: string | null;
  received_at: string;
  /** Peers that confirmed (RECEIPT) storing this message. Never re-offered to them. */
  relayed_to: string[];
  /** Failed send attempts per peer, for controlled retries. */
  attempts: Record<string, number>;
  delivery_log: DeliveryLogEntry[];
}

/** A status claim that travels back over the mesh toward the originating phone. */
export interface StatusUpdate {
  id: string;
  delivery_status: DeliveryStatus;
  rescue_status: RescueStatus | null;
  /** server updated_at for server-sourced statuses; gateway clock for GATEWAY_REACHED */
  version: string;
  source: 'SERVER' | 'GATEWAY';
}

export interface InventoryItem {
  id: string;
  /** status_version the peer holds, so we only send it newer statuses. */
  v: string | null;
  /** rank of the peer's delivery status */
  r: number;
}

/** Protocol packets exchanged between two connected RescueMesh devices. */
export type Packet =
  | {
      t: 'HELLO';
      v: number;
      deviceId: string;
      name: string;
      isGateway: boolean;
      inventory: InventoryItem[];
    }
  | { t: 'SOS'; msg: SOSMessage }
  | { t: 'RECEIPT'; id: string; accepted: boolean; duplicate?: boolean; reason?: string }
  | { t: 'STATUS'; updates: StatusUpdate[] };

export interface DeviceIdentity {
  deviceId: string;
  name: string;
}

export interface PeerInfo {
  peerId: string; // transport-level endpoint id
  name: string;
  deviceId: string | null; // learned from HELLO
  state: 'DISCOVERED' | 'CONNECTED';
  isGateway: boolean;
  transport: 'NEARBY' | 'SIMULATED';
  lastSeen: string;
  /** Message ids this peer is known to hold. */
  knownIds: Set<string>;
}
