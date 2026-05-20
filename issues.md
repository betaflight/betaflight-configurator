## Preview Findings — 2026-05-17

<!-- Added by /preview. Run /ralph to address these items. -->

- [x] `src/components/tabs/SensorsTab.vue:509` — [ux-patterns] Accept button needs `:loading` state — done: added `isAcceptingCal` ref with try/finally, bound `:loading` on Accept and `:disabled` on Discard in SensorsTab.vue
- [x] `test/js/msp/MSPHelper.test.js:484` — [coderabbit-cfg] Misleading test comment — done: fixed to "Mixed extreme values: w=1.0, x=-1.0, y=0.0, z≈0.5"

## Preview Findings — 2026-05-17 (round 2)

<!-- Added by /preview. Run /ralph to address these items. -->

- [x] `src/composables/useMagCalibration.js:302` — [coderabbit-cfg, peer-review] acceptCalibration cleanup ordering — done: on error, restarts polling and returns to "collecting" phase so user can retry. Test updated to match.
- [x] `src/components/tabs/SensorsTab.vue:507` — [ux-patterns] Accept button layout shift — done: changed `v-if` condition to show button always in guided mode, added `:disabled="!cal.quality"` instead

<!-- /preview PASS — 2026-05-17 -->

## Debrief Log

### Round 1 — 2026-05-17
- **last_fetched_at**: all
- **this_round_at**: 2026-05-17T22:30:00Z
- **New items**: 1 total (0 fix / 1 skip / 0 discuss)
- **Fixed**: none
- **Skipped**: ~~CodeRabbit inline on `MagSphereView.vue:484` — originally skipped as out of scope~~ → addressed per user request (see Round 2)
- **Discuss**: none
- **Commit**: none — no fixes
- **Status**: All CI passing, no human reviews outstanding

### Round 2 — 2026-05-17
- **last_fetched_at**: 2026-05-17T22:30:00Z
- **this_round_at**: 2026-05-17T22:40:00Z
- **New items**: 0 new from bots, 1 user-requested fix from Round 1 skip
- **Fixed**: Added `liveMag` watcher in `MagSphereView.vue:1412` — calls `rebuildFieldReference()` when `!sphereFit`, so field arrow resizes with live mag readings before a fit exists
- **Skipped**: none
- **Discuss**: none
- **Commit**: `8167a403` — fix(sensors): add liveMag watcher to rebuild field reference before sphere fit
- **Status**: Pushed, CI passing

<!-- /debrief round 2 modified code — re-run /preview before creating additional PRs -->

### Round 3 — 2026-05-17
- **last_fetched_at**: 2026-05-17T22:40:00Z
- **this_round_at**: 2026-05-17T22:55:00Z
- **New items**: 14 total (14 fix / 0 skip / 0 discuss)
- **Fixed**: S7748 zero fractions in MSPHelper.js + tests (12 instances), S1854 unused `fcStore` variable, S7773 `NaN` → `Number.NaN`
- **Skipped**: none
- **Discuss**: none
- **Commit**: `25b9992f` — fix(sensors): address SonarCloud findings (round 3)
- **Status**: Awaiting push

<!-- /debrief round 3 modified code — re-run /preview before creating additional PRs -->

## 3D Mag Sphere View — Visual Issues (2026-05-20)

### Orientation & axis bugs
- [x] Z axis bold line points downwards (into the ground) — should point upwards — done: split each axis line into bold positive half (0.9 opacity) and faded negative half (0.25 opacity) in MagSphereView.vue initScene(); +Z now clearly points upward
- [ ] Quad icon pitch axis is inverted — pitching nose up makes the nose go down
- [ ] Quad icon prop colours are wrong — red props at front, but green should be at front; rears are grey, but should be red
- [ ] Projecting X axis vector always stays in the horizontal plane — should orient with the quad (positive straight forward out of the nose)

### Missing graphical elements
- [ ] No fixed magnetic field inclination line — needs a bold line at the local inclination angle, bold in the North direction, crossing at exactly 0,0

### Sphere & scaling issues
- [ ] Wireframe sphere is not centred at 0,0,0 — appears offset below the quad (reverted to earlier broken version); should represent the celestial sphere with us sitting at the origin
- [ ] N, S, E, W cardinal labels should be drawn further out, on the horizon, touching the celestial sphere
- [ ] Zoom level should be closer in so the quad is more visible

### Known but deferred
- [ ] Orange total field length vector at a strange angle (points out the bottom when quad is flat) — defer for now

### What works well
- X axis projected line length correctly represents mag field strength on X axis (just orientation is wrong)

## PRs

- https://github.com/betaflight/betaflight-configurator/pull/5123
