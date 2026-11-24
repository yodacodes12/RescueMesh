# RescueMesh – Android app

See the [project README](../README.md) for setup, architecture and the demo runbook.

```bash
npm install
npx react-native run-android   # needs Android SDK + device/emulator
npm test                       # mesh engine + UI smoke tests
npm run typecheck
npx tsx scripts/demo-scenario.ts --wait-for-dashboard   # scenario against a running backend
```

Layout: `src/mesh/core` (transport-agnostic engine), `src/mesh/transports` (Nearby / Simulated),
`src/mesh/native` (TurboModule spec), `android/.../nearby` (Kotlin Nearby bridge),
`src/storage` (SQLite), `src/state` (MeshContext), `src/screens`, `src/components`.
