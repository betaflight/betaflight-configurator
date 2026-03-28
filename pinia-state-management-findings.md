# Pinia Store Integration & State Management — Findings & Migration Plan

**Date:** 2026-03-28
**Context:** Post-migration cleanup task from [#4812](https://github.com/betaflight/betaflight-configurator/issues/4812)

---

## 1. Current State — Findings

### 1.1 Pinia Infrastructure

- **Pinia instance**: Created in `src/js/pinia_instance.js` via `createPinia()` — single shared instance
- **10 stores** defined in `src/stores/`:

| Store | Style | Purpose |
|---|---|---|
| `fc.js` | Composition (setup) | Flight controller data — **proxy layer** over legacy `FC` reactive object |
| `connection.js` | Composition (setup) | Connection state — **proxy layer** over legacy `GUI` and `CONFIGURATOR` |
| `navigation.js` | Composition (setup) | Tab navigation — **proxy layer** over legacy `GUI` |
| `dialog.js` | Composition (setup) | Global dialog management |
| `debug.js` | Composition (setup) | Debug mode names/fields, depends on `fc` store |
| `sensors.js` | **Options API** | Sensors tab config with ConfigStorage persistence |
| `osd.js` | Composition (setup) | OSD configuration with bidirectional `OSD.data` sync |
| `presets.js` | Composition (setup) | Presets tab — full-featured, self-contained store |
| `pidTuning.js` | Composition (setup) | PID tuning change tracking via JSON snapshot diffing |
| `presets_helpers.js` | N/A | Pure helper functions (not a store) |

### 1.2 Legacy Global Reactive Objects (the real source of truth)

These module-level singletons are the **actual** state containers. The Pinia stores mostly proxy into them:

| Object | File | Reactivity | Consumers |
|---|---|---|---|
| `FC` | `src/js/fc.js` | `reactive()` — exported as `export default reactive(FC)` | **58 files** (stores, composables, MSP layer, tabs, tests) |
| `GUI` (instance of `GuiControl`) | `src/js/gui.js` | Plain class instance (NOT reactive), exported `export default GUI` | **53 files** |
| `CONFIGURATOR` | `src/js/data_storage.js` | `reactive()` | **48 files** |
| `PortHandler` | `src/js/port_handler.js` | `reactive()` | ~11 files |
| `tabState` | `src/js/tab_state.js` | `reactive({ expertMode })` | 3 files |

### 1.3 How Pinia Stores Currently Wrap Legacy State

The `fc`, `connection`, and `navigation` stores act as **thin computed proxy layers**:

```js
// src/stores/fc.js — pattern repeated ~35 times
const config = computed({
    get: () => FC.CONFIG,
    set: (val) => (FC.CONFIG = val),
});
```

This means:
- **FC is the source of truth**, not the Pinia store
- The store provides a typed Pinia interface but doesn't own the data
- Components that import `FC` directly bypass the store entirely
- The MSP decode/encode layer (`MSPHelper.js`) writes directly to `FC.*` properties
- Change detection in `pidTuning.js` does `JSON.stringify(FC.PIDS)` — direct access, not through store

### 1.4 Dual Access Anti-Pattern

Many Vue components import **both** the store and the legacy object:

```vue
<!-- Example: MotorsTab.vue -->
import { useFlightControllerStore } from "@/stores/fc";
import FC from "@/js/fc";    // also direct access
```

This is present in: `SetupTab`, `MotorsTab`, `PresetsTab`, `ReceiverTab`, `PidTuningTab`, and others. The store is used for some reactive bindings while `FC` is used directly for imperative reads/writes.

### 1.5 Dialog Pattern (Partially Migrated)

- `useDialogStore` provides a programmatic dialog system
- `GUI.showYesNoDialog()` / `showWaitDialog()` / `showInformationDialog()` still uses DOM `querySelector` + `<dialog>` elements directly
- Both patterns coexist — e.g., `presets.js` store calls `GUI.showYesNoDialog()` internally

### 1.6 Style Inconsistency

- **9 of 10 stores** use Composition API (setup function) style
- `sensors.js` uses **Options API** style — the only one

### 1.7 `storeToRefs` Usage

Only used in **1 file** (`SensorsTab.vue`). All other consumers use stores without destructuring refs.

### 1.8 What Works Well

- **`presets.js`**: Fully self-contained Pinia store with proper state, computed, and actions — best example of the target pattern
- **`dialog.js`**: Clean, simple store with clear API
- **`debug.js`**: Good example of inter-store dependency via `useFlightControllerStore()`
- **`osd.js`**: Demonstrates sync pattern with legacy `OSD.data` object — necessary transition step

---

## 2. Key Issues

### Issue A: FC Store is a Proxy, Not a Store
The `fc` store wraps ~35 properties with computed get/set proxies to `FC.*`. This adds indirection without benefit — the MSP layer still writes to `FC` directly, and many components still read from `FC` directly.

### Issue B: GUI is Not Reactive
`GUI` (class instance) is exported as a plain object — not wrapped in `reactive()`. The `connection` and `navigation` stores proxy to it via computed, which only works because Vue's computed tracks reads. But mutations to `GUI.connected_to` from non-Vue code (serial backend) won't trigger Vue reactivity unless something else triggers a re-render.

### Issue C: Massive Direct FC Import Surface
58 files import FC directly. The MSP protocol layer (`MSPHelper.js` at ~3000+ lines) writes to `FC.*` properties during decode. Moving this to go through a store would be a very large refactor.

### Issue D: JSON Diffing for Change Detection
`pidTuning.js` uses `JSON.stringify()` for change detection because `structuredClone` can't handle Vue reactive proxies. This works but is expensive for large objects.

---

## 3. Migration Plan

### Guiding Principles

1. **Don't break what works** — the proxy pattern is functional; prioritize correctness over purity
2. **Incremental adoption** — migrate consumers to stores one tab/composable at a time
3. **MSP layer stays as-is** — `MSPHelper.js` writing to `FC.*` directly is fine since FC is reactive
4. **No CSS or translation changes** required

### Phase 1: Quick Wins (Low Risk)

#### 1a. Convert `sensors.js` to Composition API style
The only Options API store. Convert to setup function style for consistency with the other 9 stores.

**Files:** `src/stores/sensors.js`
**Effort:** Small

#### 1b. Eliminate dual imports in Vue components
Where a component imports both `useFlightControllerStore` and `FC`, remove the direct `FC` import and use the store exclusively. Start with components that already have the store instantiated.

**Target components** (import both store AND FC directly):
- `SetupTab.vue`
- `MotorsTab.vue`
- `ReceiverTab.vue`
- `PresetsTab.vue`

**Effort:** Medium — need to verify each FC property used has a store equivalent

#### 1c. Consolidate `tabState` into `navigation` store
`tabState` is a tiny `reactive({ expertMode })` object used in only 3 files. It should be a property on the `navigation` store.

**Files:** `src/js/tab_state.js`, `src/stores/navigation.js`, `src/js/vue_tab_mounter.js`, `src/components/tabs/PidTuningTab.vue`
**Effort:** Small

### Phase 2: Strengthen Existing Stores (Medium Risk)

#### 2a. Add missing FC properties to the FC store
The FC store exposes ~35 properties but FC has ~60+ properties. Some commonly accessed ones are missing:
- `BATTERY_CONFIG`, `BATTERY_STATE`
- `SERIAL_CONFIG`
- `PIDS`, `PIDS_ACTIVE`, `PID_NAMES`
- `TUNING_SLIDERS`, `DEFAULT_TUNING_SLIDERS`
- `SERVO_CONFIG`, `SERVO_DATA`, `SERVO_RULES`
- `LED_STRIP`, `LED_COLORS`, `LED_MODE_COLORS`
- `VTX_CONFIG`, `VTXTABLE_BAND`, `VTXTABLE_POWERLEVEL`

This enables Phase 1b to proceed for more components.

**Files:** `src/stores/fc.js`
**Effort:** Medium — mechanical but large

#### 2b. Add connection-related properties to the connection store
Missing from the connection store but commonly accessed:
- `CONFIGURATOR.virtualMode`
- `CONFIGURATOR.cliActive` / `cliValid`
- `CONFIGURATOR.API_VERSION_ACCEPTED` / `API_VERSION_MAX_SUPPORTED`

**Files:** `src/stores/connection.js`
**Effort:** Small

#### 2c. Migrate dialog calls from `GUI.showYesNoDialog()` to `useDialogStore`
The dialog store already exists. Legacy `GUI.show*Dialog()` methods use raw DOM manipulation. Convert callers to use the store-based approach.

**Callers to migrate:**
- `src/stores/presets.js` (calls `GUI.showYesNoDialog`)
- `src/composables/useFirmwareFlashing.js`
- `src/components/tabs/PresetsTab.vue`
- `src/components/tabs/OptionsTab.vue`
- `src/components/tabs/FirmwareFlasherTab.vue`
- `src/js/browserMain.js`

**Effort:** Medium — need to ensure dialog components are properly registered

### Phase 3: Reduce Direct Legacy Imports in Vue Components (Medium Risk)

#### 3a. Move `GUI` utility methods used by tabs to composables or the store
Tab components use `GUI` for:
- `GUI.interval_add()` / `interval_remove()` — timer management
- `GUI.timeout_add()` / `timeout_remove()`
- `GUI.content_ready()`
- `GUI.switchery()`
- `GUI.active_tab`

Extract timer management into a `usePolling` composable (already exists at `src/composables/usePolling.js`). The navigation store already covers `active_tab`.

**Effort:** Large — GUI is used in 53 files, but can be done incrementally per tab

#### 3b. Migrate direct `CONFIGURATOR` reads in Vue components to connection store
Vue components that import `CONFIGURATOR` directly should use `useConnectionStore` instead. Non-Vue code (MSP layer, serial backend) can continue to use `CONFIGURATOR` directly.

**Target Vue components:** `PortPicker.vue`, `ReceiverTab.vue`, `OnboardLoggingTab.vue`, `PresetsTab.vue`, `ConfigurationTab.vue`, etc.

**Effort:** Medium

#### 3c. Dead loading screen code in `main.js`
The `#cache .data-loading` template (index.html line 323-326) is cloned and appended to `#content` in `main.js` lines 291-294 before each `mountVueTab()` call. However, `mountVueTab()` immediately clears `contentEl.innerHTML` before mounting the Vue component, so this loading screen **never renders** — it's appended and removed in the same synchronous frame. This was a leftover from the old jQuery AJAX tab loading. Additionally, `unmountVueTab()` is called redundantly (main.js:287 and vue_tab_mounter.js:75).

**Note:** A previously reported "Waiting for data" issue when loading tabs after reopening the browser has been resolved by the migration work done in Phases 1-3 (specifically the store proxy and dialog migration changes).

**Cleanup:** Remove the dead loading template code from `main.js` (lines 291-294), the redundant `unmountVueTab()` call, and potentially the `#cache` div from `index.html` if no longer used elsewhere.

**Effort:** Small

### Phase 4: Future Improvements (Longer Term, Higher Risk)

#### 4a. Consider making GUI reactive
`GUI` is a class instance that is NOT wrapped in `reactive()`. If we want Vue to properly track `GUI.connected_to` changes from the serial backend, `GUI` should be reactive. This is a non-trivial change since GuiControl has methods (timer management, dialog display, etc.) that may not work well as a reactive object.

**Alternative:** Keep GUI as-is and ensure all Vue-facing state goes through the stores.

#### 4b. Evaluate moving FC data ownership into the Pinia store
The current proxy pattern (store wraps FC) could eventually be inverted so the Pinia store owns the data and the MSP layer writes to the store. This is a **very large** refactor touching `MSPHelper.js` (3000+ lines) and would need careful planning.

**Recommendation:** Not worth doing unless the proxy pattern causes actual bugs. The current approach is pragmatic and works.

#### 4c. Replace JSON.stringify change detection
`pidTuning.js` could use a more efficient diffing approach, or leverage Vue's `watch` with `{ deep: true }`. However, the current approach is explicit and avoids the overhead of deep watchers on large objects. Low priority unless performance issues appear.

---

## 4. Priority Summary

| Priority | Task | Risk | Effort |
|---|---|---|---|
| P1 | 1a. Convert sensors store to Composition API | Low | Small |
| P1 | 1c. Consolidate tabState into navigation store | Low | Small |
| P2 | 1b. Eliminate dual imports in Vue components | Low | Medium |
| P2 | 2b. Add CONFIGURATOR properties to connection store | Low | Small |
| P3 | 2a. Add missing FC properties to FC store | Low | Medium |
| P3 | 2c. Migrate GUI.showDialog calls to useDialogStore | Medium | Medium |
| P4 | 3b. Migrate CONFIGURATOR reads in Vue to store | Medium | Medium |
| P4 | 3a. Extract GUI utilities to composables | Medium | Large |
| P4 | 3c. Remove dead loading screen code in main.js | Low | Small |
| P5 | 4a–4c. Longer-term architectural changes | High | Large |

---

## 5. Files Reference

### Pinia Stores
- `src/stores/fc.js` — FC proxy store (35 computed properties)
- `src/stores/connection.js` — Connection proxy store
- `src/stores/navigation.js` — Navigation proxy store
- `src/stores/dialog.js` — Dialog management
- `src/stores/debug.js` — Debug modes/field names
- `src/stores/sensors.js` — Sensors tab config (Options API)
- `src/stores/osd.js` — OSD configuration
- `src/stores/presets.js` — Presets (largest, self-contained)
- `src/stores/pidTuning.js` — PID change tracking
- `src/stores/presets_helpers.js` — Pure helpers

### Legacy State Singletons
- `src/js/fc.js` — `reactive(FC)` — 58 importers
- `src/js/gui.js` — `GUI` (not reactive) — 53 importers
- `src/js/data_storage.js` — `reactive(CONFIGURATOR)` — 48 importers
- `src/js/port_handler.js` — `reactive(PortHandler)` — 11 importers
- `src/js/tab_state.js` — `reactive({ expertMode })` — 3 importers

### Pinia Instance
- `src/js/pinia_instance.js`
