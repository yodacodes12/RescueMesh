/**
 * MeshEngine - the store-and-forward core of RescueMesh.
 *
 * Responsibilities (each delegated to a separate module):
 *   discovery / connection / transmission / reception  -> Transport
 *   local persistence                                    -> MessageStore
 *   relay decisions (what, to whom, in which order)      -> relayPolicy
 *   validation of untrusted input                        -> validation
 *   status ordering                                      -> status
 *   internet upload when this phone is a gateway         -> GatewayClient
 *
 * Exchange protocol between two connected phones (JSON packets):
 *
 *   A                                   B
 *   |-- HELLO {inventory: ids+status} ->|   both sides send HELLO on connect
 *   |<- HELLO {inventory} --------------|
 *   |-- SOS {msg} (priority order) ---->|   only messages B lacks (dedupe
 *   |                                   |   before transfer saves airtime)
 *   |                                   |   B validates, rejects duplicates,
 *   |                                   |   PERSISTS, and only then:
 *   |<- RECEIPT {id, accepted} ---------|
 *   |-- STATUS {server acks} ---------->|   acks flow back toward the origin
 *
 * Guarantees:
 *   - store-before-forward: a RECEIPT is sent only after the message is durable
 *   - a message is never deleted because it was relayed
 *   - duplicates are rejected by message_id; loops prevented by relay path,
 *     per-peer known-id sets and the hop limit
 *   - RELAYED never implies the server has the message
 */
import { MAX_PACKET_BYTES, PROTOCOL_VERSION, RECEIPT_TIMEOUT_MS, DEFAULT_EXPIRY_HOURS } from './constants';
import { GatewayClient, ApiError } from './gatewayClient';
import { isExpired, selectForPeer } from './relayPolicy';
import { advanceLocal, applyStatusUpdate, fromServer, isDeliveryFinished, isNewerVersion, isTerminal, RANK, SERVER_RANK } from './status';
import type { MessageStore } from './store';
import type { Transport, TransportEvent } from './transport';
import type {
  DeliveryStatus, DeviceIdentity, EmergencyType, InventoryItem, Packet, PeerInfo, Priority,
  SOSMessage, StatusUpdate, StoredMessage,
} from './types';
import { uuidv4 } from './uuid';
import { validateIncoming } from './validation';

export interface CreateSOSInput {
  emergency_type: EmergencyType;
  priority: Priority;
  latitude: number | null;
  longitude: number | null;
  location_accuracy_m?: number | null;
  description: string;
  people_affected?: number | null;
  is_simulated?: boolean;
}

export interface PeerSnapshot extends Omit<PeerInfo, 'knownIds'> {
  knownCount: number;
}

export interface EngineSnapshot {
  identity: DeviceIdentity;
  /** This phone can reach the RescueMesh backend right now. */
  gatewayCapable: boolean;
  /** Internet blocked by the user for demos ("simulate no internet"). */
  internetSuppressed: boolean;
  transportKind: Transport['kind'] | null;
  transportState: string;
  peers: PeerSnapshot[];
  messages: StoredMessage[];
  pendingCount: number;
  relayHoldingCount: number;
  lastRelayAt: string | null;
  lastGatewaySyncAt: string | null;
  lastError: string | null;
}

export interface EngineOptions {
  identity: DeviceIdentity;
  store: MessageStore;
  api?: GatewayClient | null;
  now?: () => number;
  log?: (line: string) => void;
}

const KV_LAST_RELAY = 'last_relay_at';
const KV_LAST_SYNC = 'last_gateway_sync_at';

export class MeshEngine {
  readonly identity: DeviceIdentity;
  private readonly store: MessageStore;
  private api: GatewayClient | null;
  private readonly now: () => number;
  private readonly log: (line: string) => void;

  private transport: Transport | null = null;
  private unsubscribeTransport: (() => void) | null = null;
  private transportState = 'STOPPED';
  private peers = new Map<string, PeerInfo>();
  /** `${messageId}|${peerId}` -> sent at (ms); awaiting RECEIPT */
  private inFlight = new Map<string, number>();

  private internetReachable = false;
  private internetSuppressed = false;
  private backendHealthy = false;
  private syncing = false;
  private lastError: string | null = null;
  private lastRelayAt: string | null = null;
  private lastSyncAt: string | null = null;

  private lock: Promise<unknown> = Promise.resolve();
  private listeners = new Set<() => void>();
  private cache: StoredMessage[] = [];

  constructor(opts: EngineOptions) {
    this.identity = opts.identity;
    this.store = opts.store;
    this.api = opts.api ?? null;
    this.now = opts.now ?? Date.now;
    this.log = opts.log ?? (() => {});
  }

  // ------------------------------------------------------------------ lifecycle

  async init(): Promise<void> {
    this.lastRelayAt = await this.store.getKV(KV_LAST_RELAY);
    this.lastSyncAt = await this.store.getKV(KV_LAST_SYNC);
    await this.refreshCache();
  }

  /** Swap the radio layer (e.g. real Nearby <-> clearly-labelled simulation). */
  async setTransport(t: Transport | null): Promise<void> {
    if (this.transport) {
      this.unsubscribeTransport?.();
      await this.transport.stop().catch(() => {});
    }
    this.peers.clear();
    this.inFlight.clear();
    this.transport = t;
    this.transportState = t ? 'STARTING' : 'STOPPED';
    this.emit();
    if (!t) {
      return;
    }
    this.unsubscribeTransport = t.onEvent(e => {
      void this.exclusive(() => this.onTransportEvent(e));
    });
    try {
      await t.start(this.identity);
    } catch (e) {
      this.transportState = 'ERROR';
      this.lastError = `Transport failed to start: ${String(e)}`;
      this.emit();
    }
  }

  setApi(api: GatewayClient | null) {
    this.api = api;
    this.backendHealthy = false;
  }

  /** Called by the connectivity monitor (NetInfo) with raw internet reachability. */
  async setInternetReachable(reachable: boolean): Promise<void> {
    this.internetReachable = reachable;
    await this.checkBackend();
  }

  /** Demo control: behave as if this phone had no internet. */
  async setInternetSuppressed(v: boolean): Promise<void> {
    this.internetSuppressed = v;
    await this.checkBackend();
  }

  get isGatewayCapable(): boolean {
    return this.internetReachable && !this.internetSuppressed && this.backendHealthy && !!this.api;
  }

  private async checkBackend(): Promise<void> {
    const before = this.isGatewayCapable;
    if (!this.internetReachable || this.internetSuppressed || !this.api) {
      this.backendHealthy = false;
    } else {
      this.backendHealthy = await this.api.health();
    }
    this.emit();
    if (this.isGatewayCapable !== before) {
      // Tell connected peers we can (or no longer can) act as their gateway.
      await this.exclusive(() => this.broadcastHello());
      if (this.isGatewayCapable) {
        await this.runGatewayCycle();
      }
    }
  }

  // ------------------------------------------------------------------ public API

  subscribe(l: () => void): () => void {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }

  snapshot(): EngineSnapshot {
    const messages = [...this.cache].sort((a, b) => Date.parse(b.msg.created_at) - Date.parse(a.msg.created_at));
    return {
      identity: this.identity,
      gatewayCapable: this.isGatewayCapable,
      internetSuppressed: this.internetSuppressed,
      transportKind: this.transport?.kind ?? null,
      transportState: this.transportState,
      peers: [...this.peers.values()].map(({ knownIds, ...p }) => ({ ...p, knownCount: knownIds.size })),
      messages,
      pendingCount: messages.filter(m => !isDeliveryFinished(m.delivery_status)).length,
      relayHoldingCount: messages.filter(m => m.origin === 'RELAY' && !isDeliveryFinished(m.delivery_status)).length,
      lastRelayAt: this.lastRelayAt,
      lastGatewaySyncAt: this.lastSyncAt,
      lastError: this.lastError,
    };
  }

  /** Create an SOS: persist first, then try direct upload, then the mesh. */
  async createSOS(input: CreateSOSInput): Promise<StoredMessage> {
    const nowMs = this.now();
    const nowIso = new Date(nowMs).toISOString();
    const msg: SOSMessage = {
      message_id: uuidv4(),
      sender_id: this.identity.deviceId,
      sender_name: this.identity.name,
      emergency_type: input.emergency_type,
      priority: input.priority,
      latitude: input.latitude,
      longitude: input.longitude,
      location_accuracy_m: input.location_accuracy_m ?? null,
      description: input.description.trim(),
      people_affected: input.people_affected ?? null,
      created_at: nowIso,
      expiry_at: new Date(nowMs + DEFAULT_EXPIRY_HOURS * 3600_000).toISOString(),
      hop_count: 0,
      relay_history: [{ device_id: this.identity.deviceId, device_name: this.identity.name, hop: 0, transport: 'LOCAL', received_at: nowIso }],
      is_simulated: input.is_simulated ?? false,
    };
    const stored: StoredMessage = {
      msg,
      origin: 'SELF',
      delivery_status: 'CREATED_LOCAL',
      rescue_status: null,
      status_version: null,
      received_at: nowIso,
      relayed_to: [],
      attempts: {},
      delivery_log: [{ at: nowIso, status: 'CREATED_LOCAL', detail: 'SOS saved on this device' }],
    };
    await this.exclusive(async () => {
      await this.persist(stored);
      this.log(`created ${msg.message_id} ${msg.priority}`);
    });
    void this.deliver(msg.message_id);
    return stored;
  }

  /** Try to move one of our messages forward right now (direct upload or mesh). */
  async deliver(messageId: string): Promise<void> {
    const m = await this.store.get(messageId);
    if (!m || isDeliveryFinished(m.delivery_status)) {
      return;
    }
    if (this.isGatewayCapable && this.api) {
      try {
        const r = await this.api.submit(m.msg);
        await this.exclusive(() => this.applyIngestResult(messageId, r.result, r.reason ?? null, 'direct upload'));
        await this.pollStatuses([messageId]);
        return;
      } catch (e) {
        await this.exclusive(async () => {
          const cur = await this.store.get(messageId);
          if (cur) {
            advanceLocal(cur, 'SEND_FAILED', `Direct upload failed: ${(e as Error).message}`, this.isoNow());
            await this.persist(cur);
          }
        });
      }
    }
    await this.exclusive(() => this.offerToAllPeers());
  }

  /** Periodic housekeeping. Call every few seconds. */
  async tick(): Promise<void> {
    await this.exclusive(async () => {
      const nowMs = this.now();
      // Expire messages that never reached the server. They are kept, not deleted.
      for (const m of await this.store.list()) {
        if (!isDeliveryFinished(m.delivery_status) && isExpired(m, nowMs)) {
          m.delivery_status = 'EXPIRED';
          m.delivery_log.push({ at: this.isoNow(), status: 'EXPIRED', detail: 'Expired before reaching the rescue server' });
          await this.persist(m);
        }
      }
      // Receipt timeouts count as failed attempts (controlled retries).
      for (const [key, sentAt] of [...this.inFlight]) {
        if (nowMs - sentAt > RECEIPT_TIMEOUT_MS) {
          this.inFlight.delete(key);
          const [id, peerId] = key.split('|');
          const m = await this.store.get(id);
          if (m) {
            m.attempts[peerId] = (m.attempts[peerId] ?? 0) + 1;
            m.delivery_log.push({ at: this.isoNow(), status: 'INFO', detail: `No receipt from ${this.peerName(peerId)} (attempt ${m.attempts[peerId]})` });
            await this.persist(m);
          }
        }
      }
      await this.offerToAllPeers();
    });
    if (this.internetReachable && !this.internetSuppressed && !this.backendHealthy) {
      await this.checkBackend();
    }
    if (this.isGatewayCapable) {
      await this.runGatewayCycle();
    }
  }

  /**
   * Gateway duty: upload every message we hold that the server may not have
   * (our own and ones we carry for others), then fetch statuses for all
   * non-final messages so acknowledgements can flow back over the mesh.
   * Network I/O happens outside the lock so packet handling is not blocked.
   */
  async runGatewayCycle(): Promise<void> {
    if (!this.api || !this.isGatewayCapable || this.syncing) {
      return;
    }
    this.syncing = true;
    try {
      const all = await this.store.list();
      const nowMs = this.now();
      const toUpload = all.filter(m => !isDeliveryFinished(m.delivery_status) && !isExpired(m, nowMs));
      if (toUpload.length) {
        await this.exclusive(async () => {
          for (const stale of toUpload) {
            const m = await this.store.get(stale.msg.message_id);
            if (m && m.origin === 'RELAY' && RANK[m.delivery_status] < RANK.GATEWAY_REACHED) {
              advanceLocal(m, 'GATEWAY_REACHED', 'This device is acting as internet gateway', this.isoNow());
              await this.persist(m);
              await this.broadcastStatus([{ id: m.msg.message_id, delivery_status: 'GATEWAY_REACHED', rescue_status: null, version: this.isoNow(), source: 'GATEWAY' }]);
            }
          }
        });
        await this.uploadBatch(toUpload.map(m => m.msg));
      }
      const poll = (await this.store.list()).filter(m => RANK[m.delivery_status] >= SERVER_RANK && !isTerminal(m.delivery_status));
      if (poll.length) {
        await this.pollStatuses(poll.map(m => m.msg.message_id));
      }
      this.lastSyncAt = this.isoNow();
      await this.store.setKV(KV_LAST_SYNC, this.lastSyncAt);
      this.lastError = null;
    } catch (e) {
      this.lastError = `Gateway sync failed: ${(e as Error).message}`;
      this.log(this.lastError);
      if (e instanceof ApiError && e.status === null) {
        this.backendHealthy = false; // re-checked on next tick
      }
    } finally {
      this.syncing = false;
      this.emit();
    }
  }

  // ------------------------------------------------------------------ gateway internals

  private async uploadBatch(msgs: SOSMessage[]): Promise<void> {
    const api = this.api!;
    const isSim = this.transport?.kind === 'SIMULATED' || msgs.some(m => m.is_simulated);
    let results;
    try {
      results = (await api.sync(this.identity.deviceId, this.identity.name, isSim, msgs)).results;
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 422) || msgs.length === 1) {
        if (e instanceof ApiError && e.status === 422) {
          await this.exclusive(() => this.applyIngestResult(msgs[0].message_id, 'rejected', 'failed server validation', 'gateway upload'));
          return;
        }
        throw e;
      }
      // One malformed message must not block the others: retry one by one.
      for (const m of msgs) {
        await this.uploadBatch([m]);
      }
      return;
    }
    await this.exclusive(async () => {
      for (const r of results) {
        await this.applyIngestResult(r.message_id, r.result, r.reason ?? null, 'gateway upload');
      }
    });
  }

  private async applyIngestResult(id: string, result: string, reason: string | null, via: string): Promise<void> {
    const m = await this.store.get(id);
    if (!m) {
      return;
    }
    const at = this.isoNow();
    if (result === 'created' || result === 'duplicate') {
      advanceLocal(m, 'SERVER_RECEIVED', `Rescue server confirmed receipt (${via}${result === 'duplicate' ? ', already known' : ''})`, at);
    } else if (RANK[m.delivery_status] < SERVER_RANK) {
      m.delivery_status = reason === 'expired' ? 'EXPIRED' : 'REJECTED';
      m.delivery_log.push({ at, status: m.delivery_status, detail: `Server rejected: ${reason ?? 'unknown'}` });
    }
    await this.persist(m);
  }

  private async pollStatuses(ids: string[]): Promise<void> {
    if (!this.api || !ids.length) {
      return;
    }
    const { statuses } = await this.api.statusQuery(ids);
    await this.exclusive(async () => {
      const updates: StatusUpdate[] = [];
      for (const s of statuses) {
        const u: StatusUpdate = {
          id: s.message_id,
          delivery_status: fromServer(s.delivery_status, s.rescue_status),
          rescue_status: s.rescue_status,
          version: s.updated_at,
          source: 'SERVER',
        };
        const m = await this.store.get(u.id);
        if (m && applyStatusUpdate(m, u, 'Status from rescue server', this.isoNow())) {
          await this.persist(m);
          updates.push(u);
        }
      }
      await this.broadcastStatus(updates);
    });
  }

  // ------------------------------------------------------------------ transport events

  private async onTransportEvent(e: TransportEvent): Promise<void> {
    const kind = this.transport?.kind ?? 'SIMULATED';
    switch (e.type) {
      case 'state':
        this.transportState = e.state;
        if (e.state === 'ERROR') {
          this.lastError = e.detail ?? 'Transport error';
        }
        break;
      case 'peerFound': {
        const p = this.peers.get(e.peerId);
        if (p) {
          p.lastSeen = this.isoNow();
        } else {
          this.peers.set(e.peerId, this.newPeer(e.peerId, e.name, e.deviceId, 'DISCOVERED', kind));
        }
        break;
      }
      case 'peerLost': {
        const p = this.peers.get(e.peerId);
        if (p && p.state !== 'CONNECTED') {
          this.peers.delete(e.peerId);
        }
        break;
      }
      case 'connected': {
        const p = this.peers.get(e.peerId) ?? this.newPeer(e.peerId, e.name, e.deviceId, 'CONNECTED', kind);
        p.state = 'CONNECTED';
        p.lastSeen = this.isoNow();
        this.peers.set(e.peerId, p);
        this.log(`connected ${p.name}`);
        await this.sendHello(e.peerId);
        break;
      }
      case 'disconnected':
        this.peers.delete(e.peerId);
        for (const key of [...this.inFlight.keys()]) {
          if (key.endsWith(`|${e.peerId}`)) {
            this.inFlight.delete(key);
          }
        }
        break;
      case 'data':
        await this.onPacket(e.peerId, e.data);
        break;
    }
    this.emit();
  }

  private newPeer(peerId: string, name: string, deviceId: string | null, state: PeerInfo['state'], transport: PeerInfo['transport']): PeerInfo {
    return { peerId, name, deviceId, state, isGateway: false, transport, lastSeen: this.isoNow(), knownIds: new Set() };
  }

  private async onPacket(peerId: string, raw: string): Promise<void> {
    if (raw.length > MAX_PACKET_BYTES) {
      this.log(`dropped oversized packet from ${peerId}`);
      return;
    }
    let p: Packet;
    try {
      p = JSON.parse(raw) as Packet;
    } catch {
      this.log(`dropped malformed packet from ${peerId}`);
      return;
    }
    const peer = this.peers.get(peerId);
    if (!peer) {
      return;
    }
    peer.lastSeen = this.isoNow();
    switch (p.t) {
      case 'HELLO':
        if (p.v !== PROTOCOL_VERSION || !Array.isArray(p.inventory)) {
          this.log(`incompatible peer ${peerId}`);
          return;
        }
        peer.deviceId = typeof p.deviceId === 'string' ? p.deviceId : peer.deviceId;
        peer.name = typeof p.name === 'string' ? p.name.slice(0, 64) : peer.name;
        peer.isGateway = p.isGateway === true;
        for (const item of p.inventory.slice(0, 2000)) {
          peer.knownIds.add(String(item.id));
        }
        await this.sendStatusesFor(peer, p.inventory);
        await this.offerTo(peer);
        break;
      case 'SOS':
        await this.receiveSOS(peer, p.msg);
        break;
      case 'RECEIPT':
        await this.onReceipt(peer, p);
        break;
      case 'STATUS':
        await this.receiveStatus(peer, Array.isArray(p.updates) ? p.updates.slice(0, 500) : []);
        break;
    }
  }

  private async receiveSOS(peer: PeerInfo, msg: SOSMessage): Promise<void> {
    const id = typeof msg?.message_id === 'string' ? msg.message_id : '';
    const check = validateIncoming(msg, this.now());
    if (!check.ok) {
      await this.send(peer.peerId, { t: 'RECEIPT', id, accepted: false, reason: check.reason });
      this.log(`rejected ${id} from ${peer.name}: ${check.reason}`);
      return;
    }
    peer.knownIds.add(id);
    const existing = await this.store.get(id);
    if (existing) {
      // Duplicate suppression: we already hold it (possibly our own SOS coming back).
      await this.send(peer.peerId, { t: 'RECEIPT', id, accepted: true, duplicate: true });
      return;
    }
    const at = this.isoNow();
    const kind = this.transport?.kind ?? 'SIMULATED';
    const copy: SOSMessage = {
      ...msg,
      hop_count: msg.hop_count + 1,
      relay_history: [
        ...msg.relay_history,
        { device_id: this.identity.deviceId, device_name: this.identity.name, hop: msg.hop_count + 1, transport: kind, received_at: at },
      ],
      // Once any hop was simulated, the whole message is flagged as simulated.
      is_simulated: msg.is_simulated || kind === 'SIMULATED',
    };
    const stored: StoredMessage = {
      msg: copy,
      origin: 'RELAY',
      delivery_status: 'RELAYED',
      rescue_status: null,
      status_version: null,
      received_at: at,
      relayed_to: [],
      attempts: {},
      delivery_log: [{ at, status: 'RELAYED', detail: `Received from ${peer.name} via ${kind}; holding for relay` }],
    };
    // STORE BEFORE FORWARD: persist, then acknowledge, then forward.
    await this.persist(stored);
    await this.send(peer.peerId, { t: 'RECEIPT', id, accepted: true });
    this.log(`stored relay ${id} from ${peer.name} (hop ${copy.hop_count})`);
    await this.offerToAllPeers();
    if (this.isGatewayCapable) {
      setTimeout(() => void this.runGatewayCycle(), 0);
    }
  }

  private async onReceipt(peer: PeerInfo, p: Extract<Packet, { t: 'RECEIPT' }>): Promise<void> {
    const key = `${p.id}|${peer.peerId}`;
    this.inFlight.delete(key);
    const m = await this.store.get(p.id);
    if (!m) {
      return;
    }
    const at = this.isoNow();
    if (p.accepted) {
      peer.knownIds.add(p.id);
      if (!m.relayed_to.includes(peer.peerId)) {
        m.relayed_to.push(peer.peerId);
      }
      const how = `${peer.name} via ${peer.transport}${p.duplicate ? ' (already had it)' : ''}`;
      if (m.origin === 'SELF') {
        advanceLocal(m, 'RELAYED', `Relayed to ${how}`, at);
      } else {
        m.delivery_log.push({ at, status: 'INFO', detail: `Forwarded to ${how}` });
      }
      if (!p.duplicate) {
        this.lastRelayAt = at;
        await this.store.setKV(KV_LAST_RELAY, at);
      }
    } else {
      m.attempts[peer.peerId] = (m.attempts[peer.peerId] ?? 0) + 1;
      m.delivery_log.push({ at, status: 'INFO', detail: `${peer.name} refused: ${p.reason ?? 'unknown'}` });
    }
    await this.persist(m);
  }

  private async receiveStatus(peer: PeerInfo, updates: StatusUpdate[]): Promise<void> {
    const changed: StatusUpdate[] = [];
    for (const u of updates) {
      if (typeof u?.id !== 'string' || !(u.delivery_status in RANK) || typeof u.version !== 'string' || Number.isNaN(Date.parse(u.version))) {
        continue;
      }
      if (u.source !== 'SERVER' && u.source !== 'GATEWAY') {
        continue;
      }
      const m = await this.store.get(u.id);
      if (m && applyStatusUpdate(m, u, `Status update relayed by ${peer.name}`, this.isoNow())) {
        await this.persist(m);
        changed.push(u);
      }
    }
    // Gossip onward so acks reach the originating phone through intermediate relays.
    await this.broadcastStatus(changed, peer.peerId);
  }

  // ------------------------------------------------------------------ sending

  private inventory(): InventoryItem[] {
    return this.cache.map(m => ({ id: m.msg.message_id, v: m.status_version, r: RANK[m.delivery_status] }));
  }

  private async sendHello(peerId: string) {
    await this.send(peerId, {
      t: 'HELLO',
      v: PROTOCOL_VERSION,
      deviceId: this.identity.deviceId,
      name: this.identity.name,
      isGateway: this.isGatewayCapable,
      inventory: this.inventory(),
    });
  }

  private async broadcastHello() {
    for (const p of this.peers.values()) {
      if (p.state === 'CONNECTED') {
        await this.sendHello(p.peerId);
      }
    }
  }

  /** Send the peer any statuses we know that are newer than what its inventory says. */
  private async sendStatusesFor(peer: PeerInfo, inv: InventoryItem[]) {
    const updates: StatusUpdate[] = [];
    for (const item of inv) {
      const m = this.cache.find(x => x.msg.message_id === item.id);
      if (!m) {
        continue;
      }
      if (m.status_version && isNewerVersion(m.status_version, item.v ?? null)) {
        updates.push({ id: item.id, delivery_status: m.delivery_status, rescue_status: m.rescue_status, version: m.status_version, source: 'SERVER' });
      } else if (!m.status_version && m.delivery_status === 'GATEWAY_REACHED' && (item.r ?? 0) < RANK.GATEWAY_REACHED) {
        updates.push({ id: item.id, delivery_status: 'GATEWAY_REACHED', rescue_status: null, version: this.isoNow(), source: 'GATEWAY' });
      }
    }
    if (updates.length) {
      await this.send(peer.peerId, { t: 'STATUS', updates });
    }
  }

  private async broadcastStatus(updates: StatusUpdate[], exceptPeer?: string) {
    if (!updates.length) {
      return;
    }
    for (const p of this.peers.values()) {
      if (p.state !== 'CONNECTED' || p.peerId === exceptPeer) {
        continue;
      }
      const relevant = updates.filter(u => p.knownIds.has(u.id));
      if (relevant.length) {
        await this.send(p.peerId, { t: 'STATUS', updates: relevant });
      }
    }
  }

  private async offerToAllPeers() {
    for (const p of this.peers.values()) {
      if (p.state === 'CONNECTED' && p.deviceId) {
        await this.offerTo(p);
      }
    }
  }

  /** Forward eligible messages to one peer, highest priority first. */
  private async offerTo(peer: PeerInfo) {
    if (peer.state !== 'CONNECTED') {
      return;
    }
    const nowMs = this.now();
    const inFlightForPeer = new Set(
      [...this.inFlight.keys()].filter(k => k.endsWith(`|${peer.peerId}`)).map(k => k.split('|')[0]),
    );
    for (const m of selectForPeer(this.cache, peer, nowMs, inFlightForPeer)) {
      this.inFlight.set(`${m.msg.message_id}|${peer.peerId}`, nowMs);
      const ok = await this.send(peer.peerId, { t: 'SOS', msg: m.msg });
      if (!ok) {
        this.inFlight.delete(`${m.msg.message_id}|${peer.peerId}`);
        const cur = await this.store.get(m.msg.message_id);
        if (cur) {
          cur.attempts[peer.peerId] = (cur.attempts[peer.peerId] ?? 0) + 1;
          await this.persist(cur);
        }
      }
    }
  }

  private async send(peerId: string, p: Packet): Promise<boolean> {
    if (!this.transport) {
      return false;
    }
    try {
      await this.transport.send(peerId, JSON.stringify(p));
      return true;
    } catch (e) {
      this.log(`send to ${peerId} failed: ${String(e)}`);
      return false;
    }
  }

  // ------------------------------------------------------------------ helpers

  private peerName(peerId: string) {
    return this.peers.get(peerId)?.name ?? peerId;
  }

  private isoNow() {
    return new Date(this.now()).toISOString();
  }

  private async persist(m: StoredMessage) {
    await this.store.put(m);
    const i = this.cache.findIndex(x => x.msg.message_id === m.msg.message_id);
    if (i >= 0) {
      this.cache[i] = m;
    } else {
      this.cache.push(m);
    }
    this.emit();
  }

  private async refreshCache() {
    this.cache = await this.store.list();
    this.emit();
  }

  private emit() {
    for (const l of [...this.listeners]) {
      l();
    }
  }

  /** Serialise all state mutations: transport callbacks arrive concurrently. */
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.lock.then(fn, fn);
    this.lock = run.catch(() => {});
    return run;
  }

  /** For screens: one message by id. */
  async getMessage(id: string): Promise<StoredMessage | null> {
    return this.store.get(id);
  }

  getPeers(): PeerSnapshot[] {
    return this.snapshot().peers;
  }

  /** Status the UI should show for a message. */
  static statusOf(m: StoredMessage): DeliveryStatus {
    return m.delivery_status;
  }
}
