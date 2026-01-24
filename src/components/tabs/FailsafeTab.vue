<template>
    <BaseTab tab-name="failsafe">
        <div class="content_wrapper">
            <div class="tab_title" v-html="$t('tabFailsafe')"></div>
            <WikiButton docUrl="Failsafe" />

            <div class="note">
                <p v-html="$t('failsafeFeaturesHelpNew')"></p>
            </div>

            <div class="grid-row grid-box col2">
                <div class="col-span-1">
                    <!-- Pulse Range Settings -->
                    <div class="gui_box grey">
                        <div class="gui_box_titlebar">
                            <div class="spacer_box_title" v-html="$t('failsafePulsrangeTitle')"></div>
                            <div class="helpicon cf_tip" :title="$t('failsafePulsrangeHelp')"></div>
                        </div>
                        <div class="spacer_box">
                            <div class="number">
                                <label>
                                    <input type="number" v-model.number="rxConfig.rx_min_usec" min="750" max="2250" />
                                    <span v-html="$t('failsafeRxMinUsecItem')"></span>
                                </label>
                            </div>
                            <div class="number">
                                <label>
                                    <input type="number" v-model.number="rxConfig.rx_max_usec" min="750" max="2250" />
                                    <span v-html="$t('failsafeRxMaxUsecItem')"></span>
                                </label>
                            </div>
                        </div>
                    </div>

                    <!-- Channel Fallback Settings -->
                    <div class="gui_box grey stage1">
                        <div class="gui_box_titlebar">
                            <div class="spacer_box_title" v-html="$t('failsafeChannelFallbackSettingsTitle')"></div>
                            <div class="helpicon cf_tip" :title="$t('failsafeChannelFallbackSettingsHelp')"></div>
                        </div>
                        <div class="spacer_box">
                            <div class="activechannellist">
                                <div v-for="(channel, index) in activeChannels" :key="index" class="number">
                                    <template v-if="index < 4">
                                        <div class="channelprimary">
                                            <span>{{ channel.name }}</span>
                                        </div>
                                    </template>
                                    <template v-else>
                                        <div class="channelauxiliary">
                                            <span class="channelname">{{ channel.name }}</span>
                                            <span v-html="channel.assignment"></span>
                                        </div>
                                    </template>

                                    <div
                                        class="cf_tip channelsetting"
                                        :title="
                                            $t(
                                                index < 4
                                                    ? 'failsafeChannelFallbackSettingsAuto'
                                                    : 'failsafeChannelFallbackSettingsHold',
                                            )
                                        "
                                    >
                                        <select class="aux_set" v-model.number="rxFailConfig[index].mode">
                                            <option v-if="index < 4" :value="0">
                                                {{ $t("failsafeChannelFallbackSettingsValueAuto") }}
                                            </option>
                                            <option :value="1">
                                                {{ $t("failsafeChannelFallbackSettingsValueHold") }}
                                            </option>
                                            <option :value="2">
                                                {{ $t("failsafeChannelFallbackSettingsValueSet") }}
                                            </option>
                                        </select>
                                    </div>
                                    <div class="auxiliary">
                                        <input
                                            type="number"
                                            v-model.number="rxFailConfig[index].value"
                                            min="750"
                                            max="2250"
                                            step="25"
                                            :disabled="rxFailConfig[index].mode !== 2"
                                            v-show="rxFailConfig[index].mode === 2"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="col-span-1">
                    <!-- Failsafe Switch -->
                    <div class="gui_box grey failsafe_switch">
                        <div class="gui_box_titlebar">
                            <div class="spacer_box_title" v-html="$t('failsafeSwitchTitle')"></div>
                        </div>
                        <div class="spacer_box">
                            <div class="number">
                                <label>
                                    <select
                                        id="failsafeSwitchSelect"
                                        class="switchMode"
                                        v-model.number="failsafeConfig.failsafe_switch_mode"
                                    >
                                        <option :value="0" v-html="$t('failsafeSwitchOptionStage1')"></option>
                                        <option :value="2" v-html="$t('failsafeSwitchOptionStage2')"></option>
                                        <option :value="1" v-html="$t('failsafeSwitchOptionKill')"></option>
                                    </select>
                                    <span v-html="$t('failsafeSwitchModeItem')"></span>
                                </label>
                                <div class="helpicon cf_tip" :title="$t('failsafeSwitchModeHelp')"></div>
                            </div>
                        </div>
                    </div>

                    <!-- Stage 2 Settings -->
                    <div class="gui_box grey">
                        <div class="gui_box_titlebar">
                            <div class="spacer_box_title" v-html="$t('failsafeStageTwoSettingsTitle')"></div>
                        </div>
                        <div class="spacer_box">
                            <div class="checkbox stage2 kill_switch" style="display: none">
                                <!-- Hidden in legacy js -->
                                <div class="numberspacer">
                                    <input type="checkbox" id="failsafe_kill_switch" />
                                </div>
                                <!-- ... -->
                            </div>

                            <div class="number stage2">
                                <label>
                                    <input type="number" v-model.number="failsafeDelay" min="1" max="20" step="0.1" />
                                    <span v-html="$t('failsafeDelayItem')"></span>
                                </label>
                                <div class="helpicon cf_tip" :title="$t('failsafeDelayHelp')"></div>
                            </div>

                            <div class="number stage2">
                                <label>
                                    <input
                                        type="number"
                                        v-model.number="failsafeThrottleLowDelay"
                                        min="0"
                                        max="30"
                                        step="0.1"
                                    />
                                    <span v-html="$t('failsafeThrottleLowItem')"></span>
                                </label>
                                <div class="helpicon cf_tip" :title="$t('failsafeThrottleLowHelp')"></div>
                            </div>

                            <!-- Procedure Radio Buttons -->
                            <div class="subline stage2" v-html="$t('failsafeSubTitle1')"></div>

                            <div class="radioarea pro1 stage2">
                                <div class="radiobuttons">
                                    <input
                                        class="procedure"
                                        id="drop"
                                        type="radio"
                                        :value="1"
                                        v-model.number="failsafeConfig.failsafe_procedure"
                                    />
                                    <label for="drop" v-html="$t('failsafeProcedureItemSelect2')"></label>
                                </div>
                            </div>

                            <div class="radioarea pro2 stage2">
                                <div class="radiobuttons">
                                    <input
                                        class="procedure"
                                        id="land"
                                        type="radio"
                                        :value="0"
                                        v-model.number="failsafeConfig.failsafe_procedure"
                                    />
                                    <label for="land" v-html="$t('failsafeProcedureItemSelect1')"></label>
                                </div>
                                <div
                                    class="proceduresettings"
                                    :class="{ disabled: failsafeConfig.failsafe_procedure !== 0 }"
                                >
                                    <div class="number">
                                        <label>
                                            <input
                                                type="number"
                                                v-model.number="failsafeConfig.failsafe_throttle"
                                                min="0"
                                                max="2000"
                                                :disabled="failsafeConfig.failsafe_procedure !== 0"
                                            />
                                            <span v-html="$t('failsafeThrottleItem')"></span>
                                        </label>
                                    </div>
                                    <div class="number">
                                        <label>
                                            <input
                                                type="number"
                                                v-model.number="failsafeOffDelay"
                                                min="0"
                                                max="250"
                                                step="0.1"
                                                :disabled="failsafeConfig.failsafe_procedure !== 0"
                                            />
                                            <span v-html="$t('failsafeOffDelayItem')"></span>
                                        </label>
                                        <div class="helpicon cf_tip" :title="$t('failsafeOffDelayHelp')"></div>
                                    </div>
                                </div>
                            </div>

                            <div class="radioarea pro4 stage2" v-if="gpsConfig">
                                <div class="radiobuttons">
                                    <input
                                        class="procedure"
                                        id="gps_rescue"
                                        type="radio"
                                        :value="2"
                                        v-model.number="failsafeConfig.failsafe_procedure"
                                    />
                                    <label for="gps_rescue" v-html="$t('failsafeProcedureItemSelect4')"></label>
                                </div>
                                <div
                                    class="proceduresettings"
                                    :class="{
                                        disabled: failsafeConfig.failsafe_procedure !== 2 && !hasGpsRescueAsMode,
                                    }"
                                >
                                    <!-- GPS Rescue Settings -->
                                    <!-- ... (Implementing all GPS Rescue fields) ... -->
                                    <div class="number">
                                        <label>
                                            <select
                                                class="switchMode"
                                                v-model.number="gpsRescue.altitudeMode"
                                                :disabled="isGpsSettingsDisabled"
                                            >
                                                <option
                                                    :value="0"
                                                    v-html="$t('failsafeGpsRescueItemAltitudeModeMaxAlt')"
                                                ></option>
                                                <option
                                                    :value="1"
                                                    v-html="$t('failsafeGpsRescueItemAltitudeModeFixedAlt')"
                                                ></option>
                                                <option
                                                    :value="2"
                                                    v-html="$t('failsafeGpsRescueItemAltitudeModeCurrentAlt')"
                                                ></option>
                                            </select>
                                            <span v-html="$t('failsafeGpsRescueItemAltitudeMode')"></span>
                                        </label>
                                    </div>

                                    <div class="number" v-if="gpsRescue.altitudeMode === 1">
                                        <!-- showReturnAlt logic -->
                                        <label>
                                            <input
                                                type="number"
                                                v-model.number="gpsRescue.returnAltitudeM"
                                                min="20"
                                                max="100"
                                                :disabled="isGpsSettingsDisabled"
                                            />
                                            <span v-html="$t('failsafeGpsRescueItemReturnAltitude')"></span>
                                        </label>
                                    </div>

                                    <div class="number">
                                        <label>
                                            <input
                                                type="number"
                                                v-model.number="gpsRescue.initialClimbM"
                                                min="0"
                                                max="100"
                                                :disabled="isGpsSettingsDisabled"
                                            />
                                            <span v-html="$t('failsafeGpsRescueInitialClimb')"></span>
                                        </label>
                                        <div
                                            class="helpicon cf_tip"
                                            :title="$t('failsafeGpsRescueInitialClimbHelp')"
                                        ></div>
                                    </div>

                                    <div class="number">
                                        <label>
                                            <input
                                                type="number"
                                                v-model.number="gpsRescueAscendRate"
                                                min="1.00"
                                                max="25.00"
                                                step="0.1"
                                                :disabled="isGpsSettingsDisabled"
                                            />
                                            <span v-html="$t('failsafeGpsRescueItemAscendRate')"></span>
                                        </label>
                                    </div>

                                    <div class="number">
                                        <label>
                                            <input
                                                type="number"
                                                v-model.number="gpsRescueGroundSpeed"
                                                min="3.00"
                                                max="30.00"
                                                step="0.1"
                                                :disabled="isGpsSettingsDisabled"
                                            />
                                            <span v-html="$t('failsafeGpsRescueItemGroundSpeed')"></span>
                                        </label>
                                    </div>

                                    <div class="number">
                                        <label>
                                            <input
                                                type="number"
                                                v-model.number="gpsRescue.angle"
                                                min="0"
                                                max="200"
                                                :disabled="isGpsSettingsDisabled"
                                            />
                                            <span v-html="$t('failsafeGpsRescueItemAngle')"></span>
                                            <div
                                                class="helpicon cf_tip"
                                                :title="$t('failsafeGpsRescueAngleHelp')"
                                            ></div>
                                        </label>
                                    </div>

                                    <div class="number">
                                        <label>
                                            <input
                                                type="number"
                                                v-model.number="gpsRescue.descentDistanceM"
                                                min="30"
                                                max="500"
                                                :disabled="isGpsSettingsDisabled"
                                            />
                                            <span v-html="$t('failsafeGpsRescueItemDescentDistance')"></span>
                                        </label>
                                    </div>

                                    <div class="number">
                                        <label>
                                            <input
                                                type="number"
                                                v-model.number="gpsRescueDescendRate"
                                                min="1.00"
                                                max="5.00"
                                                step="0.1"
                                                :disabled="isGpsSettingsDisabled"
                                            />
                                            <span v-html="$t('failsafeGpsRescueItemDescendRate')"></span>
                                            <div
                                                class="helpicon cf_tip"
                                                :title="$t('failsafeGpsRescueDescendRateHelp')"
                                            ></div>
                                        </label>
                                    </div>

                                    <div class="number">
                                        <label>
                                            <input
                                                type="number"
                                                v-model.number="gpsRescue.throttleMin"
                                                min="1000"
                                                max="2000"
                                                :disabled="isGpsSettingsDisabled"
                                            />
                                            <span v-html="$t('failsafeGpsRescueItemThrottleMin')"></span>
                                        </label>
                                    </div>

                                    <div class="number">
                                        <label>
                                            <input
                                                type="number"
                                                v-model.number="gpsRescue.throttleMax"
                                                min="1000"
                                                max="2000"
                                                :disabled="isGpsSettingsDisabled"
                                            />
                                            <span v-html="$t('failsafeGpsRescueItemThrottleMax')"></span>
                                            <div
                                                class="helpicon cf_tip"
                                                :title="$t('failsafeGpsRescueThrottleMaxHelp')"
                                            ></div>
                                        </label>
                                    </div>

                                    <div class="number">
                                        <label>
                                            <input
                                                type="number"
                                                v-model.number="gpsRescue.throttleHover"
                                                min="1000"
                                                max="2000"
                                                :disabled="isGpsSettingsDisabled"
                                            />
                                            <span v-html="$t('failsafeGpsRescueItemThrottleHover')"></span>
                                        </label>
                                        <div
                                            class="helpicon cf_tip"
                                            :title="$t('failsafeGpsRescueThrottleHoverHelp')"
                                        ></div>
                                    </div>

                                    <div class="number">
                                        <label>
                                            <input
                                                type="number"
                                                v-model.number="gpsRescue.minStartDistM"
                                                min="50"
                                                max="1000"
                                                :disabled="isGpsSettingsDisabled"
                                            />
                                            <span v-html="$t('failsafeGpsRescueItemMinDth')"></span>
                                        </label>
                                        <div
                                            class="helpicon cf_tip"
                                            :title="$t('failsafeGpsRescueItemMinDthHelp')"
                                        ></div>
                                    </div>

                                    <div class="number">
                                        <label>
                                            <input
                                                type="number"
                                                v-model.number="gpsRescue.minSats"
                                                min="5"
                                                max="50"
                                                :disabled="isGpsSettingsDisabled"
                                            />
                                            <span v-html="$t('failsafeGpsRescueItemMinSats')"></span>
                                        </label>
                                    </div>

                                    <div class="number">
                                        <label>
                                            <input
                                                type="checkbox"
                                                v-model="gpsRescueAllowArmingWithoutFix"
                                                class="toggle"
                                                :disabled="isGpsSettingsDisabled"
                                            />
                                            <span v-html="$t('failsafeGpsRescueItemAllowArmingWithoutFix')"></span>
                                        </label>
                                        <div
                                            class="helpicon cf_tip"
                                            :title="$t('failsafeGpsRescueArmWithoutFixHelp')"
                                        ></div>
                                    </div>

                                    <div class="number">
                                        <label>
                                            <select
                                                class="switchMode"
                                                v-model.number="gpsRescue.sanityChecks"
                                                :disabled="isGpsSettingsDisabled"
                                            >
                                                <option
                                                    :value="0"
                                                    v-html="$t('failsafeGpsRescueItemSanityChecksOff')"
                                                ></option>
                                                <option
                                                    :value="1"
                                                    v-html="$t('failsafeGpsRescueItemSanityChecksOn')"
                                                ></option>
                                                <option
                                                    :value="2"
                                                    v-html="$t('failsafeGpsRescueItemSanityChecksFSOnly')"
                                                ></option>
                                            </select>
                                            <span v-html="$t('failsafeGpsRescueItemSanityChecks')"></span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="content_toolbar toolbar_fixed_bottom" style="position: fixed">
                <div class="btn save_btn">
                    <a class="save" href="#" @click.prevent="saveConfig" v-html="$t('configurationButtonSave')"></a>
                </div>
            </div>
        </div>
    </BaseTab>
</template>

<script setup>
import { computed, ref, onMounted, nextTick } from "vue";
import { useFlightControllerStore } from "@/stores/fc";
import { useNavigationStore } from "@/stores/navigation";
import { useReboot } from "@/composables/useReboot";
import BaseTab from "./BaseTab.vue";
import WikiButton from "@/components/elements/WikiButton.vue";
import { i18n } from "@/js/localization";
import MSP from "@/js/msp";
import MSPCodes from "@/js/msp/MSPCodes";
import { mspHelper } from "@/js/msp/MSPHelper";
import adjustBoxNameIfPeripheralWithModeID from "@/js/peripherals";
import semver from "semver";
import { API_VERSION_1_41 } from "@/js/data_storage";
import GUI from "@/js/gui";

const t = (key) => i18n.getMessage(key);
const fcStore = useFlightControllerStore();
const navigationStore = useNavigationStore();
const { reboot } = useReboot();

const isSaving = ref(false);

const performReboot = () => {
    reboot();
};

const loadConfig = async () => {
    try {
        await MSP.promise(MSPCodes.MSP_RX_CONFIG);
        await MSP.promise(MSPCodes.MSP_FAILSAFE_CONFIG);

        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_41)) {
            await MSP.promise(MSPCodes.MSP_GPS_RESCUE);
        }

        await MSP.promise(MSPCodes.MSP_RXFAIL_CONFIG);
        // Also ensure features are loaded for adjusting box names?
        // ConfigurationTab loads them via MSP_FEATURE_CONFIG.
        // BaseTab might load some defaults, but let's be safe.
        await MSP.promise(MSPCodes.MSP_FEATURE_CONFIG);

        // And we need AUX configs for the channel assignments
        await MSP.promise(MSPCodes.MSP_MODE_RANGES);
    } catch (e) {
        console.error("Failed to load Failsafe configuration", e);
    }
};



// Computed properties for direct access to store data
const rxConfig = computed(() => fcStore.rxConfig);
const rxFailConfig = computed(() => fcStore.rxFailConfig);
const failsafeConfig = computed(() => fcStore.failsafeConfig);
const gpsRescue = computed(() => fcStore.gpsRescue);
const gpsConfig = computed(() => fcStore.gpsConfig);
const rc = computed(() => fcStore.rc);
const auxConfig = computed(() => fcStore.auxConfig);
const auxConfigIds = computed(() => fcStore.auxConfigIds);
const modeRanges = computed(() => fcStore.modeRanges);
const rssiConfig = computed(() => fcStore.rssiConfig);

// Channel Generation Logic
const activeChannels = computed(() => {
    const channels = [];
    const channelNames = [t("controlAxisRoll"), t("controlAxisPitch"), t("controlAxisYaw"), t("controlAxisThrottle")];

    let auxIndex = 1;
    let auxAssignmentIndex = 0;

    // Pre-calculate aux assignments
    const auxAssignments = [];
    for (let i = 0; i < rc.value.active_channels - 4; i++) {
        auxAssignments.push("");
    }

    if (rssiConfig.value && typeof rssiConfig.value.channel !== "undefined") {
        const index = rssiConfig.value.channel - 5;
        if (index >= 0 && index < auxAssignments.length) {
            auxAssignments[index] += `<span class="modename">RSSI</span>`;
        }
    }

    let hasGpsRescue = false;
    for (let modeIndex = 0; modeIndex < auxConfig.value.length; modeIndex++) {
        const modeId = auxConfigIds.value[modeIndex];

        for (let modeRangeIndex = 0; modeRangeIndex < modeRanges.value.length; modeRangeIndex++) {
            const modeRange = modeRanges.value[modeRangeIndex];
            if (modeRange.id !== modeId) continue;

            const range = modeRange.range;
            if (range.start >= range.end) continue;

            let modeName = auxConfig.value[modeIndex];
            if (!hasGpsRescue && modeName === "GPS RESCUE") {
                hasGpsRescue = true;
            }
            modeName = adjustBoxNameIfPeripheralWithModeID(modeId, modeName);

            if (modeRange.auxChannelIndex < auxAssignments.length) {
                auxAssignments[modeRange.auxChannelIndex] += `<span class="modename">${modeName}</span>`;
            }
        }
    }

    for (let i = 0; i < rxFailConfig.value.length; i++) {
        if (i < 4) {
            channels.push({ name: channelNames[i] });
        } else {
            const messageKey = `controlAxisAux${auxIndex++}`;
            channels.push({
                name: t(messageKey),
                assignment: auxAssignments[auxAssignmentIndex++] || "",
            });
        }
    }
    return channels;
});

// Helper for GPS Rescue toggle
const hasGpsRescueAsMode = computed(() => {
    for (let modeIndex = 0; modeIndex < auxConfig.value.length; modeIndex++) {
        if (auxConfig.value[modeIndex] === "GPS RESCUE") {
            // Check if it's actually assigned to a range
            const modeId = auxConfigIds.value[modeIndex];
            const hasRange = modeRanges.value.some((mr) => mr.id === modeId && mr.range.start < mr.range.end);
            if (hasRange) return true;
        }
    }
    return false;
});

const isGpsSettingsDisabled = computed(() => {
    return failsafeConfig.value.failsafe_procedure !== 2 && !hasGpsRescueAsMode.value;
});

// Computed properties for conversions (values stored as x10 or x100 in config)
const failsafeDelay = computed({
    get: () => (failsafeConfig.value.failsafe_delay / 10.0).toFixed(1),
    set: (val) => (failsafeConfig.value.failsafe_delay = Math.round(parseFloat(val) * 10.0)),
});

const failsafeThrottleLowDelay = computed({
    get: () => (failsafeConfig.value.failsafe_throttle_low_delay / 10.0).toFixed(1),
    set: (val) => (failsafeConfig.value.failsafe_throttle_low_delay = Math.round(parseFloat(val) * 10.0)),
});

const failsafeOffDelay = computed({
    get: () => (failsafeConfig.value.failsafe_off_delay / 10.0).toFixed(1),
    set: (val) => (failsafeConfig.value.failsafe_off_delay = Math.round(parseFloat(val) * 10.0)),
});

// GPS Rescue Conversions
const gpsRescueGroundSpeed = computed({
    get: () => (gpsRescue.value.groundSpeed / 100).toFixed(1),
    set: (val) => (gpsRescue.value.groundSpeed = Math.round(parseFloat(val) * 100)),
});

const gpsRescueAscendRate = computed({
    get: () => (gpsRescue.value.ascendRate / 100).toFixed(1),
    set: (val) => (gpsRescue.value.ascendRate = Math.round(parseFloat(val) * 100)),
});

const gpsRescueDescendRate = computed({
    get: () => (gpsRescue.value.descendRate / 100).toFixed(1),
    set: (val) => (gpsRescue.value.descendRate = Math.round(parseFloat(val) * 100)),
});

const gpsRescueAllowArmingWithoutFix = computed({
    get: () => gpsRescue.value.allowArmingWithoutFix > 0,
    set: (val) => (gpsRescue.value.allowArmingWithoutFix = val ? 1 : 0),
});

// Save Function
const saveConfig = async () => {
    if (isSaving.value) return;
    isSaving.value = true;

    try {
        // Data is already updated via v-model in Pinia store ref (which proxies to FC object)

        // Save sequence mirroring failsafe.js
        await MSP.promise(MSPCodes.MSP_SET_RX_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_RX_CONFIG));
        await MSP.promise(MSPCodes.MSP_SET_FAILSAFE_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_FAILSAFE_CONFIG));

        // RXFAIL_CONFIG needs special handling via mspHelper
        // mspHelper.sendRxFailConfig returns a promise or accepts callback?
        // Checking sendRxFailConfig implementation: it uses MSP.send_message internally recursively.
        // It accepts a callback.
        await new Promise((resolve) => {
            mspHelper.sendRxFailConfig(resolve);
        });

        await MSP.promise(MSPCodes.MSP_SET_FEATURE_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_FEATURE_CONFIG));

        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_41)) {
            await MSP.promise(MSPCodes.MSP_SET_GPS_RESCUE, mspHelper.crunch(MSPCodes.MSP_SET_GPS_RESCUE));
        }

        // Save to EEPROM and Reboot
        await new Promise((resolve) => {
            mspHelper.writeConfiguration(false, () => {
                navigationStore.cleanup(() => {
                    performReboot();
                    resolve();
                });
            });
        });
    } catch (e) {
        console.error("Failed to save configuration", e);
    } finally {
        isSaving.value = false;
    }
};

onMounted(async () => {
    await loadConfig();
    await nextTick();
    GUI.content_ready();
});
</script>

<style scoped>
.content_wrapper {
    padding-bottom: 60px; /* Space for fixed toolbar */
}

/* Add any specific styles here, or rely on global layout */
.numberspacer {
    margin-right: 10px;
}
.activechannellist .number {
    display: flex;
    align-items: center;
    margin-bottom: 5px;
}
.channelprimary,
.channelauxiliary {
    width: 200px;
    display: inline-block;
}
.channelname {
    font-weight: bold;
    margin-right: 5px;
}
.modename {
    background: #333;
    color: #fff;
    padding: 2px 5px;
    border-radius: 3px;
    font-size: 0.8em;
    margin-left: 5px;
}
.aux_set {
    width: 100px;
}
.proceduresettings.disabled {
    opacity: 0.5;
    pointer-events: none;
}
</style>
