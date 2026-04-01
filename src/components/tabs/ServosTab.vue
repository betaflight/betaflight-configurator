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
                <button type="button" class="save" @click="saveServoConfig">{{ $t("servosButtonSave") }}</button>
            </div>
        </div>
    </BaseTab>
</template>

<script>
import { defineComponent, ref, reactive, computed, onMounted } from "vue";
import BaseTab from "./BaseTab.vue";
import GUI from "../../js/gui";
import FC from "../../js/fc";
import MSP from "../../js/msp";
import MSPCodes from "../../js/msp/MSPCodes";
import { mspHelper } from "../../js/msp/MSPHelper";
import { gui_log } from "../../js/gui_log";
import { i18n } from "../../js/localization";
import WikiButton from "../elements/WikiButton.vue";
import { useInterval } from "../../composables/useInterval";
import { useTimeout } from "../../composables/useTimeout";

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

        const { addInterval } = useInterval();
        const { addTimeout } = useTimeout();

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
                addTimeout("servos_update", () => updateServos(false), 10);
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
                initializeUI();
            } catch (e) {
                console.error("Failed to load servo configs", e);
                isSupported.value = false;
                GUI.content_ready(); // Ensure tab doesn't hang
            }
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
            addInterval("servo_data_pull", getServoData, 50);

            // Status polling
            addInterval("status_pull", () => MSP.send_message(MSPCodes.MSP_STATUS), 250, true);

            GUI.content_ready();
        }

        onMounted(() => {
            loadServoData();
        });

        // Interval/timeout cleanup handled automatically by composables on unmount

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

<style lang="less">
.bar-wrapper {
    display: flex;
    flex-direction: row;
}

.tab-servos {
    height: 100%;

    .title {
        margin-top: 0;
        line-height: 30px;
        text-align: center;
        font-weight: bold;
        border: 1px solid var(--surface-500);
        border-bottom: 0;
        background-color: var(--surface-300);
        color: var(--text);
        border-top-right-radius: 5px;
        border-top-left-radius: 5px;
    }
    table {
        margin-bottom: 10px;
        width: 100%;
        border-collapse: collapse;
        border-left: 0;
        border-right: 0;
        border-top: 0;
        th {
            border-left: 0;
            border-right: 0;
            border-top: 0;
            padding-top: 3px;
            padding-bottom: 3px;
            text-align: center;
            border: 1px solid var(--surface-500);
            line-height: 14px;
        }
        td {
            border-top: 0;
            border-bottom: 1px solid var(--surface-500);
            border-left: 1px solid var(--surface-500);
            border-right: 1px solid var(--surface-500);
            padding: 6px 5px 7px 5px;
            &:nth-child(2) {
                width: 140px;
            }
            &:nth-child(3) {
                width: 140px;
            }
            &:nth-child(4) {
                width: 140px;
            }
            &:nth-child(19) {
                width: 110px;
            }
        }
        tr {
            &:nth-child(even) {
                background-color: var(--surface-200);
            }
            td {
                &:first-child {
                    text-align: left;
                    width: 55px;
                }
            }
        }
        .main {
            font-weight: bold;
            text-align: center;
            background-color: var(--surface-400);
        }
        .channel {
            width: 40px;
            text-align: center;
            input {
                vertical-align: middle;
            }
        }
        input {
            border: 1px solid var(--surface-500);
            border-radius: 3px;
        }
        select {
            border: 1px solid var(--surface-500);
            border-radius: 3px;
        }
        input[type="number"] {
            display: block;
            width: 100%;
            height: 20px;
            line-height: 20px;
            text-align: right;
        }
        input[type="checkbox"] {
            width: 16px;
            height: 16px;
        }
    }
    input[type="number"] {
        &::-webkit-inner-spin-button {
            border: 0;
        }
    }
    .directions {
        .direction {
            select {
                height: 19px;
                line-height: 19px;
            }
        }
    }
    .direction {
        .name {
            float: left;
            display: block;
            width: 60px;
        }
        .alternate {
            float: left;
            display: block;
            width: 60px;
        }
        .first {
            float: left;
            margin: 2px 10px 0 20px;
        }
        .second {
            float: left;
            margin: 2px 10px 0 0;
        }
        .rate {
            width: 110px;
            text-align: center;
        }
    }
    .live {
        float: left;
        margin-top: 0;
        span {
            float: left;
            margin-right: 10px;
        }
        input {
            float: left;
            margin: 0 0 0 5px;
        }
    }
    .buttons {
        width: calc(100% - 20px);
        position: absolute;
        bottom: 10px;
    }
    .require-support {
        display: none;
    }
    .require-upgrade {
        display: block;
    }
    .wide {
        width: 120px;
    }
    .short {
        width: 40px;
    }
    .table_overflow {
        overflow: auto;
    }
    position: relative;
    .spacer_box {
        padding-bottom: 10px;
        float: left;
        width: calc(100% - 20px);
    }
    .gui_box_titlebar {
        margin-bottom: 0;
    }
    .gui_box {
        margin-bottom: 10px;
        font-weight: bold;
        span {
            font-style: normal;
            font-weight: normal;
            line-height: 19px;
            color: var(--text);
            font-size: 11px;
        }
    }
    .spacer {
        width: calc(100% - 34px);
        margin: 10px;
    }
    .servoblock {
        margin-bottom: 24px;
        background-color: var(--surface-400);
    }
    .title2 {
        padding-bottom: 2px;
        text-align: center;
        font-size: 12px;
        font-weight: 300;
    }
    .titles {
        height: 20px;
        li {
            float: left;
            width: calc((100% / 9) - 10px);
            margin-right: 10px;
            text-align: center;
        }
        .active {
            color: green;
        }
    }
    .servos {
        .titles {
            li {
                float: left;
                width: calc((100% / 8) - 10px);
                margin-right: 10px;
            }
        }
        .m-block {
            float: left;
            width: calc((100% / 8) - 10px);
            margin-right: 10px;
            border-radius: 3px;
        }
    }
    .m-block {
        float: left;
        width: calc((100% / 9) - 10px);
        height: 100px;
        margin-right: 10px;
        text-align: center;
        background-color: var(--surface-300);
        border-radius: 3px;
        box-shadow: inset 0 0 5px rgba(0, 0, 0, 0.2);
        .meter-bar {
            position: relative;
            width: 100%;
            height: 100px;
            box-shadow: inset 0 0 5px rgba(0, 0, 0, 0.2);
            background-color: var(--surface-300);
            border-radius: 3px;
            border: 1px solid var(--surface-500);
        }
        .label {
            position: absolute;
            width: 100%;
            bottom: 45px;
            text-align: center;
            font-weight: bold;
            font-size: 10px;
            color: var(--surface-950);
        }
        .label.rpm_info {
            bottom: 28px;
        }
        .indicator {
            .label {
                color: white;
            }
        }
    }
    .indicator {
        position: absolute;
        overflow: hidden;
        width: 100%;
        text-align: center;
        border-radius: 2px;
    }
}
.tab-servos.supported {
    .require-support {
        display: block;
        overflow-x: auto;
    }
    .require-upgrade {
        display: none;
    }
}
@media all and (max-width: 575px) {
    .tab-servos {
        table {
            th {
                min-width: 30px;
            }
        }
        .min {
            min-width: 60px;
        }
        .max {
            min-width: 60px;
        }
        .middle {
            min-width: 60px;
        }
        .gui_box {
            min-height: auto;
        }
        .left.motors {
            width: 100%;
            order: 1;
        }
        .right.servos {
            width: 100%;
            order: 3;
            margin-top: 15px;
        }
        .titles {
            li {
                width: calc((100% - 80px) / 9);
                &:last-child {
                    margin-right: 0;
                }
            }
        }
        .m-block {
            width: calc((100% - 80px) / 9);
        }
        .servos {
            .m-block {
                width: calc((100% - 70px) / 8);
            }
        }
        .servo_testing {
            .values {
                li {
                    &:last-child {
                        margin-left: 4px;
                    }
                }
            }
        }
    }
}
@media only screen and (max-width: 1055px) {
    .tab-servos {
        .gui_box {
            span {
                line-height: 17px;
            }
        }
    }
}
@media only screen and (max-device-width: 1055px) {
    .tab-servos {
        .gui_box {
            span {
                line-height: 17px;
            }
        }
    }
}
</style>
