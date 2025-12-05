<template>
    <BaseTab tab-name="servos" :extra-class="isSupported ? 'supported' : ''">
        <div class="content_wrapper">
            <div class="tab_title">{{ $t("tabServos") }}</div>
            <div class="cf_doc_version_bt">
                <a id="button-documentation" href="" target="_blank"></a>
            </div>

            <div class="grid-row">
                <!-- Servo configuration table (when supported) -->
                <div v-if="isSupported" class="require-support">
                    <div class="title">{{ $t("servosChangeDirection") }}</div>
                    <div class="table_overflow">
                        <table class="fields">
                            <thead>
                                <tr class="main">
                                    <th width="110px">{{ $t("servosName") }}</th>
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
                                    <li v-for="i in 8" :key="i" :title="$t(`servoNumber${9 - i}`)">{{ 9 - i }}</li>
                                </ul>
                                <div class="bar-wrapper">
                                    <div v-for="i in 8" :key="i" :class="`m-block servo-${8 - i}`">
                                        <div class="meter-bar">
                                            <div class="label">{{ servoData[8 - i] || 1500 }}</div>
                                            <div class="indicator" :style="getBarStyle(servoData[8 - i] || 1500)">
                                                <div class="label"></div>
                                            </div>
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

export default defineComponent({
    name: "ServosTab",
    components: {
        BaseTab,
    },
    setup() {
        const isSupported = ref(false);
        const liveMode = ref(false);
        const servoConfigs = reactive([]);
        const servoData = reactive([]);

        // Track local intervals for cleanup
        const localIntervals = [];

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

        // Calculate bar style for servo visualization
        function getBarStyle(value) {
            const rangeMin = 1000;
            const rangeMax = 2000;
            const blockHeight = 100;
            const fullBlockScale = rangeMax - rangeMin;
            const barHeight = value - rangeMin;
            const marginTop =
                blockHeight - Math.min(Math.max(barHeight * (blockHeight / fullBlockScale), 0), blockHeight);
            const height = Math.min(Math.max(barHeight * (blockHeight / fullBlockScale), 0), blockHeight);

            // Calculate alpha based on bar height (0.0 to 1.0)
            const alpha = Math.min(Math.max(barHeight / fullBlockScale, 0), 1).toFixed(2);

            return {
                marginTop: `${marginTop}px`,
                height: `${height}px`,
                backgroundColor: `rgba(255,187,0,${alpha})`,
            };
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
            // Copy local state to FC
            for (let i = 0; i < servoConfigs.length; i++) {
                FC.SERVO_CONFIG[i].min = servoConfigs[i].min;
                FC.SERVO_CONFIG[i].middle = servoConfigs[i].middle;
                FC.SERVO_CONFIG[i].max = servoConfigs[i].max;
                FC.SERVO_CONFIG[i].rate = servoConfigs[i].rate;
                FC.SERVO_CONFIG[i].indexOfChannelToForward = servoConfigs[i].indexOfChannelToForward;
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
        function loadServoData() {
            // Check if we're actually connected to a FC
            if (!FC.CONFIG?.apiVersion) {
                isSupported.value = false;
                GUI.content_ready();
                return;
            }

            MSP.send_message(MSPCodes.MSP_SERVO_CONFIGURATIONS, false, false, () => {
                MSP.send_message(MSPCodes.MSP_SERVO_MIX_RULES, false, false, () => {
                    MSP.send_message(MSPCodes.MSP_RC, false, false, () => {
                        MSP.send_message(MSPCodes.MSP_BOXNAMES, false, false, () => {
                            initializeUI();
                        });
                    });
                });
            });
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
            totalChannels,
            auxChannelCount,
            rateOptions,
            getBarStyle,
            setChannelForward,
            onServoChange,
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
</style>
