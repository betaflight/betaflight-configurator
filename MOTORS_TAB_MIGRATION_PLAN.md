# Motors Tab Migration Plan

## Analysis Date: January 17, 2026

## 1. DEEP ANALYSIS OF ORIGINAL IMPLEMENTATION

### Original File Structure (src/js/tabs/motors.js - ~1400 lines)

#### A. Core State Management (`motors` object):
```javascript
const motors = {
    previousDshotBidir: null,           // Track DShot bidirectional changes
    previousFilterDynQ: null,           // Track filter Q changes
    previousFilterDynCount: null,       // Track filter count changes
    analyticsChanges: {},               // Track changes for analytics
    configHasChanged: false,            // Global flag for unsaved changes
    configChanges: {},                  // Detailed change tracking
    feature3DEnabled: false,            // 3D mode state
    sensor: "gyro",                     // Current sensor (gyro/accel)
    sensorGyroRate: 20,                 // Sensor update rate
    sensorGyroScale: 2000,              // Sensor scale
    sensorAccelRate: 20,
    sensorAccelScale: 2,
    numberOfValidOutputs: 0,            // Number of active motors
    armed: false                        // Arming state
}
```

#### B. Critical Functions:

**1. setContentButtons(motorsTesting = false)** (Line 286-291)
- Controls ALL button states in the tab
- Disables tool buttons when config changed OR motors testing
- Disables save button when no changes
- Disables stop button when not testing
```javascript
$(".btn .tool").toggleClass("disabled", self.configHasChanged || motorsTesting);
$(".btn .save").toggleClass("disabled", !self.configHasChanged);
$(".btn .stop").toggleClass("disabled", !motorsTesting);
```

**2. disableHandler(e)** (Line 317-361)
- Listens to ALL configuration changes
- Tracks changes in configChanges object
- Sets configHasChanged flag
- Automatically stops motor testing if config changes
- Calls setContentButtons() to update UI

**3. motorsEnableTestMode change handler** (Line 937-976)
- **CRITICAL SAFETY**: Prevents testing if configHasChanged
- Shows dialog warning if user tries to test with unsaved changes
- Sends DShot extended telemetry enable command
- Sets up keyboard listener to stop on ANY key press (safety feature)
- Calls setContentButtons(enabled)
- Calls mspHelper.setArmingEnabled(enabled, enabled)

**4. Save Button Handler** (Line 1207-1248)
- Async function
- Sends MSP commands in sequence:
  - MSP_SET_MIXER_CONFIG
  - MSP_SET_MOTOR_CONFIG
  - MSP_SET_MOTOR_3D_CONFIG
  - MSP_SET_ADVANCED_CONFIG
  - MSP_SET_ARMING_CONFIG
  - MSP_SET_FILTER_CONFIG
- Sends analytics
- Resets configHasChanged = false
- Resets analyticsChanges = {}
- Calls mspHelper.writeConfiguration(true) - saves and reboots

**5. Stop Button Handler** (Line 1249)
```javascript
$("a.stop").on("click", () => motorsEnableTestModeElement.prop("checked", false).trigger("change"));
```
- Simply unchecks the test mode checkbox
- The .trigger("change") does ALL the cleanup (stops motors, re-enables sliders, updates buttons)

**6. Motor Slider Input Handlers** (Line 969-1010)
- Buffers motor commands to prevent MSP overflow
- Uses 10ms debounce (buffer_delay)
- Sends MSP_SET_MOTOR with all motor values
- Master slider updates all motors simultaneously
- Wheel scroll support with Alt key

**7. Polling Interval** (Line 1251)
```javascript
GUI.interval_add("motor_and_status_pull", get_motor_data, 50, true);
```
- Runs every 50ms
- get_motor_data() -> get_motor_telemetry_data() -> update_ui()
- Updates motor values, telemetry (RPM, temp, voltage, current)
- Updates power statistics (mAh, Wh)
- Checks arm state changes
- Updates graphs

#### C. Configuration Tracking System:

**defaultConfiguration object** (Line 293-308):
```javascript
const defaultConfiguration = {
    mixer: FC.MIXER_CONFIG.mixer,
    reverseMotorSwitch: FC.MIXER_CONFIG.reverseMotorDir,
    escprotocol: FC.PID_ADVANCED_CONFIG.fast_pwm_protocol + 1,
    feature4: FC.FEATURE_CONFIG.features.isEnabled("MOTOR_STOP"),
    feature12: FC.FEATURE_CONFIG.features.isEnabled("3D"),
    _3ddeadbandlow: FC.MOTOR_3D_CONFIG.deadband3d_low,
    _3ddeadbandhigh: FC.MOTOR_3D_CONFIG.deadband3d_high,
    _3dneutral: FC.MOTOR_3D_CONFIG.neutral,
    minthrottle: FC.MOTOR_CONFIG.minthrottle,
    maxthrottle: FC.MOTOR_CONFIG.maxthrottle,
    mincommand: FC.MOTOR_CONFIG.mincommand,
    motorPoles: FC.MOTOR_CONFIG.motor_poles,
    dshotbidir: FC.MOTOR_CONFIG.use_dshot_telemetry,
    ESC_SENSOR: FC.MOTOR_CONFIG.use_esc_sensor
}
```

#### D. Missing Features in Current Vue Implementation:

**CRITICAL MISSING:**
1. ❌ configHasChanged flag and comprehensive tracking
2. ❌ setContentButtons() equivalent - button state management
3. ❌ Dialog warning when trying to test with unsaved changes
4. ❌ Complete configuration change tracking (only tracking 2 of 14+ fields)
5. ❌ Automatic motor test disable on config change
6. ❌ Keyboard listener to stop motors on any key press
7. ❌ Buffer/debounce for motor slider inputs
8. ❌ 50ms polling interval for motor data
9. ❌ Motor telemetry display (RPM, temp, voltage, current)
10. ❌ Power monitoring (mAh, Wh drawn)

**PARTIALLY IMPLEMENTED:**
1. ⚠️ Motor testing checkbox (missing safety checks)
2. ⚠️ Save button (missing comprehensive MSP sequence)
3. ⚠️ Motor tool buttons visibility (basic logic present)

**CORRECTLY IMPLEMENTED:**
1. ✅ Mixer preview SVG loading
2. ✅ ESC/Motor reordering dialogs (converted to Vue)
3. ✅ Basic motor configuration UI
4. ✅ Sensor graph setup
5. ✅ ESC protocol selection

#### E. Safety Features in Original:

1. **Config Change Prevention:**
   - Blocks motor testing if ANY config changed
   - Shows warning dialog explaining need to save first
   - Automatically stops motors if config changes while testing

2. **Keyboard Safety:**
   - ANY key press (except PageUp/Down/etc) stops motors
   - Prevents accidental motor spin during typing

3. **Arming State:**
   - Syncs checkbox with actual arming state
   - Disables testing if arming is disabled in FC

4. **Buffer Protection:**
   - Debounces motor commands to prevent MSP overflow
   - Uses 10ms delay with command queuing

---

## 2. MISSING FUNCTIONALITY DOCUMENTATION

### Critical Safety Features:
- [ ] configHasChanged prevention of motor testing
- [ ] Warning dialog when attempting test with unsaved changes  
- [ ] Automatic motor stop on configuration change
- [ ] Keyboard listener for emergency stop (any key)
- [ ] MSP command buffering/debouncing

### State Management:
- [ ] Complete defaultConfiguration with all 14+ fields
- [ ] configChanges detailed tracking
- [ ] analyticsChanges tracking
- [ ] previousDshotBidir/FilterDynQ/FilterDynCount tracking
- [ ] feature3DEnabled flag
- [ ] armed state tracking

### UI/Button Management:
- [ ] setContentButtons() - central button state controller
- [ ] Tool buttons disable when config changed OR testing
- [ ] Save button enable only when changes exist
- [ ] Stop button enable only when testing
- [ ] Dialog system for warnings

### Motor Testing:
- [ ] Complete motorsEnableTestMode change handler
- [ ] DShot extended telemetry enable command
- [ ] mspHelper.setArmingEnabled() calls
- [ ] Master slider affecting all motors
- [ ] Individual motor slider handlers with buffering
- [ ] Alt+scroll wheel support

### Data Polling & Display:
- [ ] 50ms interval for motor_and_status_pull
- [ ] get_motor_data() -> MSP_MOTOR
- [ ] get_motor_telemetry_data() -> MSP_MOTOR_TELEMETRY  
- [ ] update_ui() with all displays
- [ ] Motor telemetry: RPM, temperature, voltage, current
- [ ] Power stats: mAh drawn, Wh drawn
- [ ] Arm state change detection

### 3D Mode Support:
- [ ] feature3DEnabled tracking
- [ ] checkUpdate3dControls() function
- [ ] 3D deadband inputs (low, high, neutral)
- [ ] Bidirectional throttle handling

### Additional Features:
- [ ] Motor poles configuration
- [ ] Min throttle / Max throttle / Min command
- [ ] Analog protocol support (PWM/Oneshot)
- [ ] ESC sensor configuration
- [ ] DShot bidirectional telemetry toggle
- [ ] Dynamic filter change dialog

---

## 3. COMPREHENSIVE MIGRATION PLAN

### Phase 1: Backup and Setup ✅
1. [x] Create this migration plan document
2. [ ] Backup current MotorsTab.vue to MotorsTab.vue.backup
3. [ ] Create new composable: useMotorsState.js (centralized state)
4. [ ] Create new composable: useMotorTesting.js (testing logic)
5. [ ] Create new composable: useMotorDataPolling.js (50ms polling)

### Phase 2: Core State Management 🎯
1. [ ] Create defaultConfiguration ref with all 14+ fields
2. [ ] Create configChanges ref for detailed tracking
3. [ ] Create configHasChanged computed property
4. [ ] Create analyticsChanges ref
5. [ ] Create motorsTestingEnabled ref (replaces checkbox state)
6. [ ] Implement comprehensive config change watchers

### Phase 3: Button State Management 🎯
1. [ ] Create buttonStates computed property (setContentButtons equivalent)
2. [ ] toolButtonsDisabled = configHasChanged || motorsTestingEnabled
3. [ ] saveButtonDisabled = !configHasChanged
4. [ ] stopButtonDisabled = !motorsTestingEnabled
5. [ ] Update template with proper :disabled bindings

### Phase 4: Safety Features 🎯
1. [ ] Implement config change dialog warning
2. [ ] Add keyboard listener (any key stops motors)
3. [ ] Auto-stop motors on config change
4. [ ] Prevent motor testing when configHasChanged
5. [ ] Add mspHelper.setArmingEnabled() calls

### Phase 5: Motor Testing Implementation 🎯
1. [ ] Complete motorsEnableTestMode watcher
2. [ ] Send DShot extended telemetry command
3. [ ] Implement motor slider handlers with buffering
4. [ ] Master slider affecting all motors
5. [ ] Alt+scroll wheel support
6. [ ] MSP_SET_MOTOR command sending

### Phase 6: Data Polling 🎯
1. [ ] Set up GUI.interval_add 50ms polling
2. [ ] Implement get_motor_data() MSP call
3. [ ] Implement get_motor_telemetry_data() MSP call
4. [ ] Implement update_ui() with all displays
5. [ ] Motor telemetry display (RPM, temp, voltage, current)
6. [ ] Power monitoring display (mAh, Wh)
7. [ ] Arm state change detection

### Phase 7: Save/Reboot Implementation 🎯
1. [ ] Implement complete async save sequence:
   - MSP_SET_MIXER_CONFIG
   - MSP_SET_MOTOR_CONFIG
   - MSP_SET_MOTOR_3D_CONFIG
   - MSP_SET_ADVANCED_CONFIG
   - MSP_SET_ARMING_CONFIG
   - MSP_SET_FILTER_CONFIG
2. [ ] Send analytics on save
3. [ ] Reset configHasChanged
4. [ ] Call mspHelper.writeConfiguration(true)

### Phase 8: 3D Mode Support 🎯
1. [ ] Add feature3DEnabled computed
2. [ ] Add checkUpdate3dControls() function
3. [ ] 3D deadband inputs with v-model
4. [ ] Show/hide 3D UI based on feature enabled

### Phase 9: Additional Configuration 🎯
1. [ ] Motor poles input
2. [ ] Min/max throttle, min command inputs
3. [ ] DShot bidirectional toggle
4. [ ] ESC sensor toggle
5. [ ] All inputs tracked in configChanges

### Phase 10: Testing & Validation 🎯
1. [ ] Test motor testing enable/disable
2. [ ] Test config change prevention
3. [ ] Test save and reboot sequence
4. [ ] Test motor slider controls
5. [ ] Test telemetry display
6. [ ] Test all safety features (keyboard stop, auto-stop)
7. [ ] Test with real hardware if possible

---

## 4. FILE STRUCTURE

```
src/
  components/
    tabs/
      MotorsTab.vue.backup          # Backup of current implementation
      MotorsTab.vue                 # Fresh implementation
  composables/
    motors/
      useMotorsState.js             # Central state management
      useMotorTesting.js            # Motor testing logic
      useMotorDataPolling.js        # 50ms data polling
      useMotorConfiguration.js      # Config tracking
```

---

## 5. IMPLEMENTATION ORDER

### START HERE - Most Critical:
1. **State Management** (Phase 2) - Foundation for everything
2. **Button Management** (Phase 3) - User interface control
3. **Safety Features** (Phase 4) - CRITICAL for safe operation
4. **Motor Testing** (Phase 5) - Core functionality
5. **Save/Reboot** (Phase 7) - Save configuration changes

### Then Add:
6. **Data Polling** (Phase 6) - Telemetry display
7. **3D Mode** (Phase 8) - Advanced feature
8. **Additional Config** (Phase 9) - Complete configuration

### Finally:
9. **Testing** (Phase 10) - Validation

---

## 6. KEY LEARNINGS FROM CURRENT IMPLEMENTATION

### What Worked Well:
- Vue 3 Composition API structure
- Dialog conversion (MotorOutputReorderingDialog, EscDshotDirectionDialog)
- Mixer preview SVG loading approach
- ESC protocol selection UI
- Pinia store integration for FC data

### What Needs Improvement:
- Need comprehensive state management (not just 2 config fields)
- Need central button state controller
- Need proper safety checks before motor testing
- Need complete MSP command sequences
- Need data polling for real-time updates

### Technical Decisions:
- Use composables for complex logic separation
- Keep dialogs as separate Vue components ✅
- Use watchers for config change detection
- Use computed properties for derived state
- Keep MSP calls in async functions

---

## READY TO START FRESH IMPLEMENTATION

This plan provides complete roadmap for proper Motors tab migration that maintains all safety features and functionality from original implementation.
