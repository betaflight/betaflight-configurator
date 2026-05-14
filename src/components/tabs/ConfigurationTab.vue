<template>
    <div class="tab-configuration">
        <div class="content_wrapper">
            <div class="tab_title">{{ $t("tabConfiguration") }}</div>
            <WikiButton docUrl="configuration" />
            <UiBox highlight class="mb-3">
                <p v-html="$t('configurationFeaturesHelp')"></p>
            </UiBox>

            <div class="grid-row grid-box col2">
                <div class="col-span-1">
                    <!-- SYSTEM CONFIGURATION -->
                    <UiBox :title="$t('configurationSystem')">
                        <UiBox highlight>
                            <p class="systemconfigNote" v-html="$t('configurationLoopTimeHelp')"></p>
                        </UiBox>
                        <SettingRow :label="$t('configurationGyroFrequency')">
                            <UInput readonly disabled :value="gyroFrequencyDisplay" class="min-w-40" />
                        </SettingRow>
                        <SettingRow
                            :label="$t('configurationPidProcessDenom')"
                            :help="$t('configurationPidProcessDenomHelp')"
                        >
                            <USelect
                                :items="pidDenomOptions"
                                v-model="pidAdvancedConfig.pid_process_denom"
                                class="min-w-40"
                            />
                        </SettingRow>
                    </UiBox>

                    <!-- PERSONALIZATION -->
                    <UiBox :title="$t('configurationPersonalization')">
                        <SettingRow :label="$t('craftName')" :help="$t('configurationCraftNameHelp')">
                            <UInput v-model="craftName" maxlength="16" class="min-w-40" />
                        </SettingRow>
                        <SettingRow
                            :label="$t('configurationPilotName')"
                            :help="$t('configurationPilotNameHelp')"
                            v-if="showPilotName"
                        >
                            <UInput v-model="pilotName" maxlength="16" class="min-w-40" />
                        </SettingRow>
                    </UiBox>

                    <!-- CAMERA -->
                    <UiBox :title="$t('configurationCamera')" v-if="accHardwareEnabled">
                        <SettingRow :label="$t('configurationFpvCamAngleDegrees')">
                            <UInputNumber
                                v-model="fpvCamAngleDegrees"
                                :step="1"
                                :min="0"
                                :max="90"
                                orientation="vertical"
                                size="xs"
                                class="w-16"
                            />
                        </SettingRow>
                    </UiBox>

                    <!-- ARMING -->
                    <UiBox
                        :title="$t('configurationArming')"
                        :help="$t('configurationArmingHelp')"
                        v-if="accHardwareEnabled"
                    >
                        <SettingRow :label="$t('configurationSmallAngle')" :help="$t('configurationSmallAngleHelp')">
                            <UInputNumber
                                v-model="armingConfig.small_angle"
                                :step="1"
                                :min="0"
                                :max="180"
                                orientation="vertical"
                                size="xs"
                                class="w-16"
                            />
                        </SettingRow>
                        <SettingRow
                            :label="$t('configurationGyroCalOnFirstArm')"
                            :help="$t('configurationGyroCalOnFirstArmHelp')"
                            v-if="showGyroCalOnFirstArm"
                        >
                            <USwitch v-model="armingConfig.gyro_cal_on_first_arm_bool" />
                        </SettingRow>
                        <SettingRow
                            :label="$t('configurationAutoDisarmDelay')"
                            :help="$t('configurationAutoDisarmDelayHelp')"
                            v-if="showAutoDisarmDelay"
                        >
                            <UInputNumber
                                v-model="armingConfig.auto_disarm_delay"
                                :step="1"
                                :min="0"
                                :max="60"
                                orientation="vertical"
                                size="xs"
                                class="w-16"
                            />
                        </SettingRow>
                    </UiBox>

                    <!-- FEATURES -->
                    <UiBox :title="$t('configurationFeatures')">
                        <SettingRow
                            v-for="feature in featuresList"
                            :key="feature.bit"
                            fullWidth
                            :help="feature.haveTip ? $t('feature' + feature.name + 'Tip') : undefined"
                        >
                            <USwitch
                                :model-value="isFeatureEnabled(feature)"
                                @update:model-value="(checked) => toggleFeature(feature, checked)"
                            />
                            <template #label>
                                <span class="w-48 shrink-0 font-bold text-xs leading-snug">{{ feature.name }}</span>
                                <span
                                    class="min-w-0 flex-1 text-xs leading-snug"
                                    v-html="$t('feature' + feature.name)"
                                ></span>
                            </template>
                        </SettingRow>
                    </UiBox>

                    <!-- DSHOT BEACON -->
                    <UiBox :title="$t('configurationDshotBeeper')" :help="$t('configurationDshotBeaconHelp')">
                        <SettingRow
                            :label="$t('configurationDshotBeaconTone')"
                            :help="$t('configurationUseDshotBeeper')"
                        >
                            <USelect
                                v-model="dshotBeaconTone"
                                class="min-w-24"
                                :items="[
                                    { label: $t('portsTelemetryDisabled'), value: 0 },
                                    ...[1, 2, 3, 4, 5].map((i) => ({ label: String(i), value: i })),
                                ]"
                            />
                        </SettingRow>
                        <div class="flex gap-2">
                            <UButton :label="$t('configurationBeeperEnableAll')" @click="enableAllDshot" size="xs" />
                            <UButton :label="$t('configurationBeeperDisableAll')" @click="disableAllDshot" size="xs" />
                        </div>
                        <SettingRow v-for="cond in dshotBeaconConditionsList" :key="cond.bit" fullWidth>
                            <USwitch
                                :model-value="isDshotConditionEnabled(cond)"
                                @update:model-value="(checked) => toggleDshotCondition(cond, checked)"
                            />
                            <template #label>
                                <span class="w-20 shrink-0 font-bold text-xs leading-snug">{{ cond.name }}</span>
                                <span
                                    class="min-w-0 flex-1 text-xs leading-snug"
                                    v-html="$t('beeper' + cond.name)"
                                ></span>
                            </template>
                        </SettingRow>
                    </UiBox>
                </div>

                <div class="col-span-1">
                    <!-- BEEPER CONFIGURATION -->
                    <UiBox :title="$t('configurationBeeper')">
                        <div class="flex gap-2">
                            <UButton :label="$t('configurationBeeperEnableAll')" @click="enableAllBeepers" size="xs" />
                            <UButton
                                :label="$t('configurationBeeperDisableAll')"
                                @click="disableAllBeepers"
                                size="xs"
                            />
                        </div>
                        <SettingRow
                            v-for="beeper in beepersList"
                            :key="beeper.bit"
                            v-show="beeper.visible !== false"
                            fullWidth
                        >
                            <USwitch
                                :model-value="isBeeperEnabled(beeper)"
                                @update:model-value="(checked) => toggleBeeper(beeper, checked)"
                            />
                            <template #label>
                                <span class="w-48 shrink-0 font-bold text-xs leading-snug">{{ beeper.name }}</span>
                                <span
                                    class="min-w-0 flex-1 text-xs leading-snug"
                                    v-html="$t('beeper' + beeper.name)"
                                ></span>
                            </template>
                        </SettingRow>
                    </UiBox>
                </div>
            </div>
        </div>
        <div class="content_toolbar toolbar_fixed_bottom">
            <UButton :label="$t('configurationButtonSave')" :loading="isSaving" @click="saveConfig" />
        </div>
    </div>
</template>

<script>
import { defineComponent, ref, reactive, onMounted, computed, nextTick, onUnmounted } from "vue";
import { useNavigationStore } from "@/stores/navigation";
import { useFlightControllerStore } from "@/stores/fc";
import { useReboot } from "@/composables/useReboot";
import GUI from "../../js/gui";
import MSP from "../../js/msp";
import MSPCodes from "../../js/msp/MSPCodes";
import { mspHelper } from "../../js/msp/MSPHelper.js";
import { gui_log } from "../../js/gui_log";
import { i18n } from "../../js/localization";
import semver from "semver";
import { API_VERSION_1_45, API_VERSION_1_46 } from "../../js/data_storage";
import { bit_check, bit_set, bit_clear } from "../../js/bit";
import { updateTabList } from "../../js/utils/updateTabList";
import WikiButton from "../elements/WikiButton.vue";
import UiBox from "../elements/UiBox.vue";
import SettingRow from "../elements/SettingRow.vue";

export default defineComponent({
    name: "ConfigurationTab",
    components: {
        WikiButton,
        UiBox,
        SettingRow,
    },
    setup() {
        // Reactive State
        const navigationStore = useNavigationStore();
        const fcStore = useFlightControllerStore();
        const { reboot } = useReboot();

        const pidAdvancedConfig = reactive({
            pid_process_denom: 1,
        });

        const fpvCamAngleDegrees = ref(0);

        const craftName = ref("");
        const pilotName = ref("");
        const showPilotName = ref(false);

        const isSaving = ref(false);
        const isMounted = ref(true);

        onUnmounted(() => {
            isMounted.value = false;
        });

        const armingConfig = reactive({
            small_angle: 25,
            gyro_cal_on_first_arm_bool: false,
            auto_disarm_delay: 0,
        });

        const showGyroCalOnFirstArm = ref(false);

        // Other Features & Beepers State wrapper
        const featuresList = computed(() => {
            if (!fcStore.features?.features?._features) {
                return [];
            }
            return fcStore.features.features._features.filter((feature) => {
                return feature.mode !== "select" && feature.group === "other";
            });
        });

        const MOTOR_STOP_FEATURE_BIT = 4;
        const motorStopFeatureBit = computed(() => {
            return featuresList.value.find((feature) => feature.name === "MOTOR_STOP")?.bit ?? MOTOR_STOP_FEATURE_BIT;
        });

        const beepersList = computed(() => {
            if (!fcStore.beepers?.beepers?._beepers) {
                return [];
            }
            return fcStore.beepers.beepers._beepers;
        });

        const dshotBeaconConditionsList = computed(() => {
            if (!fcStore.beepers?.dshotBeaconConditions?._beepers) {
                return [];
            }
            return fcStore.beepers.dshotBeaconConditions._beepers;
        });

        const dshotBeaconTone = ref(0); // 0 = disabled
        const beeperDisabledMask = ref(0);
        const dshotDisabledMask = ref(0);

        const syncBeeperStateFromStore = () => {
            if (!fcStore.beepers) {
                return;
            }

            if (fcStore.beepers.dshotBeaconTone != null) {
                dshotBeaconTone.value = fcStore.beepers.dshotBeaconTone;
            }

            if (fcStore.beepers.beepers) {
                beeperDisabledMask.value = fcStore.beepers.beepers._beeperDisabledMask;
            }

            if (fcStore.beepers.dshotBeaconConditions) {
                dshotDisabledMask.value = fcStore.beepers.dshotBeaconConditions._beeperDisabledMask;
            }
        };

        const featureMask = computed(() => {
            if (!fcStore.features?.features) {
                return 0;
            }
            return fcStore.features.features._featureMask;
        });

        const showAutoDisarmDelay = computed(() => {
            if (!fcStore.config?.apiVersion || semver.lt(fcStore.config.apiVersion, API_VERSION_1_46)) {
                return false;
            }
            return bit_check(featureMask.value, motorStopFeatureBit.value);
        });

        // Methods for toggling bits
        const isFeatureEnabled = (feature) => {
            if (!fcStore.features?.features) {
                return false;
            }
            return bit_check(fcStore.features.features._featureMask, feature.bit);
        };

        const toggleFeature = (feature, checked) => {
            if (!fcStore.features?.features) {
                return;
            }
            if (checked) {
                fcStore.features.features._featureMask = bit_set(fcStore.features.features._featureMask, feature.bit);
            } else {
                fcStore.features.features._featureMask = bit_clear(fcStore.features.features._featureMask, feature.bit);
            }
            updateTabList(fcStore.features.features);
        };

        const isBeeperEnabled = (beeper) => {
            if (!fcStore.beepers?.beepers) {
                return false;
            }
            // Note: Beeper logic uses DisabledMask, so checked means NOT disabled
            return !bit_check(beeperDisabledMask.value, beeper.bit);
        };

        const toggleBeeper = (beeper, checked) => {
            if (!fcStore.beepers?.beepers) {
                return;
            }
            if (checked) {
                // To enable, we CLEAR the disabled bit
                beeperDisabledMask.value = bit_clear(beeperDisabledMask.value, beeper.bit);
            } else {
                // To disable, we SET the disabled bit
                beeperDisabledMask.value = bit_set(beeperDisabledMask.value, beeper.bit);
            }
            fcStore.beepers.beepers._beeperDisabledMask = beeperDisabledMask.value;
        };

        const enableAllBeepers = () => {
            if (!fcStore.beepers?.beepers) {
                return;
            }
            let mask = beeperDisabledMask.value;
            beepersList.value.forEach((beeper) => {
                if (beeper.visible !== false) {
                    mask = bit_clear(mask, beeper.bit);
                }
            });
            beeperDisabledMask.value = mask;
            fcStore.beepers.beepers._beeperDisabledMask = mask;
        };

        const disableAllBeepers = () => {
            if (!fcStore.beepers?.beepers) {
                return;
            }
            let mask = beeperDisabledMask.value;
            beepersList.value.forEach((beeper) => {
                if (beeper.visible !== false) {
                    mask = bit_set(mask, beeper.bit);
                }
            });
            beeperDisabledMask.value = mask;
            fcStore.beepers.beepers._beeperDisabledMask = mask;
        };

        const isDshotConditionEnabled = (cond) => {
            if (!fcStore.beepers?.dshotBeaconConditions) {
                return false;
            }
            // Same logic as beepers (DisabledMask)
            return !bit_check(dshotDisabledMask.value, cond.bit);
        };

        const toggleDshotCondition = (cond, checked) => {
            if (!fcStore.beepers?.dshotBeaconConditions) {
                return;
            }
            if (checked) {
                dshotDisabledMask.value = bit_clear(dshotDisabledMask.value, cond.bit);
            } else {
                dshotDisabledMask.value = bit_set(dshotDisabledMask.value, cond.bit);
            }
            fcStore.beepers.dshotBeaconConditions._beeperDisabledMask = dshotDisabledMask.value;
        };

        const enableAllDshot = () => {
            if (!fcStore.beepers?.dshotBeaconConditions) {
                return;
            }
            let mask = dshotDisabledMask.value;
            dshotBeaconConditionsList.value.forEach((cond) => {
                mask = bit_clear(mask, cond.bit);
            });
            dshotDisabledMask.value = mask;
            fcStore.beepers.dshotBeaconConditions._beeperDisabledMask = mask;
        };

        const disableAllDshot = () => {
            if (!fcStore.beepers?.dshotBeaconConditions) {
                return;
            }
            let mask = dshotDisabledMask.value;
            dshotBeaconConditionsList.value.forEach((cond) => {
                mask = bit_set(mask, cond.bit);
            });
            dshotDisabledMask.value = mask;
            fcStore.beepers.dshotBeaconConditions._beeperDisabledMask = mask;
        };

        // Read-only: acc hardware state from store (toggle moved to SensorConfigTab)
        const accHardwareEnabled = computed(() => fcStore.sensorConfig.acc_hardware !== 1);

        const gyroFrequencyDisplay = ref("");
        const pidDenomOptions = ref([]);

        // Loading Logic
        const loadConfig = async () => {
            try {
                if (!isMounted.value) return;
                await MSP.promise(MSPCodes.MSP_FEATURE_CONFIG);
                await MSP.promise(MSPCodes.MSP_BEEPER_CONFIG);
                await MSP.promise(MSPCodes.MSP_ARMING_CONFIG);
                await MSP.promise(MSPCodes.MSP_SENSOR_CONFIG);

                if (!isMounted.value) return;

                if (semver.lt(fcStore.config.apiVersion, API_VERSION_1_45)) {
                    await MSP.promise(MSPCodes.MSP_NAME);
                }

                if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_45)) {
                    await MSP.promise(
                        MSPCodes.MSP2_GET_TEXT,
                        mspHelper.crunch(MSPCodes.MSP2_GET_TEXT, MSPCodes.CRAFT_NAME),
                    );
                }

                await MSP.promise(MSPCodes.MSP_RX_CONFIG);

                if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_45)) {
                    await MSP.promise(
                        MSPCodes.MSP2_GET_TEXT,
                        mspHelper.crunch(MSPCodes.MSP2_GET_TEXT, MSPCodes.PILOT_NAME),
                    );
                }

                if (!isMounted.value) return;

                await MSP.promise(MSPCodes.MSP_ADVANCED_CONFIG);

                if (!isMounted.value) return;

                await initializeUI();
                await nextTick();
                GUI.content_ready();
            } catch (e) {
                console.error("Failed to load configuration", e);
                GUI.content_ready();
            }
        };

        const initializeUI = async () => {
            // Keep beeper state synced even if later async setup fails.
            syncBeeperStateFromStore();

            // Populate Reactive State
            pidAdvancedConfig.pid_process_denom = fcStore.pidAdvancedConfig.pid_process_denom;

            fpvCamAngleDegrees.value = fcStore.rxConfig.fpvCamAngleDegrees;

            if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_45)) {
                craftName.value = fcStore.config.craftName;
                pilotName.value = fcStore.config.pilotName;
                showPilotName.value = true;
            } else {
                craftName.value = fcStore.config.name;
                showPilotName.value = false;
            }

            // Gyro Frequency Logic
            updateGyroDenom(fcStore.config.sampleRateHz);

            updatePidDenomOptions();

            // Arming Config
            armingConfig.small_angle = fcStore.armingConfig.small_angle;

            if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_46)) {
                showGyroCalOnFirstArm.value = true;
                armingConfig.gyro_cal_on_first_arm_bool = fcStore.armingConfig.gyro_cal_on_first_arm === 1;
                armingConfig.auto_disarm_delay = fcStore.armingConfig.auto_disarm_delay;
            }
        };

        const updateGyroDenom = (gyroFrequency) => {
            // Mirror legacy updateGyroDenomReadOnly
            if (gyroFrequency === 0) {
                gyroFrequencyDisplay.value = i18n.getMessage("configurationSpeedGyroNoGyro");
            } else {
                gyroFrequencyDisplay.value = i18n.getMessage("configurationKHzUnitLabel", {
                    value: (gyroFrequency / 1000).toFixed(2),
                });
            }
        };

        const updatePidDenomOptions = () => {
            // Mirror legacy logic
            const pidBaseFreq = fcStore.config.sampleRateHz / 1000;
            const MAX_DENOM = 8;
            const options = [];

            for (let denom = 1; denom <= MAX_DENOM; denom++) {
                let text;
                if (pidBaseFreq === 0) {
                    text = i18n.getMessage("configurationSpeedPidNoGyro", { value: denom });
                } else {
                    text = i18n.getMessage("configurationKHzUnitLabel", {
                        value: (pidBaseFreq / denom).toFixed(2),
                    });
                }
                options.push({ value: denom, label: text });
            }
            pidDenomOptions.value = options;
        };

        const saveConfig = async () => {
            if (isSaving.value) {
                return;
            }
            isSaving.value = true;
            try {
                fcStore.pidAdvancedConfig.pid_process_denom = pidAdvancedConfig.pid_process_denom;

                fcStore.rxConfig.fpvCamAngleDegrees = fpvCamAngleDegrees.value;

                if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_45)) {
                    fcStore.config.craftName = craftName.value;
                    fcStore.config.pilotName = pilotName.value;
                } else {
                    fcStore.config.name = craftName.value;
                }

                if (fcStore.beepers) {
                    fcStore.beepers.dshotBeaconTone = dshotBeaconTone.value;
                }

                fcStore.armingConfig.small_angle = armingConfig.small_angle;
                if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_46)) {
                    fcStore.armingConfig.gyro_cal_on_first_arm = armingConfig.gyro_cal_on_first_arm_bool ? 1 : 0;
                    fcStore.armingConfig.auto_disarm_delay = armingConfig.auto_disarm_delay;
                }

                // Send MSP commands
                await MSP.promise(MSPCodes.MSP_SET_FEATURE_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_FEATURE_CONFIG));

                if (fcStore.beepers) {
                    await MSP.promise(MSPCodes.MSP_SET_BEEPER_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_BEEPER_CONFIG));
                }

                await MSP.promise(MSPCodes.MSP_SET_ARMING_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_ARMING_CONFIG));

                if (semver.lt(fcStore.config.apiVersion, API_VERSION_1_45)) {
                    await MSP.promise(MSPCodes.MSP_SET_NAME, mspHelper.crunch(MSPCodes.MSP_SET_NAME));
                } else {
                    await MSP.promise(
                        MSPCodes.MSP2_SET_TEXT,
                        mspHelper.crunch(MSPCodes.MSP2_SET_TEXT, MSPCodes.CRAFT_NAME),
                    );
                    await MSP.promise(
                        MSPCodes.MSP2_SET_TEXT,
                        mspHelper.crunch(MSPCodes.MSP2_SET_TEXT, MSPCodes.PILOT_NAME),
                    );
                }

                await MSP.promise(MSPCodes.MSP_SET_RX_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_RX_CONFIG));
                await MSP.promise(MSPCodes.MSP_SET_ADVANCED_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_ADVANCED_CONFIG));

                gui_log(i18n.getMessage("configurationSaved"));

                // Save to EEPROM and Reboot
                await new Promise((resolve) => {
                    mspHelper.writeConfiguration(false, () => {
                        navigationStore.cleanup(() => {
                            reboot();
                            resolve();
                        });
                    });
                });
            } catch (e) {
                console.error("Failed to save configuration", e);
                gui_log(i18n.getMessage("configurationSaveFailed"));
            } finally {
                isSaving.value = false;
            }
        };

        onMounted(() => {
            loadConfig();
        });

        return {
            pidAdvancedConfig,
            accHardwareEnabled,
            enableAllDshot,
            disableAllDshot,
            gyroFrequencyDisplay,
            pidDenomOptions,
            fpvCamAngleDegrees,
            craftName,
            pilotName,
            showPilotName,
            featuresList,
            beepersList,
            dshotBeaconConditionsList,
            dshotBeaconTone,
            isFeatureEnabled,
            toggleFeature,
            isBeeperEnabled,
            toggleBeeper,
            enableAllBeepers,
            disableAllBeepers,
            isDshotConditionEnabled,
            toggleDshotCondition,
            armingConfig,
            showGyroCalOnFirstArm,
            showAutoDisarmDelay,
            isSaving,
            saveConfig,
        };
    },
});
</script>

<style lang="less">
.tab-configuration {
    @media all and (max-width: 575px) {
        .grid-box {
            &.col2 {
                grid-template-columns: 1fr !important;
            }
        }
    }
}
</style>
