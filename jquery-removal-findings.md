# jQuery Removal Findings

Investigation of remaining jQuery usage after the Vue/Pinia migration ([#4812](https://github.com/betaflight/betaflight-configurator/issues/4812)).

## Summary

| Category | Count |
|---|---|
| Files importing jQuery | 25 |
| `$()` calls in `src/js/` (non-library) | ~225 |
| Vue components still using jQuery | 4 |
| jQuery plugins in use | 6 |
| Library files (jQuery plugins) | 3 |
| npm dependencies to remove | 6 |
| Total lines in affected files | ~7,600 |

---

## 1. Heaviest jQuery Files (by `$()` call count)

These files are the core of remaining jQuery usage and should be the primary migration targets:

| File | `$()` calls | Purpose |
|---|---|---|
| `src/js/main.js` | 62 | App shell, tab switching, expert mode, UI chrome |
| `src/js/serial_backend.js` | 58 | Connection UI, port selection, status indicators |
| `src/js/gui.js` | 26 | Dialogs, Switchery toggles, tooltips, link handling |
| `src/js/sensor_helpers.js` | 25 | Sensor status indicators (gyro, accel, mag, baro, etc.) |
| `src/js/localization.js` | 17 | i18n DOM patching (`data-i18n` attribute processing) |
| `src/js/update_dataflash_global.js` | 6 | Dataflash progress bar and status |
| `src/js/Features.js` | 5 | Feature checkbox generation and state reading |

## 2. Medium/Light jQuery Files

| File | `$()` calls | Purpose | Migration notes |
|---|---|---|---|
| `src/js/LoginManager.js` | 3 | Login button UI | Small; straightforward to convert |
| `src/js/Beepers.js` | 3 | Beeper checkbox generation | Similar pattern to Features.js |
| `src/js/gui_log.js` | 3 | Log panel append/scroll | Tiny file, easy win |
| `src/js/utils/initializeModalDialog.js` | 3 | Modal dialog setup | Replace with Vue dialog component |
| `src/js/utils/showErrorDialog.js` | 3 | Error dialog trigger | Replace with Vue dialog component |
| `src/js/LogoManager.js` | 2 | Logo canvas show/hide | Canvas refs can use native DOM |
| `src/js/DarkTheme.js` | 2 | `addClass`/`removeClass` on body | Trivial: `document.body.classList` |
| `src/js/protocols/webstm32.js` | 2 | `.prop()` on connect button | Minimal usage |
| `src/js/utils/checkCompatibility.js` | 2 | Compatibility warning UI | Small utility |
| `src/composables/usePresetsCliSession.js` | 2 | `.trigger()` on CLI textarea | Vue composable — should not use jQuery |
| `src/js/utils/updateTabList.js` | 1 | Tab list updates | Small utility |
| `src/js/utils/isExpertModeEnabled.js` | 1 | `$('.expt_mode').is(':checked')` | Replace with Pinia store check |
| `src/js/Analytics.js` | 0* | `$.ajax()` (no selector calls) | Replace with `fetch()` |
| `src/js/GitHubApi.js` | 0* | `$.getJSON()` | Replace with `fetch()` |

## 3. Vue Components Still Using jQuery

These are migrated Vue components that still reach back into jQuery:

| Component | Usage | What to do |
|---|---|---|
| `src/components/tabs/SetupTab.vue` | `$.flightIndicator()` plugin (lines 1098-1099) | Rewrite flight indicators as a Vue component or use native canvas |
| `src/components/tabs/ReceiverTab.vue` | `$(canvas)` passed to `Model` constructor (line 1131-1132) | Refactor `Model` to accept native DOM element |
| `src/components/tabs/pid-tuning/RatesSubTab.vue` | `$(canvas)` passed to `Model` (line 1805) | Same as above — refactor `Model` |
| `src/components/dialogs/MotorOutputReorderingDialog.vue` | `globalThis.$(canvasRef.value)` (line 254) | Same as above — refactor `Model` |

## 4. jQuery Plugins to Replace

### 4.1 select2 (`select2@^4.0.13`)
- **Imported in:** `src/js/jqueryPlugins.js`
- **CSS in:** `src/js/browserMain.js`, `src/css/select2_custom.less`
- **CSS reference in:** `src/components/tabs/FirmwareFlasherTab.vue` (line 2309)
- **Replacement options:** Vue Select (`vue-select`), Headless UI Combobox, or native `<select>` with custom styling

### 4.2 jQuery UI (`jquery-ui@^1.14.1`)
- **Imported in:** `src/js/jqueryPlugins.js`
- **No specific widget usage found** — may only be pulled in as a dependency for other plugins
- **Action:** Verify if any jQuery UI widget is actually called; if not, remove entirely

### 4.3 jquery-touchswipe (`jquery-touchswipe@^1.6.19`)
- **Imported in:** `src/js/jqueryPlugins.js`
- **No direct `.swipe()` calls found** in source files
- **Action:** Likely dead code — verify and remove

### 4.4 noUiSlider (custom jQuery build: `libraries/jquery.nouislider.all.min.js`)
- **Imported in:** `src/js/jqueryPlugins.js`
- **CSS in:** `src/js/browserMain.js`
- **Note:** AdjustmentsTab.vue already uses custom Vue slider styling (line 690)
- **Replacement:** The standalone `nouislider` npm package (non-jQuery) or a Vue slider component
- **Also depends on:** `libraries/jquery.liblink.js` (data binding helper)

### 4.5 Flight Indicators (`libraries/jquery.flightindicators.js`)
- **Used in:** `src/components/tabs/SetupTab.vue` via `$.flightIndicator()`
- **Replacement:** Rewrite as a Vue component using native canvas/SVG. The plugin is small (~200 lines of logic)

### 4.6 Switchery (`switchery-latest@^0.8.2`)
- **Imported in:** `src/js/gui.js`
- **Used extensively in Vue components** via `gui.content_ready()`:
  - `PidTuningTab.vue`, `MotorsTab.vue`, `GpsTab.vue`, `ConfigurationTab.vue`, `OnboardLoggingTab.vue`
  - `MotorOutputReorderingDialog.vue`, `EscDshotDirectionDialog.vue`
- **Anti-pattern:** Vue components call into jQuery-era `gui.content_ready()` to initialize Switchery toggles, then manually destroy/recreate Switchery elements on state changes
- **Replacement:** A Vue toggle/switch component (or just `<input type="checkbox">` with CSS styling). This is the **highest-impact plugin to replace** due to its deep integration across many Vue tabs

### 4.7 multiple-select (`multiple-select@^2.0.9`)
- **Imported in:** `src/js/jqueryPlugins.js`
- **No direct `.multipleSelect()` calls found** in non-library code
- **Action:** Likely dead code — verify and remove

## 5. jQuery Utility Functions

| Pattern | File(s) | Replacement |
|---|---|---|
| `$.ajax()` | `src/js/Analytics.js:85` | `fetch()` |
| `$.getJSON()` | `src/js/GitHubApi.js:11` | `fetch()` + `.json()` |
| `$.extend()` | `src/js/tabs/osd.js` (5 calls) | Spread operator `{...obj}` or `Object.assign()` |
| `$.fn.jquery` | `src/js/main.js:136` | Remove (version logging) |

## 6. Infrastructure to Remove

Once all jQuery usage is eliminated:

| File/Dependency | Type |
|---|---|
| `src/js/jquery.js` | Global jQuery setup (globalThis.$, window.$) |
| `src/js/jqueryPlugins.js` | Plugin import aggregator |
| `libraries/jquery.flightindicators.js` | jQuery plugin |
| `libraries/jquery.liblink.js` | jQuery plugin |
| `libraries/jquery.nouislider.all.min.js` | jQuery plugin (minified) |
| `libraries/jquery.nouislider.min.css` | Plugin CSS |
| `libraries/jquery.nouislider.pips.min.css` | Plugin CSS |
| `test/setup.js` — jQuery lines | Test globals (`globalThis.$`, `globalThis.jQuery`) |
| `package.json` — `jquery` | npm dependency |
| `package.json` — `jquery-ui` | npm dependency |
| `package.json` — `jquery-touchswipe` | npm dependency |
| `package.json` — `select2` | npm dependency |
| `package.json` — `multiple-select` | npm dependency |
| `package.json` — `switchery-latest` | npm dependency |

## 7. Suggested Migration Order

Priority based on impact, difficulty, and dependency chains:

### Phase 1: Quick Wins (no plugin dependencies)
1. **`src/js/DarkTheme.js`** — 2 calls, trivial `classList` replacement
2. **`src/js/gui_log.js`** — 3 calls, simple DOM append/scroll
3. **`src/js/utils/isExpertModeEnabled.js`** — 1 call, replace with Pinia store
4. **`src/js/utils/showErrorDialog.js`** — 3 calls
5. **`src/js/Analytics.js`** — replace `$.ajax` with `fetch()`
6. **`src/js/GitHubApi.js`** — replace `$.getJSON` with `fetch()`
7. **`src/js/tabs/osd.js`** — replace `$.extend` with spread operator
8. **`src/js/LoginManager.js`** — 3 calls
9. **`src/js/utils/checkCompatibility.js`** — 2 calls
10. **`src/composables/usePresetsCliSession.js`** — remove `.trigger()`, use Vue events

### Phase 2: Plugin Replacements
1. **Remove jquery-touchswipe** — appears unused, just delete import
2. **Remove multiple-select** — appears unused, just delete import
3. **Remove jQuery UI** — verify no widgets used, then delete
4. **Replace noUiSlider jQuery build** with standalone `nouislider` or Vue component
5. **Replace select2** with a Vue-native select component
6. **Replace Switchery** with a Vue toggle component (biggest effort in this phase)
7. **Rewrite flight indicators** as Vue component

### Phase 3: Core Files
1. **`src/js/sensor_helpers.js`** — convert to Vue composable or Pinia store-driven
2. **`src/js/localization.js`** — replace jQuery DOM walking with `vue-i18n` or native `querySelectorAll`
3. **`src/js/Features.js`** + **`src/js/Beepers.js`** — generate DOM via Vue templates
4. **`src/js/update_dataflash_global.js`** — convert to Vue reactive state
5. **`src/js/gui.js`** — decompose into Vue composables/components (dialogs, tooltips, switchery)
6. **`src/js/serial_backend.js`** — large file; convert UI updates to Pinia store + Vue reactivity
7. **`src/js/main.js`** — largest file; convert app shell logic to Vue router + Pinia

### Phase 4: Vue Component Cleanup
1. **Refactor `Model` class** to accept native DOM elements instead of jQuery-wrapped elements
2. **Remove jQuery from SetupTab.vue, ReceiverTab.vue, RatesSubTab.vue, MotorOutputReorderingDialog.vue**

### Phase 5: Final Cleanup
1. Delete `src/js/jquery.js`, `src/js/jqueryPlugins.js`
2. Delete `libraries/jquery.*.js` and `libraries/jquery.*.css`
3. Remove all jQuery-related npm dependencies from `package.json`
4. Clean up `test/setup.js`
5. Run full test suite and manual verification
