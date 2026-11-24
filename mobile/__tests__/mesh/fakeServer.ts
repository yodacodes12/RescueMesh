/** Minimal in-memory imitation of the backend's device endpoints, for engine tests. */
type Rec = { delivery_status: string; rescue_status: string; priority: string; updated_at: string; via: string };

export class FakeServer {
  records = new Map<string, Rec>();
  syncCalls = 0;
  private clock = Date.parse('2026-01-01T00:00:00Z');

  private tick() {
    this.clock += 1000;
    return new Date(this.clock).toISOString();
  }

  set(id: string, patch: Partial<Rec>) {
    const r = this.records.get(id)!;
    Object.assign(r, patch, { updated_at: this.tick() });
  }

  fetch = async (url: string, init?: Record<string, unknown>) => {
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    const reply = (status: number, data: unknown) => ({
      ok: status < 400,
      status,
      json: async () => data,
      text: async () => JSON.stringify(data),
    });
    const ingest = (m: { message_id: string; priority: string }, via: string) => {
      if (this.records.has(m.message_id)) {
        return { message_id: m.message_id, result: 'duplicate' };
      }
      this.records.set(m.message_id, {
        delivery_status: 'SERVER_RECEIVED', rescue_status: 'RECEIVED', priority: m.priority, updated_at: this.tick(), via,
      });
      return { message_id: m.message_id, result: 'created' };
    };
    if (path === '/api/health') {
      return reply(200, { status: 'ok' });
    }
    if (path === '/api/sos') {
      return reply(201, ingest(body, 'DIRECT'));
    }
    if (path === '/api/sos/sync') {
      this.syncCalls++;
      const results = body.messages.map((m: { message_id: string; priority: string; sender_id: string }) =>
        ingest(m, m.sender_id === body.gateway_device_id ? 'DIRECT' : 'GATEWAY'));
      return reply(200, { results, created: 0, duplicates: 0, rejected: 0, server_time: new Date().toISOString() });
    }
    if (path === '/api/sos/status-query') {
      const statuses = body.message_ids
        .filter((id: string) => this.records.has(id))
        .map((id: string) => ({ message_id: id, ...this.records.get(id) }));
      return reply(200, { statuses, unknown: [] });
    }
    return reply(404, { detail: 'not found' });
  };
}
