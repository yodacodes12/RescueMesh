# Hackathon demo runbook: "Flood in the village"

Setup: backend and dashboard running (see README §1), the dashboard open on a projector and logged in,
and the phone(s) pointed at the laptop's LAN IP (Profile → Rescue server URL → Test connection).

## Option A: real phones (2–3 Android phones with Play services)

| Phone | Role | Setup |
|---|---|---|
| A | Person in danger | Mobile data **and** Wi-Fi off. Bluetooth on |
| B | Relay | Mobile data and Wi-Fi off. Bluetooth on |
| C | Gateway | Wi-Fi on (same network as the laptop) |

All three: **Mesh network → Real devices**, with permissions granted.

1. **A**: tap **SEND SOS** → *Trapped*, *Critical*, Capture Location, description → **Send SOS**.
   The screen shows **"Saved on this device"** and points out that a nearby phone receiving it does not mean rescuers have it.
2. Bring **B** near A. A's status changes to **"Relayed to nearby device"**, and B shows the alert under
   *Alerts → Carrying for others* (description hidden, location approximate).
3. Take **B** away from A and near **C**. C receives the SOS and, being online, uploads it immediately.
4. The **dashboard** shows a new CRITICAL marker with the badges *Mesh · 2 hops*, the relay path A → B → C → Internet, and the delivery status
   *Server received*.
5. The coordinator clicks **Acknowledge**, then **Assign** a volunteer.
6. Bring **B** back to **A**. A vibrates and shows **"Rescue team assigned"**, and its delivery history
   lists every step.

## Option B: one phone, simulation mode

**Mesh network → Simulation.** The yellow SIMULATION badges show everywhere. "No internet on this phone" is on.

1. Send an SOS (same as step 1 above).
2. Toggle **"Person B is within range of you"**. The status changes to Relayed.
3. Toggle it off, then toggle **"Person B is within range of Person C"**.
4. Toggle **"Person C gets internet"**. The SOS appears on the dashboard with a **SIMULATED** badge.
   This upload is real HTTP to the real backend.
5. Acknowledge and assign on the dashboard.
6. Toggle off "B within range of C" and toggle on "B within range of you". The acknowledgement reaches you.

## Option C: no phone at all

```bash
cd mobile
npx tsx scripts/demo-scenario.ts --wait-for-dashboard
```
The terminal narrates each step and waits for you to acknowledge and assign on the dashboard. Then it shows the
status arriving back at Person A.

## Talking points

* "Delivered" is never claimed because another phone got the message. There are separate states for device, relay, gateway, server and coordinator.
* Duplicates: the same SOS arriving through two gateways creates one record, and the second path is merged into the relay history.
* Priority ageing: critical goes first, but low-priority requests are not starved.
* What is real and what is simulated is labelled everywhere: app, database (`is_simulated`) and dashboard.
