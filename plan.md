# Magnetometer Tools — Implementation Plan

## Summary

Three magnetometer tools added to Betaflight Configurator:

**A. Calibration Dialog (SetupTab)** — Guided QGC-style 6-step wizard with 3D sphere visualization, orientation diagrams, coverage tracking, and quality metrics. Replaces the basic "Calibrate Magnetometer" button.

**B. Alignment Detection Dialog (ConfigurationTab)** — Automatic alignment detection using variance minimization. Collects mag + attitude samples while the user rotates the vehicle, then determines which of the 8 standard rotations matches the actual sensor mounting.

**C. Auto-Declination Button (ConfigurationTab)** — Fetches GPS coordinates on demand and computes magnetic declination using the World Magnetic Model via the `geomagnetism` package.

**Requires API >= 1.47** (custom mag alignment angles). Calibration/alignment buttons are hidden on older firmware.

Firmware-side calibration is unchanged — we trigger `MSP_MAG_CALIBRATION` and monitor the arming disable flag. The configurator adds visualization, guided UX, and client-side analysis on top.

---

## Files Created

| File | Purpose |
|------|---------|
| `src/js/utils/sphereFit.js` | Least-squares sphere fitting + 6-zone coverage computation |
| `src/js/utils/magAlignment.js` | Alignment detection via variance minimization (8 rotations) |
| `src/composables/useMagCalibration.js` | Calibration lifecycle state machine + `computeDeclination()` helper |
| `src/components/dialogs/MagCalibrationDialog.vue` | QGC-style calibration wizard dialog (SetupTab) |
| `src/components/dialogs/MagAlignmentDialog.vue` | Alignment detection dialog (ConfigurationTab) |
| `src/components/dialogs/mag-calibration/MagSphereView.vue` | Three.js 3D point cloud + wireframe sphere visualization |
| `src/components/dialogs/mag-calibration/MagOrientationDiagram.vue` | SVG quadcopter with CSS 3D orientation transforms |

## Files Modified

| File | Changes |
|------|---------|
| `src/components/tabs/SetupTab.vue` | Replaced old basic mag calibrate button with MagCalibrationDialog |
| `src/components/tabs/ConfigurationTab.vue` | Added "Detect" button + MagAlignmentDialog, "Auto" declination button |
| `locales/en/messages.json` | New i18n keys for calibration, alignment detection, and auto-declination flows |

---

## Background & Research

### Current State in Betaflight Configurator

- **SetupTab** has a basic "Calibrate Magnetometer" button that sends `MSP_MAG_CALIBRATION`, waits 30s (or monitors arming disable flag bit 12 on API >= 1.46), and resets the button.
- **ConfigurationTab** has:
  - Mag hardware enable/disable toggle (`mag_hardware`)
  - Mag alignment dropdown (`align_mag`: CW0°, CW90°, CW180°, CW270° + flipped variants + Custom)
  - Custom alignment roll/pitch/yaw inputs (when `align_mag === 9`)
  - Mag declination setting
- **SensorsTab** displays live magnetometer X/Y/Z values via `MSP_RAW_IMU` and plots them on a 2D graph.
- Three.js is already a project dependency (used in `model.js` for 3D quad model rendering on SetupTab).
- The `geomagnetism` npm package is already used in `usePreflight.js` to compute declination/inclination from GPS coords.

### Betaflight Firmware Mag Calibration

The firmware uses a **recursive least-squares bias estimator** with adaptive forgetting (`compassBiasEstimatorApply`):
1. `MSP_MAG_CALIBRATION` triggers calibration start
2. 15-second wait period for user to prepare / detect movement (gyro threshold)
3. 30-second data collection with continuous bias estimation
4. Computes **hard-iron offsets** (magZero X/Y/Z) — no soft-iron correction
5. Stores offsets in `mag_calibration` CLI parameter
6. Lambda convergence value approaches 2000 during calibration (visible in MAG_CALIB debug mode)
7. Arming disable flag bit 12 is set during calibration, cleared on completion

CLI parameters:
- `mag_calibration` — X,Y,Z offset values
- `align_mag` — CW0/CW90/CW180/CW270 + flip variants or `custom`
- `mag_align_roll`, `mag_align_pitch`, `mag_align_yaw` — custom alignment angles (decidegrees)
- `mag_declination` — local declination (decidegrees)

### How ArduPilot Does It

**Mission Planner:**
- **3D sphere visualization** (`ProgressReporterSphere` with OpenGL/OpenTK) showing magnetometer data points in real-time
- Supports up to 3 compasses simultaneously (`sphere1`, `sphere2`, `sphere3`)
- Points rendered via `Sphere.AddPoint()`, binned into a `Hashtable` with coordinate divisor for even distribution
- User rotates vehicle through 6 orientations (each face toward ground, 360° per face)
- Coverage tracked via `completion_mask` bitmask (sphere surface sections)
- Color-coded quality: red (>600 offset or all zeros), yellow (>400), green (acceptable)

**QGroundControl:**
- Guided 6-orientation UI with images showing which face to point down
- Checkmarks appear as each orientation is completed
- Same firmware underneath (MAVLink `MAV_CMD_DO_START_MAG_CAL`)

**Algorithm — Two-stage fitting:**
1. **Stage 1 — Sphere fit** (hard-iron): Gauss-Newton least-squares to find center offsets + radius. Requires ~300-600 samples with uniform coverage.
2. **Stage 2 — Ellipsoid fit** (soft-iron): 9-parameter optimization (3 offsets + 3 diagonal + 3 off-diagonal) for the correction matrix.
3. Fitness = RMS residual distance from corrected points to ideal sphere. <15-20 mGauss = good.
4. Earth field magnitude validated (~185-660 mGauss depending on location).

**Orientation:**
- `COMPASS_ORIENT` enum (0-42 values, plus ROTATION_CUSTOM=100)
- `COMPASS_AUTO_ROT` — auto-detect orientation during calibration (3 modes)
- `MAG_CAL_REPORT` includes `old_orientation` and `new_orientation` suggestions

---

## Architecture Details

### A. Calibration Dialog (SetupTab)

**Composable:** `useMagCalibration()` manages the lifecycle:
- Sends `MSP_MAG_CALIBRATION` to trigger firmware calibration
- Polls `MSP_RAW_IMU` at 100ms for mag samples
- Monitors `MSP_STATUS_EX` at 1s to track firmware arming disable flag (bit 12)
- `firmwareDone` ref is informational only — dialog controls completion via `completeCalibration()`
- 30s no-movement timeout (only automatic error path)
- Sphere fit every 10 samples, with centroid fallback for early coplanar data

**Dialog:** QGC-style 6-step wizard:
1. Level — rotate 360° in yaw
2. Nose down — rotate 360°
3. Nose up — rotate 360°
4. Left side down — rotate 360°
5. Right side down — rotate 360°
6. Inverted — rotate 360°

Two-column layout: left = step panel (counter + orientation diagram + instruction + progress bar), right = 3D sphere + stats.

**3D Visualization:** Three.js with:
- Pre-allocated BufferGeometry point cloud (5000 points), blue→red color gradient
- Ghost reference sphere (5 rings at radius 400) that fades when real sphere fit arrives
- Wireframe sphere + yellow center marker from sphere fit result
- OrbitControls with always-on auto-rotate (0.5 idle, 1.5 active)
- Camera at (700, 500, 900), FOV 50°

**State flow:** idle → waiting → collecting → complete/error. User clicks Next Step to advance orientation, Finish to complete.

### B. Alignment Detection Dialog (ConfigurationTab)

**Algorithm:** `detectAlignment()` in `magAlignment.js`:
- For each of 8 candidate rotations (CW0/90/180/270, +flipped):
  - Undo current alignment, apply candidate rotation
  - Convert mag reading to "level" frame using only roll/pitch from accelerometer (avoids yaw dependency — chicken-and-egg since yaw depends on the alignment being detected)
  - Compute variance of vertical field component + horizontal field magnitude
- Correct alignment produces lowest variance (earth's field should be constant in level frame)
- Confidence = secondBestVariance / bestVariance, reliable if > 2.0

**Dialog:** 4 phases:
- idle: instructions
- collecting: progress bar + sample counter (polls MSP_RAW_IMU + MSP_ATTITUDE at 100ms, targets 150 samples)
- result: detected alignment, confidence level (high/medium/low with color), sample count, warning if low confidence
- error: timeout or insufficient data

"Apply" button emits alignment value back to ConfigurationTab to update the dropdown.

### C. Auto-Declination

`autoSetDeclination()` in ConfigurationTab:
- Fetches `MSP_RAW_GPS` on demand (button always enabled, GPS fetched on click)
- If GPS has a fix, uses those coordinates
- If no GPS fix, falls back to IP-based geolocation via `ipapi.co` (gated by `IP_GEOLOCATION_CONSENT_KEY` consent prompt)
- Uses `geomagnetism.model().point([lat, lon])` for World Magnetic Model lookup
- Sets `magDeclination` ref

---

## Key Patterns Reused

| Pattern | Source |
|---------|--------|
| Dialog v-model | `Dialog.vue` wrapper (computed get/set proxying prop to emit) |
| MSP polling | `MSP.send_message(code, data, false, callback)` — same as SensorsTab |
| MSP promise | `MSP.promise(code, data)` — for one-shot GPS fetch |
| Arming flag check | `(fcStore.config.armingDisableFlags & (1 << 12)) !== 0` |
| Three.js scene | `import * as THREE from "three"` + WebGLRenderer + OrbitControls |
| GPS coord conversion | `fcStore.gpsData.latitude / 10000000` |
| Geomagnetism | `geomagnetism.model().point([lat, lon]).decl` |
| i18n (Options API) | `i18n.getMessage()` in ConfigurationTab |
| i18n (Composition API) | `$t()` in template / `<script setup>` components |
| Composable + reactive() | `reactive(useMagCalibration())` for auto ref unwrapping in templates |

## MSP Command Reference

| MSP Code | Value | Direction | Purpose |
|----------|-------|-----------|---------|
| `MSP_RAW_IMU` | 102 | Read | Raw accel (3×i16/2048), gyro (3×i16×4/16.4), **mag (3×i16 raw)** |
| `MSP_ATTITUDE` | 108 | Read | Roll/pitch (i16, ÷10 for degrees), yaw (i16, degrees) |
| `MSP_RAW_GPS` | 106 | Read | GPS fix, lat, lon, alt, speed, ground course |
| `MSP_STATUS_EX` | 150 | Read | Arming disable flags (bit 12 = calibrating) |
| `MSP_SENSOR_ALIGNMENT` | 126 | Read | `align_mag` + custom roll/pitch/yaw (API≥1.47) |
| `MSP_SET_SENSOR_ALIGNMENT` | 220 | Write | Set alignment values |
| `MSP_COMPASS_CONFIG` | 133 | Read | `mag_declination` (÷10 for degrees, API≥1.46) |
| `MSP_MAG_CALIBRATION` | 206 | Command | Trigger firmware mag calibration |

Alignment enum values: 0=DEFAULT, 1=CW0, 2=CW90, 3=CW180, 4=CW270, 5=CW0_FLIP, 6=CW90_FLIP, 7=CW180_FLIP, 8=CW270_FLIP, 9=CUSTOM

## Verification

1. **Build**: `yarn dev` — verify no compilation errors
2. **Lint**: `yarn lint` — verify no lint violations
3. **SetupTab calibration**:
   - MagCalibrationDialog opens from SetupTab calibrate button
   - 6-step wizard with orientation diagrams
   - 3D sphere shows points accumulating, wireframe appears after sphere fit
   - Progress bar advances, stats update live
   - Finish button completes calibration, shows quality/offsets/residual
4. **ConfigurationTab alignment detection**:
   - "Detect" button appears next to mag alignment dropdown (API >= 1.47)
   - Dialog collects ~150 samples over ~15s while user rotates vehicle
   - Shows detected alignment with confidence level
   - "Apply" updates the dropdown value
5. **Auto-declination**: Click "Auto" next to declination input — fetches GPS, populates value
6. **Edge cases**:
   - No mag sensor → both buttons hidden
   - API < 1.47 → mag alignment section hidden
   - Dialog close during collection → intervals cleaned up
   - No GPS fix → log message shown
   - Low confidence alignment → warning banner displayed
