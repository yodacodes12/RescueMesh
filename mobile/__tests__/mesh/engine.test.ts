/**
 * End-to-end engine test of the flood scenario over the simulated radio:
 * A (offline) -> B (relay) -> C (gateway) -> server, then the coordinator's
 * acknowledgement travels back C -> B -> A.
 */
import { MeshEngine } from '../../src/mesh/core/engine';
import { GatewayClient } from '../../src/mesh/core/gatewayClient';
import { InMemoryStore } from '../../src/mesh/core/store';
import { SimulatedNetwork, SimulatedTransport } from '../../src/mesh/transports/SimulatedTransport';
import { FakeServer } from './fakeServer';

const settle = async (ms = 120) => {
  for (let i = 0; i < 6; i++) {
    await new Promise<void>(r => setTimeout(r, ms / 6));
  }
};

async function phone(net: SimulatedNetwork, id: string, server: FakeServer) {
  const e = new MeshEngine({
    identity: { deviceId: id, name: id },
    store: new InMemoryStore(),
    api: new GatewayClient(() => 'http://fake', server.fetch as never),
  });
  await e.init();
  await e.setTransport(new SimulatedTransport(net));
  await e.setInternetReachable(false);
  return e;
}

const sos = {
  emergency_type: 'FLOOD' as const, priority: 'CRITICAL' as const, latitude: 9.5, longitude: 76.3,
  description: 'Family on roof', people_affected: 4,
};

describe('MeshEngine multi-hop', () => {
  it('relays A -> B -> C, uploads via gateway, and returns the ack to A', async () => {
    const server = new FakeServer();
    const net = new SimulatedNetwork(5);
    const A = await phone(net, 'dev-A-0001', server);
    const B = await phone(net, 'dev-B-0002', server);
    const C = await phone(net, 'dev-C-0003', server);

    const created = await A.createSOS(sos);
    const id = created.msg.message_id;
    await settle();
    expect((await A.getMessage(id))!.delivery_status).toBe('CREATED_LOCAL');

    net.link('dev-A-0001', 'dev-B-0002');
    await settle();
    const a1 = (await A.getMessage(id))!;
    expect(a1.delivery_status).toBe('RELAYED'); // NOT server-received
    const b1 = (await B.getMessage(id))!;
    expect(b1.origin).toBe('RELAY');
    expect(b1.msg.hop_count).toBe(1);
    expect(b1.msg.is_simulated).toBe(true);
    expect(server.records.size).toBe(0);

    net.unlink('dev-A-0001', 'dev-B-0002'); // B walks away from A
    net.link('dev-B-0002', 'dev-C-0003');
    await settle();
    const c1 = (await C.getMessage(id))!;
    expect(c1.msg.hop_count).toBe(2);
    expect(c1.msg.relay_history.map(h => h.device_id)).toEqual(['dev-A-0001', 'dev-B-0002', 'dev-C-0003']);

    await C.setInternetReachable(true); // C finds signal -> gateway
    await settle(300);
    expect(server.records.get(id)?.via).toBe('GATEWAY');
    expect((await C.getMessage(id))!.delivery_status).toBe('SERVER_RECEIVED');

    // Coordinator acknowledges and assigns on the server.
    server.set(id, { delivery_status: 'COORDINATOR_ACKNOWLEDGED', rescue_status: 'ASSIGNED' });
    await C.tick();
    await settle();
    expect((await C.getMessage(id))!.delivery_status).toBe('ASSIGNED');
    expect((await B.getMessage(id))!.delivery_status).toBe('ASSIGNED');

    // B meets A again: the ack reaches the originating phone.
    net.unlink('dev-B-0002', 'dev-C-0003');
    net.link('dev-A-0001', 'dev-B-0002');
    await settle();
    const a2 = (await A.getMessage(id))!;
    expect(a2.delivery_status).toBe('ASSIGNED');
    expect(a2.rescue_status).toBe('ASSIGNED');
    expect(a2.delivery_log.map(l => l.status)).toEqual(
      expect.arrayContaining(['CREATED_LOCAL', 'RELAYED', 'ASSIGNED']));

    // Duplicate suppression: exactly one record, and A did not get its own SOS back as a relay copy.
    expect(server.records.size).toBe(1);
    expect((await A.getMessage(id))!.origin).toBe('SELF');
    for (const e of [A, B, C]) {
      await e.setTransport(null);
    }
  });

  it('submits directly when the originating phone is online', async () => {
    const server = new FakeServer();
    const net = new SimulatedNetwork(5);
    const A = await phone(net, 'dev-A-0001', server);
    await A.setInternetReachable(true);
    const { msg } = await A.createSOS(sos);
    await settle();
    expect(server.records.get(msg.message_id)?.via).toBe('DIRECT');
    expect((await A.getMessage(msg.message_id))!.delivery_status).toBe('SERVER_RECEIVED');
    await A.setTransport(null);
  });

  it('does not loop in a triangle and keeps one copy per phone', async () => {
    const server = new FakeServer();
    const net = new SimulatedNetwork(5);
    const ids = ['dev-A-0001', 'dev-B-0002', 'dev-C-0003'];
    const [A, B, C] = await Promise.all(ids.map(i => phone(net, i, server)));
    await A.createSOS(sos);
    net.link(ids[0], ids[1]);
    net.link(ids[1], ids[2]);
    net.link(ids[2], ids[0]);
    await settle(300);
    for (const e of [A, B, C]) {
      await e.tick();
    }
    await settle(300);
    for (const e of [A, B, C]) {
      expect(e.snapshot().messages).toHaveLength(1);
      await e.setTransport(null);
    }
  });
});
