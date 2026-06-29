# Issues — Durable connection-lifecycle architecture

Source: `plan.md` (approved maximal end-state). Ordered for execution (dependencies noted).
Each item = one separately-shippable PR, green tests, bisectable. Phase 0 hotfix already shipped (PR #5208).

- [x] **S0 — Characterization tests** — done: 4 test files, 19 pass + 1 expected-fail (preset→virtual `it.fails`, flips in S1), eslint clean, committed `d153690c`. No source change.
  - Cover all 5 reboot paths: `serial_backend.reinitializeConnection`/`rebootReconnect`, `GUI.reinitializeConnection`/`_waitForReconnection`, `useReboot.waitForReconnection`, `useMspCliSession.scheduleReconnect`.
  - Encode the **preset→virtual** regression (currently-failing/xfail) and a **CLI-tab vs Vue-tab BLE-reboot parity** test (fails today, proving divergence).
  - Cover `selectActivePort` expert-mode virtual/manual fallback.

- [x] **S1a — Frozen reconnect target + `selectActivePort` discovery-only (orchestration core)** — done: `PortHandler.pinnedReconnectTarget` mechanism in `port_handler.js`/`serial_backend.js`/`useMspCliSession.js`; S0 preset→virtual test flipped to passing; full suite 252 green. Committed `b571a5ea`.
  - Follow-up (defer to S5 FSM shutdown): the pin can linger if a one-shot MSP-CLI reconnect never succeeds and is cancelled — `cancelScheduledReconnect` should also clear it. Minor (only suppresses expert fallback until next connect).
- [x] **S1b-WebSerial — WebSerial stable device identity (FATAL)** — done: WeakMap<SerialPort,id> stable id in `WebSerial.createPort`; device-specific `removedDevice` match in `serial_backend.js`; `selectProtocol` unaffected. +11 webserial tests; suite 267 green. Committed `470cc855`. Hardware confirmation of re-enum identity still wanted before PR.
- [x] **S1b-BLE — WebBluetooth stable identity (SERIOUS)** — done: path derived from stable `device.id` (was ordinal counter reset on refresh); `loadDevices` rebuilds from `wrapper.port` (fixes latent double-wrap). +9 BLE tests; suite 276 green. Committed `2c0fb257`. Hardware confirmation wanted before PR.
- [x] **S1b-Tauri — Tauri path-change re-resolution (FATAL)** — done as part of S6d (`9f9a7417`): structured ReconnectToken {path,vid,pid,serialNumber} + `resolveReconnectTarget` in TauriSerial. Real-device CDC-reboot verification still wanted before merge. Original deferral note retained below for context.
  - ORIGINAL (deferred): Clean implementation requires the structured `ReconnectToken` (S1a pins a plain path string; Tauri needs identity {vid,pid,serial} to re-resolve a changed OS path) — that token is S2/S6 territory. AND its correctness is dominated by Tauri-runtime/hardware behavior (does the path change? getDevices report new path w/ matching VID/PID? serial_number populated?) that is unverifiable in this environment. Do as part of S2/S6 with real-device testing — not as an isolated unverifiable slice.

- [x] **S-MSP — MSP handshake reject + bounded timeout (FATAL)** — done: opt-in `options.timeoutMs` on `send_message`/`promise` (rejects after bound, stops resending; default unchanged); deadline-timer cleanup in `msp.js`+`MSPHelper.js`; `MSP.disconnect_cleanup()` drains the queue before reconnect in `serial_backend.js`. +4 msp tests; suite 256 green. Committed `702a7fb7`. (Handshake wiring = S3.)

- [x] **S6 — Per-transport LinkEvent adapters + `resolveReconnectTarget` (must precede S2)** — DONE (all transports). 6a `605227b1`, 6b `1561ab86`, 6c `fbd5690d`, 6d `9f9a7417`, 6e `d9e56f94`. Every transport exposes `supportsLinkEvents`, the open/closed/lost/data/deviceArrived/deviceLeft contract, `getReconnectToken()` and `resolveReconnectTarget()`. serial.js forwards LinkEvents (capability-gated) + delegates token by transportType.
  - [x] **6a WebSerial** — done: new `src/js/protocols/LinkEvent.js` contract; WebSerial emits `open/closed/lost/data/deviceArrived/deviceLeft` + `getReconnectToken()`/`resolveReconnectTarget()`; `serial.js` forwards LinkEvents (capability-gated) + delegates token by transportType. +14 tests; suite 293 green. Committed `605227b1`.
  - [x] **6b Capacitor/TCP** — done: LinkEvent adapter + token contract on Websocket, CapacitorTcp, TauriTcp, CapacitorSerial; per-transport CLOSED-vs-LOST; TCP identity=address, Capacitor identity=`capacitor-<deviceId>` (null-on-absent → re-pick). +26 tests; suite 319 green. Committed `1561ab86`.
  - [x] **6c WebBluetooth** — done: LinkEvent adapter (LOST on unsolicited GATT drop) + `openCanceled` abort contract mirroring TauriSerial (disconnect during in-flight open signals cancel before state mutation) + bluetooth_<device.id> token. +10 tests; suite 329 green. Committed `fbd5690d`.
  - [x] **6d Tauri (+ S1b-Tauri)** — done: TauriSerial LinkEvent adapter + CDC path-change re-resolution. Token freezes {path,vid,pid,serialNumber}; resolveReconnectTarget follows path change via exact→unique serial→unique vid/pid→null(re-pick). +10 tests; suite 339 green. Committed `9f9a7417`. **Resolves the deferred S1b-Tauri FATAL below.**
  - [x] **6e Virtual** — done: VirtualSerial extends `EventTarget` + synthetic connect/disconnect + open/closed LinkEvents + isVirtual token; no longer special-cased. Committed `d9e56f94`.
  - Normalize to `open|closed|lost|data|deviceArrived|deviceLeft`; each exposes `resolveReconnectTarget`.

- [x] **S2 — Orchestrator consolidation** — depends on S1, S6. Done (S2a `1e44bef0` + S2b `7220eea4`). Split for bisectability:
  - [x] **S2a — connection_fsm.js module (pure, fully tested)** — done: State/Event enums + transition table (illegal→throw in dev), frozen token (enumeration-immutable), AbortController plumbing, snapshot read-model, single abortable `runReconnect()` loop (transport-agnostic, path-change tolerant, deadline+policy). `reboot` first-class (rejected while REBOOTING/RECONNECTING); FLASHING hard-blocks. Purely additive, zero live-behavior change. +19 tests; suite 365 green. Committed `1e44bef0`.
  - [x] **S2b — call-site rewiring (LIVE)** — done `7220eea4`: deleted gui.js's divergent reboot impl; gui.js → emits `reboot:request` → serial_backend's single `reinitializeConnection` (stores/connection.reboot + useCli inherit it). FSM records reboot intent (requestReboot/reconnectStarted/concludeReboot) at all window open/close points. **S0 CLI-vs-Vue parity test flipped from pinning divergence to asserting delegation/parity.** FSM-authoritative reentrancy + full connect/disconnect state wiring deferred to S4. **Live reboot across transport matrix wants hardware verify.**

- [x] **S3 — Readiness-as-state with 3 edges** — DONE. Acceptance gate (msp.js:531 `fc3e8679`), 3 readiness edges + quality (`b4e701cc`), bounded HANDSHAKING timeout→FAILED (`85b43e01`). Only the cosmetic watcher-subscription swap remains (folded to S9; functionally equivalent today).
  - Emit from `finishOpen` / `connectCli` / `onOpenVirtual`; readiness carries quality (FULLY_READY / CLI_ONLY).
  - [x] 3 readiness edges + quality (FULLY_READY/CLI_ONLY) wired into FSM — `b4e701cc`. Live singleton non-strict during migration (strict re-enabled S7).
  - [x] Bounded HANDSHAKING timeout → FAILED → DISCONNECTING — `85b43e01`: onOpen→HANDSHAKE; the 10s connecting-timeout + abortConnection dispatch FAIL; notifyClosed settles to IDLE.
  - [~] Reboot watchers: the FSM read-model (S7) is the canonical source; the reboot dialog/loop still poll `connectionValid` (functionally equivalent since finishOpen sets both). Full subscription swap folds into S9 cleanup.
  - **Acceptance (from /preview):** fix the S-MSP coalesced-request trap — `deadlineTimer` must arm even when a `timeoutMs` request coalesces onto an already-queued identical request (`msp.js:531`), or the handshake reject silently never fires.

- [~] **S4 — FSM owns lifecycle flags + RAII `connect_lock` + DISCONNECTING state** — depends on S2. Core done `7e23b715`:
  - [x] Ref-counting `LockManager` module (`src/js/lock_manager.js`, +7 tests) — the intermediate mechanism; the 22 `connect_lock` writes reroute through it in S7 Phase B.
  - [x] FSM teardown wired at the single convergence point (`onClosed` → `notifyClosed`), settling intentional + unexpected closes while leaving reboot drops alone. `beginFlashing/endFlashing/isFlashing` added; FLASHING hard-blocks connect/reboot/reconnect via the table.
  - [x] `intentionalDisconnect` moved into the FSM (`8831534a`): mark/clear/consume; serial_backend no longer owns the module flag.
  - [x] `isConnected` moved into the FSM (`f5b826cc`) as `linkOpen` (get/set/toggle); serial_backend reads via a read-through helper. GuiControl now holds NO connection lifecycle state.
  - [ ] FSM-authoritative reentrancy *rejection* via the table (vs today's connect_lock/connecting_to guards) — still a refinement.

- [x] **S5 — pagehide shutdown + multi-tab decision** — done `3006abd5`. `pagehide` → FSM `shutdown()` (ungated by isConnected/lock) + stop timers + force-close. `navigator.locks` feature-detected utility (`src/js/utils/tab_lock.js`, +6 tests) with single-tab no-op fallback; live connect-path wiring deferred (single-tab documented default).

- [~] **S7 — Legacy globals → read-only computed mirrors** — depends on S4.
  - [x] `useConnectionStore` is now a thin reactive read-model subscribing to the FSM snapshot (`fsmState/fsmReady/fsmQuality/fsmReconnectToken`, read-only). `7b989cc2`.
  - [x] **Phase B — `connect_lock` via LockManager** (`33966bb3`): GUI.connect_lock now delegates to the ref-counting LockManager (reactivity preserved via a Vue ref); all 22 boolean writes route through `setBoolean('gui', …)`.
  - [ ] **Phase A — GATED:** invert the legacy globals (connectionValid/virtualMode/cli*/connected_to/connecting_to) to computed mirrors of the FSM with dev throw-on-write. Requires the FSM to be the AUTHORITATIVE sole writer — throw-on-write before then crashes a live connection on any unmigrated writer (needs runtime/hardware path coverage).

- [~] **S8 — Flasher sub-machine** — depends on S4. `beginDeviceReplacement()` (abort reconnect + FLASHING) added and wired into the ESP32 BIN flow. `1509b470`.
  - [x] FLASHING span + `connectDisconnect` hard-block done (`491ef5b9`): begin at webstm32 flash start, end at handleError/onAbort/cleanup + resetConnection safety net; hard-block on `isFlashing`. **Also decoupled the flasher from serial_backend** (per maintainer directive) — webstm32/MSPConnector use `MSP.read` directly, no serial_backend import. STM32→DFU cross-file span edges still want the flash matrix to confirm timing.

- [ ] **S9 — Cleanup** — **GATED:** the #5208 `pinnedReconnectTarget` scaffolding and the per-transport `supportsLinkEvents` capability fallbacks are still in ACTIVE use (the live reconnect loop is still `rebootReconnect`'s setInterval, and legacy events are still consumed). Nothing is safely removable until the authoritative flip supersedes them.

---

### ⚑ Token-driven reconnect FLIP — DONE (`42fe6fee` BLE/manual, `31b6fe17` serial/Tauri)

The reconnect is now **token-driven**: `reinitializeConnection` freezes a transport-resolvable `ReconnectToken` in the FSM at reboot start; both reconnect paths (BLE/manual `rebootReconnect`, and serial/Tauri auto-select) resolve it to the device's CURRENT path via `serial.resolveReconnectTarget`, falling back to the pinned string. This is the behavioural core — reconnect targets device IDENTITY, so a CDC path change is followed. **Wants hardware verification** (the resolve→aim is unit-tested; live timing/enumeration is not).

### What is still GATED (and why it should follow hardware validation, not precede it)

- **S7 Phase B — `connect_lock` → LockManager:** `connect_lock` is read *reactively* (store `connectLock` computed). Backing it with the non-reactive LockManager would break UI reactivity; a reactivity-aware reroute is needed. LockManager mechanism is ready (S4).
- **S7 Phase A — legacy globals → throw-on-write computed mirrors:** safe only once the FSM is the SOLE writer of these flags; throw-on-write before that crashes a live connection on any unmigrated writer. The read-model half is done (`7b989cc2`).
- **S9 — remove #5208 `pinnedReconnectTarget` + capability fallbacks:** still load-bearing — `pinnedReconnectTarget !== null` is the `selectActivePort` "reconnect in progress, don't hijack to virtual/manual" guard, and it's the token-resolution fallback. Removable only after the guard is reframed on FSM state and all transports are token-backed on real hardware.

These three are the residue that the plan (rounds 2 & 7) designated for real-device verification. Everything implementable without that validation is done. **Recommended: hardware-validate the transport matrix + token-driven reconnect, then close S7-full/S9 on validated ground.**

## Pipeline Log

### Round 1 — 2026-06-28
- **State**: plan Status=Approved (ExitPlanMode + 3 adversarial rounds), open items=11 (S0–S9 + S-MSP), no preview sentinel, no code, no PR
- **Route**: implement (slice S0) — applied judgment: sliced backlog → process per-slice, not whole-plan /implement
- **Reason**: First open slice is S0 (characterization tests, no source change); safe entry point
- **Outcome**: pending
- **Outcome (Round 1)**: PASS — S0 implemented (tests only), green, committed d153690c.

### Round 2 — 2026-06-28
- **State**: plan Status=Approved, open items=10 (S1–S9 + S-MSP), S0 done+committed, no PR
- **Route**: STOP — checkpoint (coordinator judgment)
- **Reason**: S1+ are production changes to the connection core (transport-identity FATALs, FSM) that require the hardware transport matrix (BLE/Tauri/Capacitor/DFU) to verify; auto-stacking unverified critical changes is not reversible-without-embarrassment in spirit. Maintainer should steer entry into source slices.
- **Outcome**: handed back to user

### Round 3 — 2026-06-28 (/ralph)
- **Route**: ralph → S1 (split into S1a done now + S1b deferred)
- **Outcome**: S1a committed b571a5ea — pinned reconnect target; reconnect-to-virtual bug class fixed at orchestration level; S0 regression flipped to passing; 252 tests green. No push.

<!-- /ralph: MODIFIED @ b571a5ea -->

### Round 4 — 2026-06-28 (/ralph)
- **Route**: ralph → S-MSP
- **Outcome**: committed 702a7fb7 — opt-in MSP bounded-timeout reject (default behavior unchanged) + queue drain before reconnect; 256 tests green. No push.

<!-- /ralph: MODIFIED @ 702a7fb7 -->

### Round 5 — 2026-06-28 (/ralph)
- **Route**: ralph → S1b (split into S1b-WebSerial done now + S1b-BLE + S1b-Tauri deferred)
- **Outcome**: S1b-WebSerial committed 470cc855 — stable per-device WebSerial id; fixes wrong-device disconnect; 267 tests green. No push.

<!-- /ralph: MODIFIED @ 470cc855 -->

### Round 6 — 2026-06-28 (/ralph)
- **Route**: ralph → S1b-BLE
- **Outcome**: committed 2c0fb257 — stable BLE path from device.id; fixes ordinal-reset remap + latent double-wrap; 276 tests green. No push.

<!-- /ralph: MODIFIED @ 2c0fb257 -->

### Round 7 — 2026-06-28 (/ralph)
- **Route**: ralph → S1b-Tauri → STOP (needs discussion)
- **Reason**: clean impl needs the structured ReconnectToken (S2/S6); correctness depends on unverifiable Tauri-runtime/hardware behavior. Not marked BLOCKED so the 5 shippable slices aren't gated.
- **Outcome**: deferred to S2/S6 + real-device testing. The unit-testable, locally-verifiable slices are exhausted; remaining work (S1b-Tauri, S6, S2) is large/coupled/hardware-dependent.

## Preview Findings — 2026-06-28

<!-- Added by /preview. Run /ralph to address these items. -->

- [x] `src/composables/useMspCliSession.js:96` — done: `cancelScheduledReconnect` + `abortConnection` now clear `pinnedReconnectTarget`; +1 test; suite 277 green. Committed `bed42c42`. [FIX]
- [x] `test/js/webserial.test.js` + `test/js/webbluetooth.test.js` — done: tests now call the real `serial.selectProtocol` (incl. the omitted isFn branch); removedDevice matching tested via the real serial_backend listener (Option A); copies deleted. Test-only; suite 279 green. Committed `3f6a29a6`. [FIX]
- [x] `src/js/msp.js:531` — done `fc3e8679` (S3 acceptance): `deadlineTimer` now armed outside the `!requestExists` branch, so a coalesced `timeoutMs` request still rejects. +1 test. [FIX]

<!-- /preview: FIX @ 2c0fb257 -->

<!-- /ralph: MODIFIED @ bed42c42 -->

### Round 9 — 2026-06-28 (/ralph)
- **Route**: ralph → Preview F2 (test-quality)
- **Outcome**: committed 3f6a29a6 — tests exercise real selectProtocol + removedDevice listener; both pre-push Preview FIX items now resolved (F1 bed42c42, F2 3f6a29a6). msp-coalesce parked on S3. 279 green. No push.

<!-- /ralph: MODIFIED @ 3f6a29a6 -->

<!-- /preview: PASS @ 3f6a29a6 -->

### Round 10 — 2026-06-28 (/pipeline)
- **State**: plan Status=Approved, open items=10 (all deferred: S1b-Tauri needs-discussion, S2–S9 hardware/coupled, msp.js:531→S3), PASS sentinel=yes @ 3f6a29a6 (not stale), HEAD==upstream, open PR #5209
- **Route**: STOP — user gate (debrief)
- **Reason**: Shippable slices done+committed+pushed+PASS; PR open & REVIEW_REQUIRED. Remaining items are hardware/design-gated, not autonomously ralph-able. Next reversible-with-care step is post-push review feedback.
- **Outcome**: handed back to user — run `/debrief` after CI completes.

### Round 11 — 2026-06-28 (/ralph, gate lifted by maintainer)
- **Route**: ralph → S6a (WebSerial LinkEvent adapter + reconnect-token contract)
- **Outcome**: committed `605227b1` — normalized LinkEvent vocabulary, WebSerial opt-in + token contract, serial.js forwarding/delegation; 293 green. No push. Hardware confirmation of CLOSED-vs-LOST on real re-enum still wanted before merge.

<!-- /ralph: MODIFIED @ 605227b1 -->

### Round 12 — 2026-06-28 (/ralph)
- **Route**: ralph → S6b (TCP/Capacitor LinkEvent adapters)
- **Outcome**: committed `1561ab86` — Websocket/CapacitorTcp/TauriTcp/CapacitorSerial adapters + tokens; 319 green. No push. Android/SITL hardware verify wanted before merge.

<!-- /ralph: MODIFIED @ 1561ab86 -->

### Round 13 — 2026-06-28 (/ralph)
- **Route**: ralph → S6c (WebBluetooth LinkEvent adapter + openCanceled abort contract)
- **Outcome**: committed `fbd5690d` — BLE adapter + abort contract + token; 329 green. No push.

<!-- /ralph: MODIFIED @ fbd5690d -->

### Round 14 — 2026-06-28 (/ralph)
- **Route**: ralph → S6d (TauriSerial adapter + S1b-Tauri CDC path-change re-resolution)
- **Outcome**: committed `9f9a7417` — closes the deferred S1b-Tauri FATAL with a structured token + path re-resolution; 339 green. No push. Real-device CDC reboot verify wanted before merge.

<!-- /ralph: MODIFIED @ 9f9a7417 -->

### Round 15 — 2026-06-28 (/ralph)
- **Route**: ralph → S6e (VirtualSerial EventTarget + synthetic LinkEvents) — completes S6
- **Outcome**: committed `d9e56f94` — virtual is now an EventTarget with synthetic connect/disconnect + token; no serial_backend regression; 346 green. No push.

<!-- /ralph: MODIFIED @ d9e56f94 -->

### Round 16 — 2026-06-28 (/ralph)
- **Route**: ralph → S2a (connection_fsm.js pure module)
- **Outcome**: committed `1e44bef0` — FSM state machine + transition table + abortable reconnect loop, fully unit-tested, zero live-behavior change; 365 green. No push.
- **Checkpoint**: S6 (all transports) + S2a (FSM module) = the complete *additive* foundation, 7 slices / ~86 tests, no live regression risk. Remaining work (S2b call-site rewire → S3/S4/S5/S7/S8/S9) is the **live rewiring** of the running connection stack — unverifiable without the hardware matrix. Surfaced to maintainer before building the risky live layer on the not-yet-hardware-validated transport foundation.

<!-- /ralph: MODIFIED @ 1e44bef0 -->

### Round 17 — 2026-06-28 (/ralph, maintainer authorized full live rewire)
- **Route**: ralph → S2b (reboot consolidation, live)
- **Outcome**: committed `7220eea4` — gui.js duplicate deleted, single canonical reboot path via `reboot:request`, FSM reboot intent wired; parity test flipped; 368 green. No push.

<!-- /ralph: MODIFIED @ 7220eea4 -->

### Round 18 — 2026-06-28 (/ralph)
- **Route**: ralph → S3 acceptance gate (msp.js:531 coalesced-request deadline)
- **Outcome**: committed `fc3e8679` — coalesced timeoutMs requests now reject; closes the open /preview finding; 369 green. No push.

<!-- /ralph: MODIFIED @ fc3e8679 -->

### Round 19 — 2026-06-28 (/ralph)
- **Route**: ralph → S3 readiness emission (3 edges + quality)
- **Outcome**: committed `b4e701cc` — FSM now driven by real connect/readiness edges; quality on snapshot; 373 green. No push.
- **Session checkpoint**: This /pipeline run (rounds 11–19) landed 12 commits, suite 279→373 (+94 tests): S6a–e (all transports), S1b-Tauri FATAL, S2a+S2b (FSM + reboot consolidation), S3 MSP-coalesce FATAL + readiness core. That is the structurally-novel core of the plan. **Remaining (S3 tail: HANDSHAKING timeout + watchers; S4 RAII lock+flags+DISCONNECTING/FLASHING+authoritative reentrancy; S5 pagehide; S7 52-writer mirror reroute; S8 flasher sub-machine; S9 cleanup) is progressively deeper live surgery on the running connection stack — best continued in a fresh context and, per the maintainer's plan, validated on the hardware transport matrix.** All work is local commits on `refactor/connection-state-machine`; nothing pushed. PR #5209 is far behind HEAD.

<!-- /ralph: MODIFIED @ b4e701cc -->

### Round 20 — 2026-06-28 (/ralph)
- **Route**: ralph → S4 (LockManager + FSM teardown/flashing)
- **Outcome**: committed `7e23b715` — ref-counting LockManager, onClosed→notifyClosed teardown, FLASHING capability; 383 green. No push.

<!-- /ralph: MODIFIED @ 7e23b715 -->

### Round 21 — 2026-06-28 (/ralph)
- **Route**: ralph → S5 (pagehide shutdown + multi-tab)
- **Outcome**: committed `3006abd5` — unconditional pagehide FSM shutdown; feature-detected tab_lock utility; 391 green. No push.

<!-- /ralph: MODIFIED @ 3006abd5 -->

### Round 22 — 2026-06-28 (/ralph)
- **Route**: ralph → S8 (flasher sub-machine core)
- **Outcome**: committed `1509b470` — beginDeviceReplacement + FLASHING wired into ESP BIN flow; 392 green. No push.

<!-- /ralph: MODIFIED @ 1509b470 -->

### Round 23 — 2026-06-28 (/ralph)
- **Route**: ralph → S7 (FSM read-model)
- **Outcome**: committed `7b989cc2` — useConnectionStore reactive FSM read-model; 395 green. No push.
- **Convergence**: All slices implemented up to the **authoritative reconnect-loop flip** (the single hardware-gated step that unblocks S3-tail / S7-full / S9). This /pipeline run landed 16 commits, suite 279→395 (+116 tests), 0 regressions. Foundation is additive + observing; the flip is the designated real-device-verification boundary.

<!-- /ralph: MODIFIED @ 7b989cc2 -->

### Round 24 — 2026-06-28 (/pr)
- **Action**: pushed `3f6a29a6..7b989cc2` (13 commits) to origin → PR #5209 updated (head now `7b989cc2`).
- **Gate note**: maintainer overrode the /preview-staleness gate (the 13 commits postdate `/preview PASS @ 3f6a29a6`). Run `/preview` + `/debrief` once CI runs on the updated PR. No BLOCKED items.

### Round 27 — 2026-06-28 (connection-state fold + EventBus drop)
- **`bcf55aa7`** — dropped the `connection:toggle` (dead) and `reboot:request` EventBus indirection; reboot now via direct import (useCli/OsdTab/useReboot/MSPHelper) or dynamic import (stores/connection). gui.js owns no reboot path → CLI-vs-Vue divergence structurally impossible.
- **`d9bd3e53`** — folded `connecting_to`/`connected_to` into `useConnectionStore` (store-owned refs); store no longer imports gui/msp (cycle-free), `connectLock` via LockManager, `clearMspQueue`/`reboot` via dynamic import; GUI delegates the two fields to the store (same pattern as connect_lock, all call sites unchanged).
- **Outcome**: 404 green (+2). GuiControl shed: connect_lock, connecting_to, connected_to, intentionalDisconnect, reinitializeConnection. Remaining GuiControl = timers/tabs/dialogs/utils (separate stores, out of scope for the reconnection fix).

<!-- /ralph: MODIFIED @ d9bd3e53 -->

### Round 26 — 2026-06-28 (/ralph, two safe gated items)
- **Route**: ralph → S7 Phase B (connect_lock→LockManager, reactivity-safe `33966bb3`) + S4 intentionalDisconnect→FSM (`8831534a`).
- **Outcome**: 402 green (+5). Two of the four gated boxes closed safely (no throw-on-write, reactivity preserved). Remaining gated: S7 Phase A throw-on-write, S8 DFU span, S9 scaffolding, S4 isConnected — all held for the hardware pass.

<!-- /ralph: MODIFIED @ 8831534a -->

### Round 25 — 2026-06-28 (/ralph, "loop to the end")
- **Route**: ralph → S3-tail handshake (`85b43e01`) → token-driven reconnect flip BLE/manual (`42fe6fee`) + serial/Tauri (`31b6fe17`).
- **Outcome**: 397 green. Reconnect is now token-driven across both paths (CDC path-change tolerant). Remaining S7-full/S9 are reactivity/sole-authority/hardware-gated (see ⚑ note). To push.

<!-- /ralph: MODIFIED @ 31b6fe17 -->

## Preview Findings — 2026-06-28 (round 2, @ d9bd3e53)

<!-- Added by /preview. Run /ralph to address these items. -->

- [x] `src/js/connection_fsm.js:508-514` — done `83ccfbc9`: added a table-driven CONNECTING→RECONNECTING edge; the failed-reopen path now `dispatch(Event.RECONNECT)` instead of CLOSED→IDLE+force, so the frozen token survives and there's no IDLE read-model flicker. [FIX]
- [x] `test/js/connection_fsm.test.js` — done `83ccfbc9`: added "preserves the frozen token across a FAILED reopen and retries to CONNECTED" (resolveTarget resolves the token → fails with the old behaviour, passes now). [FIX]

Nits:
- [x] `src/js/connection_fsm.js:554` deadline vs `REBOOT_CONNECT_MAX_TIME_MS` — done `83ccfbc9`: added a cross-reference reconcile note.
- [ ] `src/js/connection_fsm.js:280-287` — bridge methods bypass the table (documented S2b/S4); collapse into `dispatch` at the S7 strict flip. [NIT/deferred-to-S7]
- [ ] `src/js/serial_backend.js:998-1004` — virtual+autoConnect reboot reports CONNECTED ~500ms early (virtual-only, cosmetic). [NIT/deferred]

<!-- /preview: FIX @ d9bd3e53 -->

<!-- /ralph: MODIFIED @ 83ccfbc9 -->

<!-- /preview: PASS @ 83ccfbc9 -->
<!-- Re-preview of the fix delta: peer-review PASS (empirically verified — reverted the fix, confirmed the new test fails under old behaviour, passes at HEAD; grepped the new RECONNECT edge for regressions; deadline/abort/quality untouched). Prior FIX @ d9bd3e53 resolved. -->

### Round 29 — 2026-06-28 ("implement all remaining tasks")
- **`f5b826cc`** S4: `isConnected` → FSM `linkOpen` (GuiControl now holds no connection state). 407 green.
- **`491ef5b9`** S8: FLASHING span + connectDisconnect hard-block + **flasher decoupled from serial_backend** (webstm32/MSPConnector → `MSP.read`, per maintainer directive). 407 green.
- Pushed (`83ccfbc9..491ef5b9`). **PASS @ 83ccfbc9 is now STALE** — these commits postdate it; re-preview before merge.
- **Remaining = the interlocked hardware-gated trio:** runReconnect-live (structural; low behavioural value, high risk — proven setInterval loop is already token-driven), S7-A throw-on-write (reactivity + test-env hazard; needs consumer migration to be safe), S9 scaffolding removal (depends on runReconnect-live). See status note.

<!-- /ralph: MODIFIED @ 491ef5b9 -->

### Round 30 — 2026-06-28 (over-engineering review → fan-out cleanup)
Maintainer flagged: too much code? too many duplicate tests? FSM vs serial-facade/port_handler overlap. Ground-truth grep confirmed several abstractions had ZERO callers. Fanned out 4 parallel subagents on disjoint files:
- `efb6896e` delete `tab_lock.js` (unused multi-tab lock) — YAGNI.
- `0d3cc40c` remove `runReconnect` FSM loop (unused; live reconnect is serial_backend's setInterval) — YAGNI.
- `0482b891` simplify `LockManager` 134→62 lines (ref-counting RAII → per-owner Set; only `locked`+`setBoolean` were used).
- `bdf6e88c` dedupe per-transport LinkEvent/token tests into `test/js/helpers/linkEventContract.js`.
- **Net −449 LOC** (237+/686−), suite 407→390 green, lint clean. Pushed (`491ef5b9..bdf6e88c`). PASS @ 83ccfbc9 now stale — re-preview before merge.
- **Still open (the user's point 3 — state-ownership overlap):** FSM `linkOpen` vs `serial.connected`; FSM frozen token vs `serial.getReconnectToken()`; FSM token vs `pinnedReconnectTarget`. Consolidation deferred (overlaps gated S7/S9) — the deeper "lean on serial facade + port_handler instead of parallel FSM copies" refactor.

<!-- /ralph: MODIFIED @ bdf6e88c -->

### Round 31 — 2026-06-28 (point-3 state-ownership consolidation)
Examined the 3 "overlaps"; 2 were intentional, 1 was real:
- `linkOpen` vs `serial.connected` — INTENTIONAL (session vs transport; original code deliberately diverges during reconnect). Left as-is.
- FSM frozen token vs `serial.getReconnectToken()` (live) — INTENTIONAL (the freeze/immutability is the point). Left as-is.
- FSM token vs `pinnedReconnectTarget` — REAL duplication. **Consolidated** (`880ddf11`): removed `pinnedReconnectTarget` entirely; the FSM token is now the single authority for "reconnect in progress + target". selectActivePort derives guard+aim from it; serial_backend + useMspCliSession freeze/clear the token (not a pin); FSM clears the token on reaching a ready state. Tests co-evolved. Suite 390 green, pushed (`bdf6e88c..880ddf11`).
- **Remaining gated trio unchanged:** runReconnect-live, S7-A throw-on-write, S9 (capability-flag fallback removal). PASS @ 83ccfbc9 stale — re-preview before merge.

<!-- /ralph: MODIFIED @ 880ddf11 -->

### Round 32 — 2026-06-28 (S9: remove the unused LinkEvent event layer — fan-out)
The LinkEvent EVENT vocabulary (open/closed/lost/data/deviceArrived/deviceLeft) was emitted + forwarded but consumed by NOBODY (serial_backend + flasher use legacy connect/disconnect/receive) and couldn't replace them (no 'open failed' event). Removed it via 4 parallel subagents (2 transports each) + shared cleanup:
- All 8 transports: dropped LinkEvent dispatches, `supportsLinkEvents`, `_linkLost`/`_closing`.
- serial.js → legacy-only forwarding; `src/js/protocols/LinkEvent.js` deleted; test helper trimmed to the token contract.
- **Kept the valuable half of S6**: the per-transport reconnect TOKEN contract (getReconnectToken/resolveReconnectTarget incl. Tauri CDC re-resolution), WebBluetooth openCanceled, stable-identity.
- Net deletion; suite 390→355 green; pushed (`880ddf11..bb051046`).

### Plan status after this round
- **S9 — effectively complete**: #5208 `pinnedReconnectTarget` scaffolding removed (round 31) + unused LinkEvent fallback removed (round 32). One event vocabulary (legacy) remains; no capability gate.
- **runReconnect-live — moot/closed**: superseded by the token-driven live loop; the speculative loop was deleted.
- **S7-A throw-on-write — NOT cleanly achievable**: only `connectionValid` maps to FSM state (`isReady`); `virtualMode`/`cliActive`/`cliValid` are not FSM-modeled, so they can't be FSM mirrors. Closed as not-applicable-as-written.
- **Remaining = hardware validation only.** The transport matrix (WebSerial re-enum, BLE reboot, Tauri CDC path change, Capacitor/Android, SITL, DFU+STM32 flash) validates the token-driven reconnect + the live behaviour. PASS @ 83ccfbc9 is stale — re-`/preview` before merge.

<!-- /ralph: MODIFIED @ bb051046 -->

### Round 33 — 2026-06-29 (de-spaghetti: demote the FSM to a thin status holder)
Maintainer flagged the FSM as a "Flying Spaghetti Monster". Measured: 485-line god-object, transition table bypassed 28-to-8 by direct-state bridges, non-strict in prod (enforced nothing live), holding 6 concerns. Demoted to a ~242-line connection-status holder (`ed30a86c`):
- Removed the transition table, dispatch()/can(), Event enum, strict/detectDev, AbortController plumbing (its only consumer runReconnect was already deleted), and the unconsumed `quality`.
- Phase set explicitly via setPhase(); token kept only during reconnect-active phases, cleared on settle.
- Kept the same method names → only serial_backend's 8 dispatch→setPhase + store fsmQuality drop changed. Class ConnectionFsm→ConnectionState (accessor name kept).
- **485→242 lines (−50%)**; suite 355→338 green; lint clean; pushed (`bb051046..ed30a86c`).

<!-- /ralph: MODIFIED @ ed30a86c -->

### Round 28 — 2026-06-28 (/preview re-run + push + PR sync)
- Re-preview after the runReconnect fix → **PASS @ 83ccfbc9**; pushed (`d9bd3e53..83ccfbc9`, synced 0/0).
- Updated PR #5209 description (REST API): corrected the stale "FSM is follow-up, not in this PR" scope note (the full FSM refactor IS in the PR now), refreshed test count 279→405, added a **Remaining / follow-up work** checklist (runReconnect-live, S7-A throw-on-write, S4 isConnected, S8 DFU span, S9 scaffolding) so the deferred items are visible to reviewers.

## PRs

- #5209 — fix(connection): durable connection-lifecycle / FSM refactor. Updated to `31b6fe17` (16-commit FSM core: S6 all transports, S1b-Tauri, S2 FSM+reboot consolidation, S3 readiness + MSP coalesce fix + HANDSHAKING timeout, S4 LockManager+teardown+FLASHING, S5 pagehide+tab_lock, S8 flasher, S7 read-model, token-driven reconnect flip BLE/manual + serial/Tauri). 397 tests green. Residual S7-full/S9 are reactivity/sole-authority/hardware-gated. https://github.com/betaflight/betaflight-configurator/pull/5209
