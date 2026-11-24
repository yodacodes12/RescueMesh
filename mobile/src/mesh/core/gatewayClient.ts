/**
 * HTTP client for the RescueMesh backend. Used by the originating phone for
 * direct submission and by any phone acting as an internet gateway.
 */
import type { RescueStatus, SOSMessage } from './types';

export interface IngestResult {
  message_id: string;
  result: 'created' | 'duplicate' | 'rejected';
  reason?: string | null;
  delivery_status?: string | null;
  rescue_status?: RescueStatus | null;
}

export interface SyncResponse {
  results: IngestResult[];
  created: number;
  duplicates: number;
  rejected: number;
  server_time: string;
}

export interface ServerStatus {
  message_id: string;
  delivery_status: string;
  rescue_status: RescueStatus;
  priority: string;
  updated_at: string;
}

type FetchLike = (url: string, init?: Record<string, unknown>) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

export class ApiError extends Error {
  constructor(message: string, readonly status: number | null) {
    super(message);
  }
}

export class GatewayClient {
  constructor(
    private readonly baseUrl: () => string,
    private readonly fetchImpl: FetchLike = (globalThis.fetch as unknown as FetchLike),
    private readonly timeoutMs = 8000,
  ) {}

  private async request<T>(path: string, method: 'GET' | 'POST', body?: unknown): Promise<{ status: number; data: T }> {
    const base = this.baseUrl().replace(/\/+$/, '');
    if (!base) {
      throw new ApiError('Server URL not configured', null);
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(`${base}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!res.ok && res.status !== 422) {
        throw new ApiError(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`, res.status);
      }
      return { status: res.status, data: (await res.json()) as T };
    } catch (e) {
      if (e instanceof ApiError) {
        throw e;
      }
      throw new ApiError(ctrl.signal.aborted ? 'Request timed out' : `Network error: ${String(e)}`, null);
    } finally {
      clearTimeout(timer);
    }
  }

  /** True only if the RescueMesh backend (not just "the internet") answers. */
  async health(): Promise<boolean> {
    try {
      const r = await this.request<{ status: string }>('/api/health', 'GET');
      return r.data.status === 'ok';
    } catch {
      return false;
    }
  }

  async submit(msg: SOSMessage): Promise<IngestResult> {
    const r = await this.request<IngestResult & { detail?: unknown }>('/api/sos', 'POST', msg);
    if (r.status === 422) {
      return { message_id: msg.message_id, result: 'rejected', reason: JSON.stringify(r.data.detail ?? r.data) };
    }
    return r.data;
  }

  async sync(gatewayId: string, gatewayName: string, isSimulated: boolean, messages: SOSMessage[]): Promise<SyncResponse> {
    const r = await this.request<SyncResponse>('/api/sos/sync', 'POST', {
      gateway_device_id: gatewayId,
      gateway_name: gatewayName,
      is_simulated: isSimulated,
      messages,
    });
    if (r.status === 422) {
      throw new ApiError('Sync batch rejected by server validation', 422);
    }
    return r.data;
  }

  async statusQuery(ids: string[]): Promise<{ statuses: ServerStatus[]; unknown: string[] }> {
    const r = await this.request<{ statuses: ServerStatus[]; unknown: string[] }>('/api/sos/status-query', 'POST', {
      message_ids: ids,
    });
    return r.data;
  }
}
