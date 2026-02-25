<template>
    <BaseTab tab-name="servos" :extra-class="isSupported ? 'supported' : ''">
        <div class="content_wrapper">
            <div class="tab_title">{{ $t("tabServos") }}</div>
            <WikiButton docUrl="servos" />
            <div class="grid-row">
                <!-- Servo configuration table (when supported) -->
                <div v-if="isSupported" class="require-support">
                    <div class="title">{{ $t("servosChangeDirection") }}</div>
                    <div class="table_overflow">
                        <table class="fields">
                            <thead>
                                <tr class="main">
                                    <th style="width: 110px">{{ $t("servosName") }}</th>
                                    <th>{{ $t("servosMin") }}</th>
                                    <th>{{ $t("servosMid") }}</th>
                                    <th>{{ $t("servosMax") }}</th>
                                    <th class="short">CH1</th>
                                    <th class="short">CH2</th>
                                    <th class="short">CH3</th>
                                    <th class="short">CH4</th>
                                    <th v-for="i in auxChannelCount" :key="i">A{{ i }}</th>
                                    <th style="width: 110px">{{ $t("servosRateAndDirection") }}</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="(servo, index) in servoConfigs" :key="index">
                                    <td style="text-align: center">Servo {{ index + 1 }}</td>
                                    <td class="min">
                                        <input
                                            type="number"
                                            min="500"
                                            max="2500"
                                            v-model.number="servo.min"
                                            @change="onServoChange"
                                        />
                                    </td>
                                    <td class="middle">
                                        <input
                                            type="number"
                                            min="500"
                                            max="2500"
                                            v-model.number="servo.middle"
                                            @change="onServoChange"
                                        />
                                    </td>
                                    <td class="max">
                                        <input
                                            type="number"
                                            min="500"
                                            max="2500"
                                            v-model.number="servo.max"
                                            @change="onServoChange"
                                        />
                                    </td>
                                    <td v-for="ch in totalChannels" :key="ch" class="channel">
                                        <input
                                            type="checkbox"
                                            :checked="servo.indexOfChannelToForward === ch - 1"
                                            @change="setChannelForward(index, ch - 1, $event)"
                                        />
                                    </td>
                                    <td class="direction">
                                        <select class="rate" v-model.number="servo.rate" @change="onServoChange">
                                            <option v-for="rate in rateOptions" :key="rate" :value="rate">
                                                {{ $t("servosRate") }} {{ rate }}%
                                            </option>
                                        </select>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <div class="spacer"></div>
                    <div class="live">
                        <input type="checkbox" class="togglemedium" v-model="liveMode" />
                        <span>{{ $t("servosLiveMode") }}</span>
                    </div>

                    <!-- Resource Assignments Section -->
                    <div class="spacer"></div>
                    <div class="title">{{ $t("servosResourceAssignments") }}</div>
                    <div class="note" v-if="!hasResourceData">
                        <p>{{ $t("servosResourceNotAvailable") }}</p>
                    </div>
                    <div v-else class="resource-grid">
                        <div class="resource-section">
                            <h4>{{ $t("servosMotorResources") }}</h4>
                            <table class="resource-table">
                                <thead>
                                    <tr>
                                        <th>{{ $t("servosResourceIndex") }}</th>
                                        <th>{{ $t("servosResourcePin") }}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="motor in motorResources" :key="motor.index">
                                        <td>{{ $t("servosResourceMotorLabel") }} {{ motor.index + 1 }}</td>
                                        <td>
                                            <select
                                                class="resource-select"
                                                :value="motor.pin"
                                                @change="onMotorPinChange(motor.index, $event)"
                                            >
                                                <option value="NONE">NONE</option>
                                                <option v-for="pin in availablePins" :key="pin" :value="pin">
                                                    {{ pin }}
                                                </option>
                                            </select>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <div class="resource-section">
                            <h4>{{ $t("servosServoResources") }}</h4>
                            <table class="resource-table">
                                <thead>
                                    <tr>
                                        <th>{{ $t("servosResourceIndex") }}</th>
                                        <th>{{ $t("servosResourcePin") }}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="servo in servoResources" :key="servo.index">
                                        <td>{{ $t("servosResourceServoLabel") }} {{ servo.index + 1 }}</td>
                                        <td>
                                            <select
                                                class="resource-select"
                                                :value="servo.pin"
                                                @change="onServoPinChange(servo.index, $event)"
                                            >
                                                <option value="NONE">NONE</option>
                                                <option v-for="pin in availablePins" :key="pin" :value="pin">
                                                    {{ pin }}
                                                </option>
                                            </select>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div class="note" v-if="hasResourceData">
                        <p>{{ $t("servosResourceEditHint") }}</p>
                    </div>
                </div>

                <!-- Upgrade required message -->
                <div v-else class="note require-upgrade">
                    <p>{{ $t("servosFirmwareUpgradeRequired") }}</p>
                </div>
            </div>

            <div class="spacer"></div>

            <!-- Servo visualization bars -->
            <div class="grid-row" v-if="isSupported">
                <div class="grid-col col6">
                    <div class="gui_box servoblock">
                        <div class="spacer">
                            <div class="servos">
                                <div class="title2">{{ $t("servosText") }}</div>
                                <ul class="titles">
                                    <li v-for="i in 8" :key="i" :title="$t(`servoNumber${i}`)">{{ i }}</li>
                                </ul>
                                <div class="bar-wrapper">
                                    <div v-for="i in 8" :key="i" :class="`m-block servo-${i - 1}`">
                                        <div class="meter-bar">
                                            <div class="indicator" :style="getBarStyle(servoData[i - 1] || 1500)">
                                                <div class="label"></div>
                                            </div>
                                            <div class="label">{{ servoData[i - 1] || 1500 }}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="clear-both"></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Save button toolbar -->
        <div class="content_toolbar toolbar_fixed_bottom" v-if="isSupported">
            <div class="btn save_btn">
                <a class="update" href="#" @click.prevent="saveServoConfig">{{ $t("servosButtonSave") }}</a>
            </div>
        </div>
    </BaseTab>
</template>

<script>
import { defineComponent, ref, reactive, computed, onMounted, onUnmounted } from "vue";
import BaseTab from "./BaseTab.vue";
import GUI from "../../js/gui";
import FC from "../../js/fc";
import MSP from "../../js/msp";
import MSPCodes from "../../js/msp/MSPCodes";
import { mspHelper } from "../../js/msp/MSPHelper";
import { gui_log } from "../../js/gui_log";
import { i18n } from "../../js/localization";
import WikiButton from "../elements/WikiButton.vue";

// Calculate bar style for servo visualization
function getBarStyle(value) {
    const rangeMin = 1000;
    const rangeMax = 2000;
    const blockHeight = 100;
    const fullBlockScale = rangeMax - rangeMin;
    const barHeight = value - rangeMin;
    const clamped = Math.min(Math.max(barHeight * (blockHeight / fullBlockScale), 0), blockHeight);
    const marginTop = blockHeight - clamped;
    const height = clamped;

    const alpha = Math.min(Math.max(barHeight / fullBlockScale, 0), 1).toFixed(2);

    return {
        marginTop: `${marginTop}px`,
        height: `${height}px`,
        backgroundColor: `rgba(255,187,0,${alpha})`,
    };
}

export default defineComponent({
    name: "ServosTab",
    components: {
        BaseTab,
        WikiButton,
    },
    setup() {
        const isSupported = ref(false);
        const liveMode = ref(false);
        const servoConfigs = reactive([]);
        const servoData = reactive([]);
        const motorResources = reactive([]);
        const servoResources = reactive([]);
        const hasResourceData = ref(false);
        const resourcesModified = ref(false);

        // Track local intervals for cleanup
        const localIntervals = [];

        // Store the initial pins from firmware so they remain selectable after edits
        const initialPins = ref([]);

        // Available pins for resource assignment (common STM32 pins used for motors/servos)
        // This list includes typical timer-capable pins on F4/F7/H7 boards
        const availablePins = computed(() => {
            const pins = new Set(initialPins.value);
            // Also include any currently assigned pins from motor and servo resources
            for (const motor of motorResources) {
                if (motor.pin && motor.pin !== "NONE") {
                    pins.add(motor.pin);
                }
            }
            for (const servo of servoResources) {
                if (servo.pin && servo.pin !== "NONE") {
                    pins.add(servo.pin);
                }
            }
            return Array.from(pins).sort();
        });

        // Helper to add interval and track it
        const addLocalInterval = (name, code, period, first = false) => {
            GUI.interval_add(name, code, period, first);
            localIntervals.push(name);
        };

        // Calculate aux channels from RC active channels
        const totalChannels = computed(() => FC.RC?.active_channels || 8);
        const auxChannelCount = computed(() => Math.max(0, totalChannels.value - 4));

        // Generate rate options from 100 to -100
        const rateOptions = [];
        for (let i = 100; i > -101; i--) {
            rateOptions.push(i);
        }

        // Handle channel forward checkbox (only one per servo)
        function setChannelForward(servoIndex, channelIndex, event) {
            if (event.target.checked) {
                servoConfigs[servoIndex].indexOfChannelToForward = channelIndex;
            } else {
                servoConfigs[servoIndex].indexOfChannelToForward = -1;
            }
            onServoChange();
        }

        // Called when any servo setting changes
        function onServoChange() {
            if (liveMode.value) {
                // Apply changes to FC in live mode
                GUI.timeout_add("servos_update", () => updateServos(false), 10);
            }
        }

        // Update FC.SERVO_CONFIG from local state and send to FC
        function updateServos(saveToEeprom) {
            const SERVO_MIN = 500;
            const SERVO_MAX = 2500;

            // Copy local state to FC with clamping and keep Vue state in sync
            for (let i = 0; i < servoConfigs.length; i++) {
                const src = servoConfigs[i];
                const cfg = FC.SERVO_CONFIG[i];

                const min = Math.min(Math.max(src.min ?? SERVO_MIN, SERVO_MIN), SERVO_MAX);
                const middle = Math.min(Math.max(src.middle ?? SERVO_MIN, SERVO_MIN), SERVO_MAX);
                const max = Math.min(Math.max(src.max ?? SERVO_MAX, SERVO_MIN), SERVO_MAX);

                cfg.min = min;
                cfg.middle = middle;
                cfg.max = max;
                cfg.rate = src.rate;
                cfg.indexOfChannelToForward = src.indexOfChannelToForward ?? -1;

                // reflect any clamping back into the reactive model
                src.min = min;
                src.middle = middle;
                src.max = max;
            }

            // Send to FC
            mspHelper.sendServoConfigurations(() => {
                if (saveToEeprom) {
                    mspHelper.writeConfiguration(false, () => {
                        gui_log(i18n.getMessage("servosEepromSave"));
                    });
                }
            });
        }

        // Save button handler
        function saveServoConfig() {
            updateServos(true);
        }

        // Pull servo data for visualization
        function getServoData() {
            MSP.send_message(MSPCodes.MSP_SERVO, false, false, () => {
                for (let i = 0; i < FC.SERVO_DATA.length; i++) {
                    servoData[i] = FC.SERVO_DATA[i];
                }
            });
        }

        // Load all servo data from FC
        async function loadServoData() {
            // Check if we're actually connected to a FC
            if (!FC.CONFIG?.apiVersion) {
                isSupported.value = false;
                GUI.content_ready();
                return;
            }

            try {
                await MSP.promise(MSPCodes.MSP_SERVO_CONFIGURATIONS);
                await MSP.promise(MSPCodes.MSP_SERVO_MIX_RULES);
                await MSP.promise(MSPCodes.MSP_RC);
                await MSP.promise(MSPCodes.MSP_BOXNAMES);

                // Try to load resource data (may not be available on older firmware)
                try {
                    await MSP.promise(MSPCodes.MSP2_MOTOR_SERVO_RESOURCE);
                    loadResourceData();
                } catch {
                    console.log("Resource data not available (firmware may not support MSP2_MOTOR_SERVO_RESOURCE)");
                    hasResourceData.value = false;
                }

                initializeUI();
            } catch (e) {
                console.error("Failed to load servo configs", e);
                isSupported.value = false;
                GUI.content_ready(); // Ensure tab doesn't hang
            }
        }

        // Load resource assignment data into reactive arrays
        function loadResourceData() {
            // Seed initial pins from firmware data so they remain selectable after edits
            const pins = new Set();

            if (FC.MOTOR_RESOURCES && FC.MOTOR_RESOURCES.length > 0) {
                motorResources.length = 0;
                for (const resource of FC.MOTOR_RESOURCES) {
                    motorResources.push({ ...resource });
                    if (resource.pin && resource.pin !== "NONE") {
                        pins.add(resource.pin);
                    }
                }
            }
            if (FC.SERVO_RESOURCES && FC.SERVO_RESOURCES.length > 0) {
                servoResources.length = 0;
                for (const resource of FC.SERVO_RESOURCES) {
                    servoResources.push({ ...resource });
                    if (resource.pin && resource.pin !== "NONE") {
                        pins.add(resource.pin);
                    }
                }
            }

            initialPins.value = Array.from(pins).sort();
            hasResourceData.value = motorResources.length > 0 || servoResources.length > 0;
            resourcesModified.value = false;
        }

        // Handle resource pin change (shared helper for motor and servo)
        function onResourcePinChange(resourceType, resources, index, event) {
            const newPin = event.target.value;
            const ioTag = newPin === "NONE" ? 0 : mspHelper.pinToIoTag(newPin);

            // Update local state immediately
            resources[index].pin = newPin;
            resources[index].ioTag = ioTag;
            resourcesModified.value = true;

            // Send to FC
            const label = resourceType === 0 ? "Motor" : "Servo";
            mspHelper.setMotorServoResource(resourceType, index, ioTag, () => {
                console.log(`${label} ${index + 1} pin set to ${newPin}`);
            });
        }

        // Handle motor pin change
        function onMotorPinChange(index, event) {
            onResourcePinChange(0, motorResources, index, event);
        }

        // Handle servo pin change
        function onServoPinChange(index, event) {
            onResourcePinChange(1, servoResources, index, event);
        }

        // Initialize UI after data is loaded
        function initializeUI() {
            // Check if servo configuration is available
            if (!FC.SERVO_CONFIG || FC.SERVO_CONFIG.length === 0) {
                isSupported.value = false;
                GUI.content_ready();
                return;
            }

            isSupported.value = true;

            // Clear and populate reactive servoConfigs array
            servoConfigs.length = 0;
            for (let i = 0; i < 8; i++) {
                if (FC.SERVO_CONFIG[i]) {
                    servoConfigs.push({
                        min: FC.SERVO_CONFIG[i].min,
                        middle: FC.SERVO_CONFIG[i].middle,
                        max: FC.SERVO_CONFIG[i].max,
                        rate: FC.SERVO_CONFIG[i].rate,
                        indexOfChannelToForward: FC.SERVO_CONFIG[i].indexOfChannelToForward,
                    });
                }
            }

            // Start servo data polling for visualization
            addLocalInterval("servo_data_pull", getServoData, 50);

            // Status polling
            addLocalInterval("status_pull", () => MSP.send_message(MSPCodes.MSP_STATUS), 250, true);

            GUI.content_ready();
        }

        onMounted(() => {
            loadServoData();
        });

        onUnmounted(() => {
            // Clean up only our own intervals
            localIntervals.forEach((name) => GUI.interval_remove(name));
            localIntervals.length = 0;
        });

        return {
            isSupported,
            liveMode,
            servoConfigs,
            servoData,
            motorResources,
            servoResources,
            hasResourceData,
            resourcesModified,
            availablePins,
            totalChannels,
            auxChannelCount,
            rateOptions,
            getBarStyle,
            setChannelForward,
            onServoChange,
            onMotorPinChange,
            onServoPinChange,
            saveServoConfig,
        };
    },
});
</script>

<style scoped>
/* Inherit styles from existing servos.html via global CSS */
.bar-wrapper {
    display: flex;
    flex-direction: row;
}

/* Resource assignment styles */
.resource-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 20px;
    margin-bottom: 15px;
}

.resource-section {
    flex: 1;
    min-width: 200px;
}

.resource-section h4 {
    margin: 0 0 10px 0;
    font-size: 13px;
    font-weight: bold;
}

.resource-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
}

.resource-table th,
.resource-table td {
    border: 1px solid var(--surface-500);
    padding: 4px 8px;
    text-align: center;
}

.resource-table th {
    background-color: var(--surface-400);
    font-weight: bold;
}

.resource-table tr:nth-child(even) {
    background-color: var(--surface-200);
}

.resource-table .pin-none {
    color: var(--text-muted, #888);
    font-style: italic;
}

.resource-select {
    width: 100%;
    padding: 2px 4px;
    font-size: 12px;
    border: 1px solid var(--surface-500);
    border-radius: 3px;
    background-color: var(--surface-100);
    cursor: pointer;
}

.resource-select:hover {
    border-color: var(--primary-color, #ffbb00);
}

.resource-select:focus {
    outline: none;
    border-color: var(--primary-color, #ffbb00);
    box-shadow: 0 0 3px var(--primary-color, #ffbb00);
}
</style>
