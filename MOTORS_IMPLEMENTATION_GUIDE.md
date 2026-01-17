# Motors Tab Implementation Guide

## STATUS: Ready to implement Phase 2-5 (Core + Safety)

### Composables Created ✅

1. **useMotorsState.js** - Central state management with all 14+ config fields
2. **useMotorTesting.js** - Motor testing with safety (keyboard listener, config change prevention)
3. **useMotorDataPolling.js** - 50ms polling for motor data/telemetry
4. **useMotorConfiguration.js** - Watchers for all config changes

### What to Keep from Current Implementation

✅ **Keep These (Working Well):**
- Template structure (grid layout, boxes)
- Mixer preview SVG loading
- ESC protocol selection UI
- EscDshotDirectionDialog integration
- MotorOutputReorderingDialog integration
- Motor tool buttons visibility logic
- Sensor graph setup
- CSS styling

### What to Replace/Add

🔄 **Replace in `<script setup>`:**

```javascript
// OLD (incomplete):
const configHasChanged = ref(false);
const analyticsChanges = ref({});
const motorTestEnabled = ref(false);

// NEW (complete):
import { useMotorsState } from '@/composables/motors/useMotorsState';
import { useMotorTesting } from '@/composables/motors/useMotorTesting';
import { useMotorConfiguration } from '@/composables/motors/useMotorConfiguration';
import { useMotorDataPolling } from '@/composables/motors/useMotorDataPolling';

const motorsState = useMotorsState();
const { configHasChanged, trackChange, resetChanges } = motorsState;

// Show warning dialog function
const showWarningDialog = (message) => {
    // Implement warning dialog
};

const {
    motorsTestingEnabled,
    motorValues,
    masterValue,
    sendMotorCommand,
    stopAllMotors
} = useMotorTesting(configHasChanged, showWarningDialog);

const { setupConfigWatchers } = useMotorConfiguration(
    motorsState,
    motorsTestingEnabled,
    () => { motorsTestingEnabled.value = false; }
);

const { motorTelemetry, powerStats } = useMotorDataPolling(motorsTestingEnabled);
```

🔄 **Add Button State Management:**

```javascript
// Button states (central controller like original setContentButtons)
const buttonStates = computed(() => ({
    toolsDisabled: configHasChanged.value || motorsTestingEnabled.value,
    saveDisabled: !configHasChanged.value,
    stopDisabled: !motorsTestingEnabled.value,
}));
```

🔄 **Update Action Toolbar Template:**

```vue
<div class="content_toolbar">
    <div class="btn">
        <a 
            href="#" 
            class="save" 
            :class="{ disabled: buttonStates.saveDisabled }"
            @click.prevent="saveAndReboot"
        >
            <span v-html="$t('configurationButtonSave')"></span>
        </a>
    </div>
    <div class="btn">
        <a 
            href="#" 
            class="stop" 
            :class="{ disabled: buttonStates.stopDisabled }"
            @click.prevent="stopMotors"
        >
            <span v-html="$t('escDshotDirectionDialog-StopWizard')"></span>
        </a>
    </div>
</div>
```

🔄 **Update Motor Tool Buttons:**

```vue
<div class="btn motor_tool_buttons">
    <a
        href="#"
        class="tool regular-button"
        :class="{ disabled: buttonStates.toolsDisabled }"
        v-if="isMotorReorderingAvailable"
        @click.prevent="!buttonStates.toolsDisabled && openMotorOutputReorderDialog()"
    >
        {{ $t('motorOutputReorderDialogOpen') }}
    </a>
    <a
        href="#"
        class="tool regular-button"
        :class="{ disabled: buttonStates.toolsDisabled }"
        v-if="digitalProtocolConfigured"
        @click.prevent="!buttonStates.toolsDisabled && openEscDshotDirectionDialog()"
    >
        {{ $t('escDshotDirectionDialog-Open') }}
    </a>
</div>
```

### Complete Save and Reboot Implementation

```javascript
const saveAndReboot = async () => {
    if (!configHasChanged.value) return;
    
    try {
        // Send all MSP commands in sequence
        await MSP.promise(MSPCodes.MSP_SET_MIXER_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_MIXER_CONFIG));
        await MSP.promise(MSPCodes.MSP_SET_MOTOR_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_MOTOR_CONFIG));
        await MSP.promise(MSPCodes.MSP_SET_MOTOR_3D_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_MOTOR_3D_CONFIG));
        await MSP.promise(MSPCodes.MSP_SET_ADVANCED_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_ADVANCED_CONFIG));
        await MSP.promise(MSPCodes.MSP_SET_ARMING_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_ARMING_CONFIG));
        await MSP.promise(MSPCodes.MSP_SET_FILTER_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_FILTER_CONFIG));

        // Send analytics
        if (motorsState.analyticsChanges.value && Object.keys(motorsState.analyticsChanges.value).length > 0) {
            tracking.sendSaveAndChangeEvents(
                tracking.EVENT_CATEGORIES.FLIGHT_CONTROLLER,
                motorsState.analyticsChanges.value,
                'motors'
            );
        }

        // Reset state
        resetChanges();

        // Save to EEPROM and reboot
        mspHelper.writeConfiguration(true);
    } catch (error) {
        console.error('[Motors] Save failed:', error);
    }
};

const stopMotors = () => {
    motorsTestingEnabled.value = false;
};
```

### onMounted Setup

```javascript
onMounted(() => {
    // Initialize defaults when FC data is loaded
    motorsState.initializeDefaults();
    
    // Setup config change watchers
    setupConfigWatchers();
});
```

### Warning Dialog Implementation

```vue
<!-- Add to template -->
<dialog id="dialog-settings-changed" ref="dialogSettingsChanged">
    <div id="dialog-settings-changed-content-wrapper">
        <div id="dialog-settings-changed-content">{{ warningMessage }}</div>
        <div class="btn dialog-buttons">
            <a 
                href="#" 
                class="regular-button" 
                @click.prevent="closeWarningDialog"
                v-html="$t('motorsDialogSettingsChangedOk')"
            ></a>
        </div>
    </div>
</dialog>
```

```javascript
// In script:
const dialogSettingsChanged = ref(null);
const warningMessage = ref('');

const showWarningDialog = (message) => {
    warningMessage.value = message;
    dialogSettingsChanged.value?.showModal();
};

const closeWarningDialog = () => {
    dialogSettingsChanged.value?.close();
};
```

## Next Steps

1. Update MotorsTab.vue `<script setup>` section with new composables
2. Add buttonStates computed property
3. Update template with proper :disabled bindings
4. Implement complete saveAndReboot function
5. Add warning dialog to template
6. Test motor testing enable/disable with safety checks
7. Test configuration change tracking
8. Test save and reboot sequence

## Files Modified

- ✅ src/composables/motors/useMotorsState.js (created)
- ✅ src/composables/motors/useMotorTesting.js (created)
- ✅ src/composables/motors/useMotorDataPolling.js (created)
- ✅ src/composables/motors/useMotorConfiguration.js (created)
- 🔄 src/components/tabs/MotorsTab.vue (to be updated)

Ready to apply changes to MotorsTab.vue!
