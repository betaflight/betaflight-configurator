# Plan: Durable connection-lifecycle architecture (maximal end-state)

Status: Approved (via ExitPlanMode after 3 adversarial review rounds — serves as the spec gate). Scope: **maximal**.

## Context

Reconnection in betaflight-configurator has been patched 10+ times; latest symptom: applying a
preset reconnects the FC in **Virtual** mode. Hotfix shipped (PR #5208). A multi-round design
competition (3 independent architects, then adversarial red-teams + a ground-truth verifier)
established the real root causes and stress-tested the design. This plan is the maximal,
durable end-state: a single owner of connection lifecycle + intent, one reboot orchestrator, a
canonical readiness signal, a uniform transport contract, and the flasher sharing those
primitives — so the bug class becomes structurally unrepresentable.

## Root causes (code-grounded, verified)

1. **Reconnect target is read live from a mutable field.** The reboot retry calls
   `connectDisconnect()` which reads `PortHandler.portPicker.selectedPort` live; during the
   reboot window `selectActivePort()` re-derives it and (expert mode) falls through to
   `"virtual"`. Fix = freeze the target at reboot start.
2. **The reboot orchestrator is duplicated across FIVE call sites, two of them divergent live
   paths** — `serial_backend.reinitializeConnection`(+`rebootReconnect`), a near-verbatim
   `GUI.reinitializeConnection`(+`_waitForReconnection`+ its own `showRebootDialog`),
   `useReboot.waitForReconnection` (runs its OWN wait loop on top of serial_backend), and
   `useMspCliSession.scheduleReconnect`. CLI-tab reboot and Vue-tab reboot behave differently.
3. **No canonical readiness signal** — three loops poll `CONFIGURATOR.connectionValid`.

## VERIFIED CONSTRAINTS that shape the design (round-2 ground truth)

- **`path` is NOT a stable device identity and differs per transport** — WebSerial hardcodes
  `path:"serial"` for every device (identity is the reused W3C `SerialPort` object); **Tauri
  `path` is the OS path which commonly CHANGES on CDC reboot** (`/dev/ttyACM0`→`ACM1`, COM3→COM5);
  WebBluetooth `path` is an ephemeral `bluetooth_${counter++}`; Capacitor `path` is VID/PID-derived.
  ⇒ We must freeze a transport-resolvable **token**, not the display path.
- **Readiness is set in `finishOpen()` after the FULL MSP chain** (API_VERSION → FC_VARIANT →
  FC_VERSION → BUILD_INFO → BOARD_INFO → STATUS → UID → …), NOT right after `MSP_API_VERSION`.
  Plus **three non-standard ready paths set `connectionValid` directly**: virtual
  (`onOpenVirtual`), CLI-only and version-mismatch (`connectCli`). ⇒ Readiness is an FSM state
  with ≥3 entry edges, never "API_VERSION returned."
- **`connect_lock` is NOT held during the reboot reconnect loop** — the loop is reentrant;
  `removedDevice`, a user Disconnect, or a flash start can interleave.
- **`serial.js` already normalizes** protocol events (`_setupEventForwarding` re-dispatches
  connect/disconnect/receive/addedDevice/removedDevice with `{...detail, protocolType}`).
- **No cross-tab coordination exists** (no `navigator.locks`/`BroadcastChannel`); two tabs can
  both `port.open()` the same device.
- **Capacitor/Android backgrounding auto-detaches USB** → looks like an unexpected disconnect.
- **`connectionTimestamp` is a hidden second readiness/throttle side-channel** (set via a 100 ms
  `setTimeout`, read by the auto-connect guard).

## Target architecture (maximal)

- **Owner = plain `src/js/connection_fsm.js` module** — hand-rolled FSM (state enum + explicit
  transition table; illegal transitions throw in dev, log+ignore in prod). Holds the frozen
  reconnect token, the single reboot orchestrator, and the `connect_lock` mutex. No
  Vue/Pinia/serial_backend imports; lazily-constructed singleton (no init-order hazard).
- **`useConnectionStore` = thin reactive read-model** subscribing to the FSM snapshot.
- **States:** `IDLE → CONNECTING → HANDSHAKING → CONNECTED`; `CONNECTED → REBOOTING →
  RECONNECTING → (CONNECTING)`; `CONNECTED → DISCONNECTING → IDLE`; `CLI` (ready, subset);
  `FLASHING` (delegated); `FAILED → IDLE`. Readiness = entering `CONNECTED`/`CLI` via one of
  **three edges**: full-MSP (`finishOpen`), cli-ready (`connectCli`), virtual-ready
  (`onOpenVirtual`).
- **Frozen `ReconnectToken`** = `{ transportType, opaqueId, baud, isVirtual }` where `opaqueId`
  is transport-supplied and re-resolvable; each transport implements
  `resolveReconnectTarget(token) → currentPath|null` (WebSerial: the SerialPort ref; Tauri:
  match VID/PID/serialNumber via `getDevices()` to find the NEW path; BLE: GATT device id;
  Capacitor: deviceKey). The FSM NEVER reads `portPicker.selectedPort` during a reconnect.
- **Single reboot orchestrator** using **AbortController + async/await** (replaces the
  timeout/interval id-sharing hack). `prepareDisconnect`/user-disconnect/flash-start call
  `abort()`. All FIVE call sites — incl. `stores/connection.js reboot()` and `useCli.js` —
  redirect to it **atomically in one slice**.
- **Normalized `LinkEvent` contract** (`open|closed|lost|data|deviceArrived|deviceLeft`) layered
  on the existing `serial.js` normalization; each transport also exposes
  `resolveReconnectTarget`. FSM never branches on `protocolType`.
- **`connect_lock` becomes an RAII mutex** (acquire returns a release token; release idempotent,
  always in `finally`). Audit all 8 current write sites (webstm32 ×N, useFirmwareFlashing ×N,
  serial_backend teardown). FSM holds it across REBOOTING/CONNECTING; reentrant
  `connectDisconnect`/`removedDevice` are rejected by the transition table, not silently no-op'd.
- **`pagehide` → FSM `shutdown()`** that cancels all timers and force-closes any open transport,
  ungated by `isConnected`/lock. **Multi-tab:** take a `navigator.locks` lock keyed by the token
  (or explicitly document single-tab-only).
- **Legacy globals → read-only computed mirrors** of FSM state (maximal scope): reroute every
  writer of `CONFIGURATOR.connectionValid/virtualMode/cliValid/cliActive` and
  `GUI.connected_to/connecting_to/connect_lock` through the FSM; dev getters throw on write to
  surface missed writers. Subsumes the `connectionTimestamp` side-channel.
- **VirtualSerial extends `EventTarget`** (synthetic connect/disconnect) — virtual stops being
  special-cased.
- **Flasher = sibling sub-machine** sharing the token, RAII lock, and readiness probe; STM32→DFU
  handoff stays in `webstm32.js`; `beginDeviceReplacement()` stands the MSP reconnect down.
- **Timeouts → one per-transport policy map** `{ initialDelay, maxDelay, deadline }`; keep BLE
  flush+retry (no disconnect-on-reboot), Tauri 1 s poll, DFU `waitForDfu`, one give-up ceiling.

## Implementation — slices (each one PR, green tests, bisectable)

- **S0 — Characterization tests.** Pin behavior of all 5 reboot paths + `selectActivePort`
  fallback; encode the preset→virtual regression AND a CLI-vs-Vue BLE-reboot parity test (fails
  today, proving divergence).
- **S1 — Frozen reconnect token + per-transport `resolveReconnectTarget`.** Capture token at
  reboot/connect start; reconnect resolves it; `selectActivePort` reverts to discovery-only.
  Banks the bug-class fix (supersedes #5208 guard). Fixes the Tauri path-change failure.
- **S2 — Atomic orchestrator consolidation.** Introduce `connection_fsm.js` + AbortController
  reboot loop; redirect ALL five call sites (serial_backend, gui.js, useReboot, useMspCliSession,
  stores/connection.js, useCli.js) in one PR; delete gui.js's duplicate dialog/wait loop.
- **S3 — Readiness-as-state with 3 edges.** Emit from `finishOpen`/`connectCli`/`onOpenVirtual`;
  reboot watchers subscribe to FSM state instead of polling `connectionValid`.
- **S4 — FSM owns lifecycle flags + RAII `connect_lock` + `DISCONNECTING` state.** Move
  `isConnected`/`intentionalDisconnect`/timers in; reject reentrant events via the table.
- **S5 — `pagehide` shutdown + multi-tab `navigator.locks` decision.**
- **S6 (a–e) — Per-transport `LinkEvent` adapters + `resolveReconnectTarget`**, one transport per
  PR behind a capability flag (WebSerial, Capacitor/TCP, BLE, Tauri, Virtual+EventTarget).
  **Lands before/with S2's orchestrator** so it never branches on `protocolType` (round-2 ordering fix).
- **S7 — Legacy globals → read-only computed mirrors** (reroute all writers; throw-on-write in dev).
- **S8 — Flasher sub-machine** on shared token + RAII lock + `beginDeviceReplacement()`.
- **S9 — Cleanup** dead globals/timers/fallbacks and the #5208 scaffolding.

Note the dependency: **S6 adapters must precede S2's single orchestrator** (or S2 ships a
temporary per-transport shim removed in S6).

## Critical files

`src/js/connection_fsm.js` (new) · `src/stores/connection.js` · `src/js/serial_backend.js` ·
`src/js/gui.js` · `src/js/port_handler.js` · `src/composables/useReboot.js` ·
`src/composables/useMspCliSession.js` · `src/composables/useCli.js` ·
`src/js/protocols/{WebSerial,TauriSerial,CapacitorSerial,WebBluetooth,VirtualSerial}.js` ·
`src/js/protocols/{webstm32,usbdfu}.js` · `src/composables/useFirmwareFlashing.js` ·
`src/js/data_storage.js` (CONFIGURATOR mirrors) · tests under `test/js/`.

## Verification

- **Vitest:** standalone FSM transition-table tests (every state×event, illegal transitions
  rejected); "enumeration during REBOOTING cannot change the token"; CLI-vs-Vue BLE-reboot
  parity; readiness fires for virtual + CLI + full-MSP; Tauri path-change reconnect resolves to
  the new path; RAII lock never leaks; pagehide shutdown cancels timers.
- **Manual transport matrix** (release gate): WebSerial (slow STM32H7), WebBluetooth reboot,
  TauriSerial desktop (CDC path change), CapacitorSerial Android (+ backgrounding), TCP/SITL,
  Virtual, DFU flash, STM32 serial flash — each: preset-apply reconnect, Save-and-Reboot, full
  flash + reconnect.

## Round 3 — required additions (folded in)

- **[FATAL] WebSerial device identity.** `createPort` hardcodes `path:"serial"` for every device,
  so the token can't disambiguate FCs AND `removedDevice` matching (`serial_backend.js:111`,
  `path === GUI.connected_to`) disconnects the wrong session when any serial device is unplugged.
  Fix: `createPort` assigns a unique `path` (`serial_${counter}`); the WebSerial reconnect token
  is the live `SerialPort` object identity; `resolveReconnectTarget` matches by port ref;
  `removedDevice` compares the port object, not the string.
- **[FATAL] MSP handshake has no reject/give-up.** `MSP.send_message` resends forever and
  `MSP.promise` never rejects (`msp.js:517-552`), so the `onOpen` chain has no terminal-failure
  edge — an FC that answers `API_VERSION` then stalls (brownout/reboot) hangs in HANDSHAKING.
  Fix: give `MSP.promise` a per-request timeout+reject; the FSM owns a **bounded HANDSHAKING
  timeout → FAILED → DISCONNECTING**, independent of `connectionValid`; readiness state carries a
  quality (FULLY_READY / CLI_ONLY) so consumers don't read a half-populated `FC.CONFIG`.
- **[SERIOUS] WebBluetooth abort + identity.** `disconnect()` never sets `openCanceled`, so an
  in-flight GATT connect can't be aborted (a late `connect` resurrects a DISCONNECTING/IDLE FSM);
  and BLE `path` is an ordinal `bluetooth_${counter++}` reset on every `loadDevices()` — unstable.
  Fix: add the `openCanceled` contract (mirror TauriSerial); key BLE reconnect on the stable
  `device.id`; stop reassigning ordinal paths. Transition table: `connect-succeeded while
  DISCONNECTING` → immediate teardown.
- **[SERIOUS] Reboot is a direct call from 5 sites, not an event** (`MSPHelper.js`, `useCli.js`
  ×2, `OsdTab.vue`, `stores/connection.js`) → the table can't guard it. Make `reboot` a
  first-class FSM event; reject `reboot` while REBOOTING/RECONNECTING (avoids extending the old
  loop's window). Add a **FLASHING state that hard-blocks connect/reconnect/reboot** (the flasher
  grabs the raw port via `serial.connect`/`getNativePort`, bypassing the lock today).
- **[SERIOUS] `navigator.locks` not guaranteed** on Tauri WebKitGTK / old Android WebView, and
  unused today. Feature-detect; fall back to no-op (Tauri/Capacitor are single-webview anyway) or
  a `storage`-event mutex for true multi-tab browsers. Never call unconditionally.
- **[MODERATE] Drain the MSP queue before reconnect.** `rebootReconnect` doesn't
  `MSP.disconnect_cleanup()`, so reboot-command resends collide with the new handshake. FSM calls
  cleanup on entering RECONNECTING.
- **[TRACTABILITY] Mirror-shim = 52 writes / 12 files.** 30 writes (7 fields) are low-risk in 5
  core files → one slice. **`GUI.connect_lock` = 22 writes / 7 files, reentrant** → needs a
  ref-counting `LockManager` (acquire/release by owner) as an intermediate mechanical step before
  routing through the FSM. Confirms the RAII-lock requirement with concrete scope.
- **[MINOR] Tauri two-identical-FCs / empty `serial_number`** → VID/PID re-resolution is
  ambiguous; don't auto-bind silently — prefer the path that newly appeared in the reboot window,
  else surface a re-pick. Document as a known limitation.

## Review ledger (loop-until-convergence)

- **Round 1** (3 architects): converged on frozen target + single owner + readiness signal +
  flasher-shares-primitives; surfaced the duplicated orchestrators.
- **Round 2** (red-team + skeptic + verifier): FATAL — path not stable (per-transport token +
  resolver); readiness = state with 3 edges (not API_VERSION); 5 divergent call sites consolidate
  atomically. SERIOUS — reentrancy/lock, pagehide leak, slice ordering, RAII lock. Verified
  WebSerial constant path, Tauri path-change, 3 non-MSP ready paths, no cross-tab coordination,
  Capacitor backgrounding, connectionTimestamp side-channel. **All applied above.**
- **Round 3** (red-team v2 + writer-audit + test/MSP-feasibility): 2 NEW FATAL (WebSerial
  identity/`removedDevice` collision; MSP no-reject handshake) + 5 SERIOUS, **all in the
  transport-adapter + MSP layer, none in orchestration**. Writer-audit: 52 writes/12 files,
  `connect_lock` needs a ref-counting LockManager. Test-feasibility: FSM is fully unit-testable;
  +1 moderate (MSP queue drain). All folded in above.

- **Convergence read:** The **orchestration layer has converged** — rounds 2→3 produced no new
  orchestration-level findings. Remaining FATAL/SERIOUS risk is now **localized and enumerable in
  two areas**: (1) per-transport identity + abort contracts (WebSerial port-ref + unique path,
  WebBluetooth `openCanceled` + stable id, Tauri re-resolution), and (2) the MSP handshake
  needing a real reject/bounded timeout. These are concrete implementation specs, not open design
  questions. Further *abstract* red-teaming will keep surfacing per-transport quirks with
  diminishing returns; the fastest way to flush the rest is to implement **S0 (characterization
  tests, encoding the known bugs) + S1 + the transport-identity/MSP-reject fixes** against the
  real transport APIs, which surfaces ground truth faster than more planning rounds. Recommend:
  begin implementation at S0; treat each transport adapter as its own small, separately-verified
  slice with the contract above.

## Process

Supersedes the local working `plan.md`; on finalization I'll sync `plan.md` (kept local, not
committed), decompose into `issues.md` via `/tickets`, drive with `/pipeline`. Work on
`refactor/connection-state-machine`, rebased onto master after #5208 merges.
