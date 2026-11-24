/**
 * Flood demo scenario against the REAL backend, without any phone.
 *
 *   npx tsx scripts/demo-scenario.ts [--api http://localhost:8000] [--wait-for-dashboard]
 *
 * Radio hops are SIMULATED (in-memory) and labelled as such; the HTTP upload,
 * PostgreSQL storage, dashboard and acknowledgement path are all real.
 *
 * Coordinator step: with RESCUEMESH_USER / RESCUEMESH_PASSWORD set, the script
 * acknowledges and assigns the SOS itself. With --wait-for-dashboard it waits
 * for a human coordinator to do it on the dashboard instead.
 */
import { MeshEngine } from '../src/mesh/core/engine';
import { InMemoryStore } from '../src/mesh/core/store';
import { STATUS_LABEL } from '../src/mesh/core/status';
import { FloodScenario } from '../src/mesh/simulation/FloodScenario';
import { SimulatedTransport } from '../src/mesh/transports/SimulatedTransport';

const args = process.argv.slice(2);
const API = args.includes('--api') ? args[args.indexOf('--api') + 1] : 'http://localhost:8000';
const WAIT = args.includes('--wait-for-dashboard');
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function banner(s: string) {
  console.log(`\n\x1b[1;34m== ${s}\x1b[0m`);
}

async function show(label: string, e: MeshEngine, id: string) {
  const m = await e.getMessage(id);
  const st = m ? `${m.delivery_status.padEnd(25)} ${STATUS_LABEL[m.delivery_status]}` : '(does not have it)';
  console.log(`  ${label.padEnd(10)} ${st}${m ? `  hops=${m.msg.hop_count}` : ''}`);
}

async function main() {
  const personA = new MeshEngine({
    identity: { deviceId: `sim-a-${Math.random().toString(36).slice(2, 8)}`, name: 'Person A (simulated)' },
    store: new InMemoryStore(),
    api: null,
  });
  const scenario = new FloodScenario(personA.identity.deviceId, () => API);
  await personA.init();
  await personA.setTransport(new SimulatedTransport(scenario.network));
  await personA.setInternetReachable(false);
  await scenario.start();
  const B = scenario.personB.engine;
  const C = scenario.personC.engine;
  const all = async (id: string) => {
    await show('Person A', personA, id);
    await show('Person B', B, id);
    await show('Person C', C, id);
  };

  banner('1. Flood. Person A has no internet and sends an SOS');
  const { msg } = await personA.createSOS({
    emergency_type: 'TRAPPED', priority: 'CRITICAL', latitude: 9.4975 + (Math.random() - 0.5) * 0.02, longitude: 76.3372 + (Math.random() - 0.5) * 0.02,
    description: 'Water rising fast. Elderly parents trapped on first floor, cannot walk.',
    people_affected: 3, is_simulated: true,
  });
  console.log(`  message_id ${msg.message_id}`);
  await sleep(300);
  await all(msg.message_id);

  banner('2. Person B comes within range of A [SIMULATED radio]');
  await scenario.setStep('B_MEETS_A', true);
  await sleep(800);
  await all(msg.message_id);

  banner('3. B walks to the relief camp and meets Person C [SIMULATED radio]');
  await scenario.setStep('B_MEETS_A', false);
  await scenario.setStep('B_MEETS_C', true);
  await sleep(800);
  await all(msg.message_id);

  banner(`4. Person C gets mobile data and acts as internet gateway -> ${API} [REAL HTTP]`);
  await scenario.setStep('C_ONLINE', true);
  await sleep(1500);
  await all(msg.message_id);
  const cMsg = await C.getMessage(msg.message_id);
  if (!cMsg || cMsg.delivery_status !== 'SERVER_RECEIVED') {
    throw new Error(`Upload failed: ${C.snapshot().lastError ?? 'unknown'}`);
  }

  banner('5. Rescue coordinator acknowledges and assigns a volunteer');
  const user = process.env.RESCUEMESH_USER;
  const password = process.env.RESCUEMESH_PASSWORD;
  if (user && password && !WAIT) {
    const tok = await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: user, password }),
    }).then(r => r.json() as Promise<{ access_token: string }>);
    const h = { Authorization: `Bearer ${tok.access_token}`, 'Content-Type': 'application/json' };
    await fetch(`${API}/api/sos/${msg.message_id}/acknowledge`, { method: 'POST', headers: h, body: '{"note":"Seen - dispatching boat"}' });
    const vols = (await fetch(`${API}/api/volunteers`, { headers: h }).then(r => r.json())) as { id: number; name: string; status: string }[];
    const v = vols.find(x => x.status === 'AVAILABLE');
    if (v) {
      await fetch(`${API}/api/assignments`, { method: 'POST', headers: h, body: JSON.stringify({ message_id: msg.message_id, volunteer_id: v.id }) });
      console.log(`  acknowledged and assigned to ${v.name} [REAL API]`);
    }
  } else {
    console.log('  Open the dashboard, acknowledge the SIMULATED SOS and assign a volunteer. Waiting...');
    for (;;) {
      await C.tick();
      const m = await C.getMessage(msg.message_id);
      if (m && (m.delivery_status === 'ASSIGNED' || m.delivery_status === 'RESOLVED')) {
        break;
      }
      await sleep(3000);
    }
  }
  await C.tick();
  await sleep(600);
  await all(msg.message_id);

  banner('6. B walks back to A: the acknowledgement reaches the originating phone [SIMULATED radio]');
  await scenario.setStep('B_MEETS_C', false);
  await scenario.setStep('B_MEETS_A', true);
  await sleep(800);
  await all(msg.message_id);

  const a = (await personA.getMessage(msg.message_id))!;
  banner('Delivery history on Person A');
  for (const l of a.delivery_log) {
    console.log(`  ${l.at}  ${l.status.padEnd(25)} ${l.detail}`);
  }
  await scenario.stop();
  await personA.setTransport(null);
  const ok = a.delivery_status === 'ASSIGNED' || a.delivery_status === 'RESOLVED';
  console.log(ok ? '\n\x1b[32mScenario complete.\x1b[0m' : '\n\x1b[31mAck did not reach Person A.\x1b[0m');
  process.exit(ok ? 0 : 1);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
