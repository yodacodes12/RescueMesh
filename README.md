# RescueMesh

**Offline-first emergency communication and rescue coordination.**
*When Networks Fail, Communities Become the Network.*

RescueMesh lets a person with no mobile signal send an SOS that hops phone-to-phone
(Bluetooth / Wi-Fi, no internet) until any phone in the chain gets connectivity and
uploads it. Rescue coordinators see it on a live dashboard. Their acknowledgement then travels
back over the same mesh to the person who asked for help.

```
 Person A (no signal)      Person B (relay)        Person C (gets signal)        Rescue server          Coordinator
 ┌──────────┐  Nearby   ┌──────────┐  Nearby   ┌──────────┐   HTTPS    ┌──────────────┐  ┌──────────────┐
 │ SOS saved│ ───────▶  │ store &  │ ───────▶  │ gateway  │ ────────▶  │ FastAPI +    │─▶│ React + Map  │
 │ in SQLite│ ◀───────  │ forward  │ ◀───────  │ uploads  │ ◀────────  │ PostgreSQL   │◀─│ ack / assign │
 └──────────┘  status   └──────────┘  status   └──────────┘  status    └──────────────┘  └──────────────┘
```

| Part | Path | Stack |
|---|---|---|
| Android app | `mobile/` | React Native 0.88, TypeScript, React Navigation, SQLite (op-sqlite), Kotlin TurboModule (Google Nearby Connections) |
| Mesh engine | `mobile/src/mesh/core/` | Pure TypeScript, so it also runs in Node for tests and the demo script |
| Backend | `backend/` | Python, FastAPI, SQLAlchemy 2, PostgreSQL, Pydantic, JWT |
| Dashboard | `dashboard/` | React, TypeScript, Tailwind CSS v4, Leaflet / OpenStreetMap |

---

## 1. Quick start (backend + dashboard + simulated demo, no phone needed)

Prerequisites: Docker, Python 3.11+ with [uv](https://docs.astral.sh/uv/), Node 22+.

```bash
# 1. Database (PostgreSQL 16 in Docker on port 5433)
cp .env.example .env                 # then set POSTGRES_PASSWORD
./scripts/db-up.sh                   # or: docker compose up -d db

# 2. Backend
cd backend
cp .env.example .env                 # set CHANGE_ME (DB password) and JWT_SECRET
#   JWT_SECRET: python -c "import secrets; print(secrets.token_urlsafe(48))"
uv sync
uv run python -m app.init_db         # creates tables + admin; prints a generated password once
uv run python -m app.seed_demo       # optional: 5 DEMO volunteers (badged "DEMO" in the UI)
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
#   Swagger UI: http://localhost:8000/docs

# 3. Dashboard (new terminal)
cd dashboard
cp .env.example .env                 # VITE_API_URL=http://localhost:8000
npm install && npm run dev           # http://localhost:5173, log in as admin

# 4. Run the flood scenario end to end (new terminal)
cd mobile && npm install
npx tsx scripts/demo-scenario.ts --wait-for-dashboard
#   ...then acknowledge + assign the SOS on the dashboard and watch the status return to Person A.
#   Fully automatic: RESCUEMESH_USER=admin RESCUEMESH_PASSWORD=... npx tsx scripts/demo-scenario.ts
```

See [`docs/DEMO.md`](docs/DEMO.md) for the hackathon demo script.

## 2. Android app

Prerequisites: Android Studio (SDK 36, NDK 27.1, JDK 17–21), an Android device with
Google Play services (Android 7+). **Real mesh relaying needs 2 or more physical phones.** The
emulator has no Bluetooth, so use Simulation mode there.

```bash
cd mobile
npm install
npx react-native run-android          # debug build on a connected device / emulator
# Release APK:  cd android && ./gradlew assembleRelease
```

On first launch, open **Profile → Rescue server URL** and enter your laptop's LAN address,
for example `http://192.168.1.20:8000` (the default `10.0.2.2:8000` only works in the emulator). Then
tap **Test connection**. Debug builds allow plain HTTP. Release builds expect HTTPS.

### Modes (Home → Mesh network status)

* **Real devices**: Google Nearby Connections. Every phone running RescueMesh advertises and
  discovers simultaneously. Open the app on 2–3 phones, turn mobile data / Wi-Fi off on
  phone A, and leave it on for phone C.
* **Simulation**: virtual *Person B* and *Person C* run the real mesh engine inside the app.
  Only the radio links are simulated. Person C's upload to the server is real HTTP. Everything
  created or relayed in this mode is flagged `is_simulated` and shown with a **SIMULATED** badge
  on the dashboard and in the app.

## 3. Tests

```bash
cd backend && uv run pytest              # 12 API tests against real PostgreSQL (rescuemesh_test DB)
cd mobile  && npm test                   # mesh engine unit + multi-hop tests, full-app UI smoke test
cd mobile  && npm run typecheck          # app + scripts
cd dashboard && npm run build            # type-check + production build
cd mobile  && npx tsx scripts/demo-scenario.ts   # live end-to-end run against the running backend
```

What is covered:
* **Backend**: idempotent ingest and duplicate merging across gateways, per-message rejection
  (expired / hop limit / future timestamps), validation errors, auth on coordinator endpoints,
  status query without PII, full RECEIVED→ACKNOWLEDGED→ASSIGNED→IN_PROGRESS→RESOLVED lifecycle,
  priority override and ordering, dashboard stats.
* **Mesh engine**: UUIDs, validation of untrusted messages, priority ageing, relay-policy
  eligibility (expiry, hop limit, loop prevention, retry limit), status monotonicity, and that a
  relay can never claim server receipt. Multi-hop tests cover A→B→C→server, the ack travelling back to A,
  direct online submission, and no loops or duplicates in a fully connected triangle.
* **App UI**: boots the real app with mocked native modules (onboarding → home → create SOS →
  confirmation).

## 4. Architecture and key decisions

### 4.1 Device-to-device transport: why Google Nearby Connections

The plan asks for BLE and Wi-Fi Direct. These are the realities on Android:

* React Native has **no** built-in peer-to-peer networking. Any real mesh needs native code.
* Raw **BLE** needs the phone to be both a GATT server (peripheral) and a client (central).
  You would also have to manage advertising limits (31 bytes) and fragment JSON into ~20–512 byte MTU chunks.
  Existing RN BLE libraries are central-only.
* Raw **Wi-Fi Direct** needs group-owner negotiation and socket servers. It shows system dialogs on
  many devices and behaves differently across vendors.
* **Google Nearby Connections** (Play services) discovers peers over BLE and then upgrades the
  link to Bluetooth Classic or Wi-Fi (hotspot / Wi-Fi Direct-style) automatically. It needs no internet
  and offers an M-to-N `P2P_CLUSTER` topology. It uses BLE and Wi-Fi under the hood, behind one API.

So `mobile/android/app/src/main/java/org/rescuemesh/nearby/NearbyModule.kt` is a Kotlin
TurboModule around Nearby Connections. It only moves bytes between **direct neighbours**.
Multi-hop is implemented above it, in TypeScript.

### 4.2 Modular communication layer

| Concern | Module |
|---|---|
| Device discovery, connection, transmission, reception | `Transport` interface (`mesh/core/transport.ts`). Implementations: `NearbyTransport` (real), `SimulatedTransport` (labelled) |
| Local persistence | `MessageStore` (`mesh/core/store.ts`). Implementations: `SQLiteStore` (app), `InMemoryStore` (tests / simulation) |
| Relay decisions | `mesh/core/relayPolicy.ts` |
| Validation of untrusted input | `mesh/core/validation.ts` |
| Delivery-status rules | `mesh/core/status.ts` |
| Orchestration + exchange protocol | `mesh/core/engine.ts` (`MeshEngine`) |
| Internet gateway | `mesh/core/gatewayClient.ts` |

**Exchange protocol** (JSON packets between two connected phones):
`HELLO{inventory}` both ways → the sender sends only the `SOS{msg}` packets the peer lacks, highest priority
first → the receiver validates, rejects duplicates, **persists**, then replies `RECEIPT` → the sender
marks the message as relayed to that peer. `STATUS{updates}` packets carry server acknowledgements
back toward the originating phone, and every phone that holds the message gossips them onward.

### 4.3 Reliability rules (all implemented)

| Rule | How |
|---|---|
| Unique message ID | UUID v4 from a CSPRNG, created once on the originating phone |
| Duplicate suppression | Phone: primary key in SQLite plus inventory exchange before transfer. Server: `UNIQUE(message_id)` and savepoint-protected insert. A duplicate merges new relay hops instead of creating a record |
| Store-before-forward | `RECEIPT` is sent only after the message is durable |
| Priority-aware forwarding | `score = base(priority) + min(age_min × 2, 600)`, the same formula on phone and server. Ageing stops starvation, but nothing outranks a fresh CRITICAL |
| Controlled retries | Per-peer attempt counter (max 3). A missing receipt after 15 s counts as a failure. Retries happen on later ticks and reconnects |
| Max hop count | 8. Enforced on receipt and on the server |
| Expiry | 48 h by default (max 72 h). Expired messages stop being forwarded and are marked `EXPIRED`, never deleted |
| Loop prevention | A message is never sent to a device already in its `relay_history`, to a peer known to hold it, or past the hop limit |
| Acknowledgements | Server receipt and coordinator ack are recorded server-side and propagated back as versioned status updates |
| Never delete on relay | Messages are only ever updated, never removed |

### 4.4 Two separate status models

**Phone (communication)**: `CREATED_LOCAL → RELAYED → GATEWAY_REACHED → SERVER_RECEIVED →
COORDINATOR_ACKNOWLEDGED → ASSIGNED → RESOLVED`, plus `SEND_FAILED`, `EXPIRED`, `REJECTED` and `CANCELLED`.
* `RELAYED` only means another phone stored it. The UI says so explicitly.
* Only the server can produce `SERVER_RECEIVED` or later states. Status updates from peers are tagged
  `SERVER` or `GATEWAY`. A `GATEWAY` claim can at most say `GATEWAY_REACHED`, and this rule is enforced and tested.
* Server-sourced statuses are versioned (`updated_at`), so the newest wins. That means a coordinator can re-open a request.

**Server**: *delivery* (`SERVER_RECEIVED`, `COORDINATOR_ACKNOWLEDGED`) is kept separate from
*rescue operation* (`RECEIVED → ACKNOWLEDGED → ASSIGNED → IN_PROGRESS → RESOLVED`, `CANCELLED`).
The dashboard shows them as two separate badges.

### 4.5 Backend API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/sos` | none (device) | Direct submission. `201` created, `200` duplicate, `422` rejected |
| POST | `/api/sos/sync` | none (gateway) | Batch upload. Per-message results |
| POST | `/api/sos/status-query` | none | Status for known IDs. **No location / description** |
| GET | `/api/sos` | coordinator | List (filters, priority-score order) |
| GET | `/api/sos/{id}` | coordinator | Detail, relay path, history, acks, assignments |
| PATCH | `/api/sos/{id}/status` | coordinator | Rescue status (validated transitions) |
| PATCH | `/api/sos/{id}/priority` | coordinator | Priority review (original kept) |
| POST | `/api/sos/{id}/acknowledge` | coordinator | Coordinator ack (idempotent) |
| POST/GET/PATCH | `/api/assignments` | coordinator | Assign volunteer, update assignment status |
| GET/POST/PATCH | `/api/volunteers` | coordinator | Volunteers |
| GET | `/api/dashboard/stats` | coordinator | Dashboard counters |
| POST | `/api/auth/login` · GET `/api/auth/me` | — | JWT login |
| GET/POST | `/api/users` | admin | Coordinator accounts |

The database has 8 tables: `users`, `devices`, `sos_requests`, `message_relay_history`, `sos_status_events`,
`volunteers`, `rescue_assignments` and `delivery_acknowledgements`. Reference DDL is in
`backend/sql/schema.sql`, and `python -m app.init_db` creates the schema.

### 4.6 Security and privacy (prototype level)

* No secrets are hardcoded. DB credentials, `JWT_SECRET` and the admin password come from `.env`. The app refuses
  to start without them, and the admin password is generated if not provided.
* Coordinator endpoints need a JWT, with roles `COORDINATOR` and `ADMIN`. Passwords are hashed with bcrypt. The dashboard keeps the token
  in `sessionStorage` and clears it on 401.
* Device endpoints are deliberately unauthenticated, because an SOS must never fail on a login. They are
  strictly validated and idempotent. The public status endpoint returns no PII.
* Relaying phones hide the description and show only an approximate (~100 m) location of other people's SOS.
  The phone number and emergency contact never leave the phone.
* Server logs contain message IDs and outcomes only. They never include names, descriptions or coordinates.
* SQLite lives in app-private storage. CORS is restricted to configured origins. Use HTTPS in deployment.

## 5. Known limitations (honest list)

1. **The Android build has not been compiled on the machine this was written on**, which had no Android SDK.
   The JS bundle builds with Metro, TypeScript passes, the UI smoke test boots the whole app, and the
   Kotlin TurboModule was checked against the React Native codegen output. The first `run-android`
   may still need small Gradle fixes.
2. **Nearby runs only while the app is in the foreground.** Background relaying needs an Android
   foreground service, which is future work.
3. **Peers are auto-accepted, and mesh payloads are not encrypted or signed.** A malicious phone could
   forge a "server acknowledged" status for others. The fix is to have the server sign status records
   (Ed25519) with the public key embedded in the app, and to encrypt SOS payloads to the server's key.
4. To avoid connection collisions, only the phone with the smaller device ID initiates a connection.
5. Nearby Connections needs Google Play services, so de-Googled phones can only use Simulation mode.
6. The map needs internet for OpenStreetMap tiles and Leaflet. Offline, it falls back to a coordinate list.
   Nearby devices are not drawn because Nearby does not share positions, and the backend publishes no rescue points yet.
7. Schema management uses `create_all` with an exported DDL file, not Alembic migrations.
8. Notifications are in-app vibration plus toast while the app is open, not push notifications.
