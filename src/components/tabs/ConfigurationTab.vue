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
                        <SettingRow :label="$t('configurationAccHardware')">
                            <USwitch v-model="accHardwareEnabled" />
                        </SettingRow>
                        <SettingRow :label="$t('configurationBaroHardware')">
                            <USwitch v-model="baroHardwareEnabled" />
                        </SettingRow>
                        <SettingRow :label="$t('configurationMagHardware')">
                            <USwitch v-model="magHardwareEnabled" />
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
                </div>

                <div class="col-span-1">
                    <!-- BOARD ALIGNMENT -->
                    <UiBox :title="$t('configurationBoardAlignment')" :help="$t('configurationBoardAlignmentHelp')">
                        <div class="flex gap-4 justify-between">
                            <SettingColumn :label="$t('configurationBoardAlignmentRoll')">
                                <template v-slot:label>
                                    <div class="alignicon roll"></div>
                                </template>
                                <UInputNumber
                                    v-model="boardAlignment.roll"
                                    :step="1"
                                    :min="-180"
                                    :max="360"
                                    orientation="vertical"
                                    size="xs"
                                    class="w-16"
                                />
                            </SettingColumn>
                            <SettingColumn :label="$t('configurationBoardAlignmentPitch')">
                                <template v-slot:label>
                                    <div class="alignicon pitch"></div>
                                </template>
                                <UInputNumber
                                    v-model="boardAlignment.pitch"
                                    :step="1"
                                    :min="-180"
                                    :max="360"
                                    orientation="vertical"
                                    size="xs"
                                    class="w-16"
                                />
                            </SettingColumn>
                            <SettingColumn :label="$t('configurationBoardAlignmentYaw')">
                                <template v-slot:label>
                                    <div class="alignicon yaw"></div>
                                </template>
                                <UInputNumber
                                    v-model="boardAlignment.yaw"
                                    :step="1"
                                    :min="-180"
                                    :max="360"
                                    orientation="vertical"
                                    size="xs"
                                    class="w-16"
                                />
                            </SettingColumn>
                        </div>
                    </UiBox>

                    <!-- NEW MULTI-GYRO ALIGNMENT (API 1.47+) -->
                    <UiBox
                        :title="$t('configurationGyroActiveIMU')"
                        :help="$t('configurationGyroActiveIMUHelp')"
                        v-if="showMultiGyro"
                    >
                        <SettingRow v-for="gyro in gyroList" :key="gyro.index" fullWidth :label="getGyroLabel(gyro)">
                            <USwitch
                                :model-value="gyro.enabled"
                                @update:model-value="(checked) => toggleGyro(gyro.index, checked)"
                            />
                        </SettingRow>
                    </UiBox>

                    <!-- GYRO ALIGNMENT (Legacy) -->
                    <UiBox
                        v-if="showSensorAlignment"
                        :title="$t('configurationActiveImu')"
                        :help="$t('configurationGyroAlignmentHelp')"
                    >
                        <div class="grid-row grid-box col2 gap-2">
                            <div class="col-span-1 flex flex-col gap-2">
                                <SettingColumn v-if="showGyroToUse" :label="$t('configurationSensorGyroToUse')">
                                    <USelect
                                        v-model="sensorAlignment.gyro_to_use"
                                        :items="gyroToUseSelectItems"
                                        class="min-w-40"
                                    />
                                </SettingColumn>
                            </div>
                            <div class="col-span-1 flex flex-col gap-2">
                                <SettingColumn v-if="showGyro1Align" :label="$t('configurationSensorAlignmentGyro1')">
                                    <USelect
                                        v-model="sensorAlignment.gyro_1_align"
                                        :items="gyroAlignSelectItems"
                                        class="min-w-40"
                                    />
                                </SettingColumn>

                                <SettingColumn v-if="showGyro2Align" :label="$t('configurationSensorAlignmentGyro2')">
                                    <USelect
                                        v-model="sensorAlignment.gyro_2_align"
                                        :items="gyroAlignSelectItems"
                                        class="min-w-40"
                                    />
                                </SettingColumn>
                            </div>
                        </div>

                        <div
                            v-if="showGyro1Align && sensorAlignment.gyro_1_align === 9"
                            class="flex gap-4 justify-between flex-wrap w-full"
                        >
                            <SettingColumn :label="$t('configurationGyro1AlignmentRoll')">
                                <template #label>
                                    <div class="alignicon roll"></div>
                                </template>
                                <UInputNumber
                                    v-model="sensorAlignment.gyro_1_align_roll"
                                    :step="0.1"
                                    :min="-180"
                                    :max="360"
                                    :aria-label="$t('configurationGyro1AlignmentRoll')"
                                    orientation="vertical"
                                    size="xs"
                                    class="w-16"
                                />
                            </SettingColumn>
                            <SettingColumn :label="$t('configurationGyro1AlignmentPitch')">
                                <template #label>
                                    <div class="alignicon pitch"></div>
                                </template>
                                <UInputNumber
                                    v-model="sensorAlignment.gyro_1_align_pitch"
                                    :step="0.1"
                                    :min="-180"
                                    :max="360"
                                    :aria-label="$t('configurationGyro1AlignmentPitch')"
                                    orientation="vertical"
                                    size="xs"
                                    class="w-16"
                                />
                            </SettingColumn>
                            <SettingColumn :label="$t('configurationGyro1AlignmentYaw')">
                                <template #label>
                                    <div class="alignicon yaw"></div>
                                </template>
                                <UInputNumber
                                    v-model="sensorAlignment.gyro_1_align_yaw"
                                    :step="0.1"
                                    :min="-180"
                                    :max="360"
                                    :aria-label="$t('configurationGyro1AlignmentYaw')"
                                    orientation="vertical"
                                    size="xs"
                                    class="w-16"
                                />
                            </SettingColumn>
                        </div>

                        <div
                            v-if="showGyro2Align && sensorAlignment.gyro_2_align === 9"
                            class="flex gap-4 justify-between flex-wrap w-full"
                        >
                            <SettingColumn :label="$t('configurationGyro2AlignmentRoll')">
                                <template #label>
                                    <div class="alignicon roll"></div>
                                </template>
                                <UInputNumber
                                    v-model="sensorAlignment.gyro_2_align_roll"
                                    :step="0.1"
                                    :min="-180"
                                    :max="360"
                                    :aria-label="$t('configurationGyro2AlignmentRoll')"
                                    orientation="vertical"
                                    size="xs"
                                    class="w-16"
                                />
                            </SettingColumn>
                            <SettingColumn :label="$t('configurationGyro2AlignmentPitch')">
                                <template #label>
                                    <div class="alignicon pitch"></div>
                                </template>
                                <UInputNumber
                                    v-model="sensorAlignment.gyro_2_align_pitch"
                                    :step="0.1"
                                    :min="-180"
                                    :max="360"
                                    :aria-label="$t('configurationGyro2AlignmentPitch')"
                                    orientation="vertical"
                                    size="xs"
                                    class="w-16"
                                />
                            </SettingColumn>
                            <SettingColumn :label="$t('configurationGyro2AlignmentYaw')">
                                <template #label>
                                    <div class="alignicon yaw"></div>
                                </template>
                                <UInputNumber
                                    v-model="sensorAlignment.gyro_2_align_yaw"
                                    :step="0.1"
                                    :min="-180"
                                    :max="360"
                                    :aria-label="$t('configurationGyro2AlignmentYaw')"
                                    orientation="vertical"
                                    size="xs"
                                    class="w-16"
                                />
                            </SettingColumn>
                        </div>
                    </UiBox>

                    <!-- MAGNETOMETER ALIGNMENT -->
                    <UiBox
                        v-if="showMagAlign"
                        :title="$t('configurationMagAlignment')"
                        :help="$t('configurationMagAlignmentHelp')"
                    >
                        <SettingRow fullWidth>
                            <USelect
                                v-model="sensorAlignment.align_mag"
                                :items="gyroAlignSelectItems"
                                class="min-w-40"
                                :aria-label="$t('configurationMagAlignment')"
                            />
                        </SettingRow>

                        <div v-if="sensorAlignment.align_mag === 9" class="flex gap-4 justify-between flex-wrap w-full">
                            <SettingColumn :label="$t('configurationMagAlignmentRoll')">
                                <template #label>
                                    <div class="alignicon roll"></div>
                                </template>
                                <UInputNumber
                                    v-model="sensorAlignment.mag_align_roll"
                                    :step="0.1"
                                    :min="-180"
                                    :max="360"
                                    :aria-label="$t('configurationMagAlignmentRoll')"
                                    orientation="vertical"
                                    size="xs"
                                    class="w-16"
                                />
                            </SettingColumn>
                            <SettingColumn :label="$t('configurationMagAlignmentPitch')">
                                <template #label>
                                    <div class="alignicon pitch"></div>
                                </template>
                                <UInputNumber
                                    v-model="sensorAlignment.mag_align_pitch"
                                    :step="0.1"
                                    :min="-180"
                                    :max="360"
                                    :aria-label="$t('configurationMagAlignmentPitch')"
                                    orientation="vertical"
                                    size="xs"
                                    class="w-16"
                                />
                            </SettingColumn>
                            <SettingColumn :label="$t('configurationMagAlignmentYaw')">
                                <template #label>
                                    <div class="alignicon yaw"></div>
                                </template>
                                <UInputNumber
                                    v-model="sensorAlignment.mag_align_yaw"
                                    :step="0.1"
                                    :min="-180"
                                    :max="360"
                                    :aria-label="$t('configurationMagAlignmentYaw')"
                                    orientation="vertical"
                                    size="xs"
                                    class="w-16"
                                />
                            </SettingColumn>
                        </div>
                    </UiBox>

                    <!-- OTHER SENSORS -->
                    <UiBox
                        v-if="showOtherSensors"
                        :title="$t('configurationSensors')"
                        :help="$t('configurationSensorsHelp')"
                    >
                        <SettingRow
                            v-if="showMagDeclination"
                            :label="$t('configurationMagDeclination')"
                            :help="$t('configurationMagDeclinationHelp')"
                        >
                            <UInputNumber
                                v-model="magDeclination"
                                :step="0.1"
                                :min="-180"
                                :max="180"
                                orientation="vertical"
                                size="xs"
                                class="w-16"
                            />
                        </SettingRow>
                        <SettingRow
                            v-if="showRangefinder"
                            :label="$t('configurationRangefinder')"
                            :help="$t('configurationRangefinderHelp')"
                        >
                            <USelect
                                v-model="sensorConfig.sonar_hardware"
                                :items="sonarTypesList.map((label, idx) => ({ label, value: idx }))"
                                class="min-w-40"
                            />
                        </SettingRow>
                        <SettingRow
                            v-if="showOpticalFlow"
                            :label="$t('configurationOpticalflow')"
                            :help="$t('configurationOpticalflowHelp')"
                        >
                            <USelect
                                v-model="sensorConfig.opticalflow_hardware"
                                :items="opticalFlowTypesList.map((label, idx) => ({ label, value: idx }))"
                                class="min-w-40"
                            />
                        </SettingRow>
                    </UiBox>

                    <!-- ACCELEROMETER TRIM -->
                    <UiBox :title="$t('configurationAccelTrims')">
                        <SettingRow :label="$t('configurationAccelTrimRoll')">
                            <UInputNumber
                                v-model="accelTrims.roll"
                                :step="1"
                                :min="-300"
                                :max="300"
                                orientation="vertical"
                                size="xs"
                                class="w-16"
                            />
                        </SettingRow>
                        <SettingRow :label="$t('configurationAccelTrimPitch')">
                            <UInputNumber
                                v-model="accelTrims.pitch"
                                :step="1"
                                :min="-300"
                                :max="300"
                                orientation="vertical"
                                size="xs"
                                class="w-16"
                            />
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
            <UButton :label="$t('configurationButtonSave')" @click="saveConfig" />
        </div>
    </div>
</template>

<script>
import { defineComponent, ref, reactive, onMounted, computed, nextTick, watch, onUnmounted } from "vue";
import { useNavigationStore } from "@/stores/navigation";
import { useFlightControllerStore } from "@/stores/fc";
import { useReboot } from "@/composables/useReboot";
import GUI from "../../js/gui";
import MSP from "../../js/msp";
import MSPCodes from "../../js/msp/MSPCodes";
import { mspHelper } from "../../js/msp/MSPHelper.js";
import { gui_log } from "../../js/gui_log";
import { i18n } from "../../js/localization";
import { sensorTypes } from "../../js/sensor_types"; // Import for dropdown lists
import { have_sensor } from "../../js/sensor_helpers";
import semver from "semver";
import { API_VERSION_1_45, API_VERSION_1_46, API_VERSION_1_47 } from "../../js/data_storage";
import { bit_check, bit_set, bit_clear } from "../../js/bit";
import { updateTabList } from "../../js/utils/updateTabList";
import WikiButton from "../elements/WikiButton.vue";
import UiBox from "../elements/UiBox.vue";
import SettingRow from "../elements/SettingRow.vue";
import SettingColumn from "../elements/SettingColumn.vue";

export default defineComponent({
    name: "ConfigurationTab",
    components: {
        WikiButton,
        UiBox,
        SettingRow,
        SettingColumn,
    },
    setup() {
        // Reactive State
        const navigationStore = useNavigationStore();
        const fcStore = useFlightControllerStore();
        const { reboot } = useReboot();

        // Helper to perform reboot after save
        const performReboot = () => {
            reboot();
        };

        const pidAdvancedConfig = reactive({
            pid_process_denom: 1,
        });

        const sensorConfig = reactive({
            acc_hardware: 0,
            baro_hardware: 0,
            mag_hardware: 0,
            sonar_hardware: 0,
            opticalflow_hardware: 0,
        });

        const boardAlignment = reactive({
            roll: 0,
            pitch: 0,
            yaw: 0,
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

        const accelTrims = reactive({
            roll: 0,
            pitch: 0,
        });

        const sensorAlignment = reactive({
            gyro_to_use: 0,
            gyro_1_align: 0,
            gyro_2_align: 0,
            align_mag: 0,
            mag_align_roll: 0,
            mag_align_pitch: 0,
            mag_align_yaw: 0,
            gyro_1_align_roll: 0,
            gyro_1_align_pitch: 0,
            gyro_1_align_yaw: 0,
            gyro_2_align_roll: 0,
            gyro_2_align_pitch: 0,
            gyro_2_align_yaw: 0,

            gyro_align: [], // API 1.47+
            gyro_enable_mask: 0, // API 1.47+
            gyro_align_roll: [], // API 1.47+
            gyro_align_pitch: [], // API 1.47+
            gyro_align_yaw: [], // API 1.47+
        });

        const magDeclination = ref(0);
        const showGyroCalOnFirstArm = ref(false);
        const hasSecondGyro = ref(false);
        const hasDualGyros = ref(false);
        const showMultiGyro = ref(false); // API 1.47+ multi-gyro UI

        // Sensor types - populated asynchronously
        const sensorTypesData = ref(null);

        const gyroList = computed(() => {
            if (!showMultiGyro.value) return [];

            const types = sensorTypesData.value?.gyro.elements || [];
            const detectedHardware = fcStore.gyroSensor?.gyro_hardware || [];

            // Use actual detected hardware count
            const count = detectedHardware.length;
            if (count === 0) return [];

            const gyros = [];
            for (let i = 0; i < count; i++) {
                const hardwareResult = detectedHardware[i];
                let hardwareName;

                if (
                    hardwareResult === undefined ||
                    types[hardwareResult] === "AUTO" ||
                    types[hardwareResult] === "NONE" ||
                    types[hardwareResult] === "DEFAULT"
                ) {
                    continue;
                }

                hardwareName = types[hardwareResult];

                gyros.push({
                    index: i,
                    name: hardwareName,
                    enabled: bit_check(sensorAlignment.gyro_enable_mask, i),
                });
            }
            return gyros;
        });

        const getGyroLabel = (gyro) => {
            return gyro.name || `Gyro #${gyro.index + 1}`;
        };

        const toggleGyro = (index, enabled) => {
            if (enabled) {
                sensorAlignment.gyro_enable_mask = bit_set(sensorAlignment.gyro_enable_mask, index);
            } else {
                const nextMask = bit_clear(sensorAlignment.gyro_enable_mask, index);

                // Enforce: at least one gyro must remain enabled on API >= 1.47
                if (
                    nextMask === 0 &&
                    fcStore.config?.apiVersion &&
                    semver.gte(fcStore.config.apiVersion, API_VERSION_1_47)
                ) {
                    gui_log(i18n.getMessage("configurationGyroRequired"));
                    // Mask unchanged; gyroList still reports enabled, so the switch stays on.
                    return;
                }

                sensorAlignment.gyro_enable_mask = nextMask;
            }
        };

        const updateGyroAlign = (index, value) => {
            // Vue reactivity caveat with arrays:
            // sensorAlignment.gyro_align[index] = value;
            // Should verify if this triggers update, if not we might need to splice or recreate array
            if (sensorAlignment.gyro_align) {
                sensorAlignment.gyro_align[index] = value;
            }
        };

        const showGyro1Align = ref(false);
        const showGyro2Align = ref(false);
        const showMagAlign = ref(false);
        const showMagDeclination = ref(false);
        const showRangefinder = ref(false);
        const showGyroToUse = computed(() => {
            return fcStore.config?.apiVersion && semver.lt(fcStore.config.apiVersion, API_VERSION_1_47);
        });
        const showOpticalFlow = ref(false);

        // This section contains gyro alignment dropdowns (API < 1.47) and mag alignment (API >= 1.47)
        const showSensorAlignment = computed(() => {
            // Show Active IMU box if:
            // 1. Gyro selection is available (showGyroToUse)
            // 2. OR Legacy Gyro Alignment is available (showGyro1/2Align)
            // 3. OR (Implicitly) Custom Gyro Inputs are desired (we default to showing this box for Gyro configs)
            return showGyroToUse.value || showGyro1Align.value || showGyro2Align.value;
        });
        const showOtherSensors = computed(() => {
            return showMagDeclination.value || showRangefinder.value || showOpticalFlow.value;
        });
        const sonarTypesList = ref([]);
        const opticalFlowTypesList = ref([]);
        const sensorAlignments = ref([
            "CW 0°",
            "CW 90°",
            "CW 180°",
            "CW 270°",
            "CW 0° flip",
            "CW 90° flip",
            "CW 180° flip",
            "CW 270° flip",
            i18n.getMessage("configurationSensorAlignmentCustom"),
        ]);

        const gyroToUseSelectItems = computed(() => {
            const items = [{ label: i18n.getMessage("configurationSensorGyroToUseFirst"), value: 0 }];
            if (hasSecondGyro.value) {
                items.push({ label: i18n.getMessage("configurationSensorGyroToUseSecond"), value: 1 });
            }
            if (hasDualGyros.value) {
                items.push({ label: i18n.getMessage("configurationSensorGyroToUseBoth"), value: 2 });
            }
            return items;
        });

        const gyroAlignSelectItems = computed(() => {
            const items = [{ label: i18n.getMessage("configurationSensorAlignmentDefaultOption"), value: 0 }];
            sensorAlignments.value.forEach((label, idx) => {
                items.push({ label, value: idx + 1 });
            });
            return items;
        });

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

        // Computed Wrappers for Hardware Switches (logic inverted: 1 = disabled usually? legacy says: !== 1)
        // Legacy: accHardwareSwitch.prop("checked", FC.SENSOR_CONFIG.acc_hardware !== 1);
        // So 1 is None/Disabled?
        const accHardwareEnabled = computed({
            get: () => sensorConfig.acc_hardware !== 1,
            set: (val) => {
                sensorConfig.acc_hardware = val ? 0 : 1;
            }, // Assuming 0 is Default/Auto
        });

        const baroHardwareEnabled = computed({
            get: () => sensorConfig.baro_hardware !== 1,
            set: (val) => {
                sensorConfig.baro_hardware = val ? 0 : 1;
            },
        });

        const magHardwareEnabled = computed({
            get: () => sensorConfig.mag_hardware !== 1,
            set: (val) => {
                sensorConfig.mag_hardware = val ? 0 : 1;
            },
        });

        const gyroFrequencyDisplay = ref("");
        const pidDenomOptions = ref([]);

        // Loading Logic
        const loadConfig = async () => {
            try {
                if (!isMounted.value) return;
                await Promise.resolve(); // Start chain
                await MSP.promise(MSPCodes.MSP_FEATURE_CONFIG);
                await MSP.promise(MSPCodes.MSP_BEEPER_CONFIG);
                await MSP.promise(MSPCodes.MSP_BOARD_ALIGNMENT_CONFIG);
                await MSP.promise(MSPCodes.MSP_ACC_TRIM);
                await MSP.promise(MSPCodes.MSP_ARMING_CONFIG);
                await MSP.promise(MSPCodes.MSP_RC_DEADBAND);
                await MSP.promise(MSPCodes.MSP_SENSOR_CONFIG);
                await MSP.promise(MSPCodes.MSP_SENSOR_ALIGNMENT);

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

                if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_46)) {
                    await MSP.promise(MSPCodes.MSP_COMPASS_CONFIG);
                }

                if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_47)) {
                    await MSP.promise(MSPCodes.MSP2_GYRO_SENSOR);
                }

                if (!isMounted.value) return;

                await initializeUI();
                await nextTick();
                GUI.switchery();
                GUI.content_ready();
            } catch (e) {
                console.error("Failed to load configuration", e);
                GUI.content_ready();
            }
        };

        const initializeUI = async () => {
            // Keep beeper state synced even if later async setup fails.
            syncBeeperStateFromStore();

            // Sensor list lookup can fail on some FC/API combinations; continue with defaults.
            try {
                sensorTypesData.value = await sensorTypes();
            } catch (error) {
                sensorTypesData.value = null;
                console.warn("Failed to load sensor types", error);
            }

            // Populate Reactive State
            pidAdvancedConfig.pid_process_denom = fcStore.pidAdvancedConfig.pid_process_denom;

            sensorConfig.acc_hardware = fcStore.sensorConfig.acc_hardware;
            sensorConfig.baro_hardware = fcStore.sensorConfig.baro_hardware;
            sensorConfig.mag_hardware = fcStore.sensorConfig.mag_hardware;
            sensorConfig.sonar_hardware = fcStore.sensorConfig.sonar_hardware;
            sensorConfig.opticalflow_hardware = fcStore.sensorConfig.opticalflow_hardware;

            boardAlignment.roll = fcStore.boardAlignment.roll;
            boardAlignment.pitch = fcStore.boardAlignment.pitch;
            boardAlignment.yaw = fcStore.boardAlignment.yaw;

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

            // Accel Trims
            accelTrims.pitch = fcStore.config.accelerometerTrims[0];
            accelTrims.roll = fcStore.config.accelerometerTrims[1];

            // Sensor Alignment
            sensorAlignment.gyro_to_use = fcStore.sensorAlignment.gyro_to_use;
            sensorAlignment.gyro_1_align = fcStore.sensorAlignment.gyro_1_align;
            sensorAlignment.gyro_2_align = fcStore.sensorAlignment.gyro_2_align;
            sensorAlignment.align_mag = fcStore.sensorAlignment.align_mag;

            sensorAlignment.gyro_1_align_roll = fcStore.sensorAlignment.gyro_1_align_roll;
            sensorAlignment.gyro_1_align_pitch = fcStore.sensorAlignment.gyro_1_align_pitch;
            sensorAlignment.gyro_1_align_yaw = fcStore.sensorAlignment.gyro_1_align_yaw;
            sensorAlignment.gyro_2_align_roll = fcStore.sensorAlignment.gyro_2_align_roll;
            sensorAlignment.gyro_2_align_pitch = fcStore.sensorAlignment.gyro_2_align_pitch;
            sensorAlignment.gyro_2_align_yaw = fcStore.sensorAlignment.gyro_2_align_yaw;
            sensorAlignment.gyro_align = fcStore.sensorAlignment.gyro_align || [];
            sensorAlignment.gyro_enable_mask = fcStore.sensorAlignment.gyro_enable_mask || 0;
            sensorAlignment.gyro_align_roll = fcStore.sensorAlignment.gyro_align_roll || [];
            sensorAlignment.gyro_align_pitch = fcStore.sensorAlignment.gyro_align_pitch || [];
            sensorAlignment.gyro_align_yaw = fcStore.sensorAlignment.gyro_align_yaw || [];

            if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_47)) {
                sensorAlignment.mag_align_roll = fcStore.sensorAlignment.mag_align_roll || 0;
                sensorAlignment.mag_align_pitch = fcStore.sensorAlignment.mag_align_pitch || 0;
                sensorAlignment.mag_align_yaw = fcStore.sensorAlignment.mag_align_yaw || 0;
            }

            // Detect Gyros
            // Simplified detection logic compared to legacy for now, assume 1 unless flags say otherwise
            const GYRO_DETECTION_FLAGS = {
                DETECTED_GYRO_1: 1 << 0,
                DETECTED_GYRO_2: 1 << 1,
                DETECTED_DUAL_GYROS: 1 << 7,
            };
            const flags = fcStore.sensorAlignment.gyro_detection_flags || 0;
            hasSecondGyro.value = (flags & GYRO_DETECTION_FLAGS.DETECTED_GYRO_2) !== 0;
            hasDualGyros.value = (flags & GYRO_DETECTION_FLAGS.DETECTED_DUAL_GYROS) !== 0;

            // Gyro alignment dropdowns are only available for API < 1.47
            // In API 1.47+, the firmware uses gyro_enable_mask instead of individual gyro alignments
            // In API 1.47+, the firmware uses gyro_enable_mask instead of individual gyro alignments
            if (semver.lt(fcStore.config.apiVersion, API_VERSION_1_47)) {
                showGyro1Align.value = true;
                showGyro2Align.value = hasSecondGyro.value;
                showMultiGyro.value = false;
            } else {
                showGyro1Align.value = false;
                showGyro2Align.value = false;
                showMultiGyro.value = true;
            }

            // Mag Declination & Alignment
            if (have_sensor(fcStore.config.activeSensors, "mag")) {
                if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_46)) {
                    showMagDeclination.value = true;
                    magDeclination.value = fcStore.compassConfig.mag_declination;
                }
                // Show mag alignment for API >= 1.47
                if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_47)) {
                    showMagAlign.value = true;
                }
            } else {
                showMagDeclination.value = false;
                showMagAlign.value = false;
            }

            // Rangefinder / Optical Flow (API 1.47+)
            if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_47)) {
                sonarTypesList.value = sensorTypesData.value?.sonar.elements || [];
                showRangefinder.value = sonarTypesList.value.length > 0;

                opticalFlowTypesList.value = sensorTypesData.value?.opticalflow.elements || [];
                showOpticalFlow.value = opticalFlowTypesList.value.length > 0;
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
                console.log("Saving configuration...");
                gui_log("Saving...");

                fcStore.pidAdvancedConfig.pid_process_denom = pidAdvancedConfig.pid_process_denom;

                fcStore.sensorConfig.acc_hardware = sensorConfig.acc_hardware;
                fcStore.sensorConfig.baro_hardware = sensorConfig.baro_hardware;
                fcStore.sensorConfig.mag_hardware = sensorConfig.mag_hardware;

                fcStore.boardAlignment.roll = boardAlignment.roll;
                fcStore.boardAlignment.pitch = boardAlignment.pitch;
                fcStore.boardAlignment.yaw = boardAlignment.yaw;

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

                fcStore.config.accelerometerTrims[0] = accelTrims.pitch;
                fcStore.config.accelerometerTrims[1] = accelTrims.roll;

                fcStore.sensorAlignment.gyro_to_use = sensorAlignment.gyro_to_use;
                fcStore.sensorAlignment.gyro_1_align = sensorAlignment.gyro_1_align;
                fcStore.sensorAlignment.gyro_2_align = sensorAlignment.gyro_2_align;
                fcStore.sensorAlignment.align_mag = sensorAlignment.align_mag;

                if (semver.lt(fcStore.config.apiVersion, API_VERSION_1_47)) {
                    fcStore.sensorAlignment.gyro_1_align_roll = sensorAlignment.gyro_1_align_roll;
                    fcStore.sensorAlignment.gyro_1_align_pitch = sensorAlignment.gyro_1_align_pitch;
                    fcStore.sensorAlignment.gyro_1_align_yaw = sensorAlignment.gyro_1_align_yaw;
                    fcStore.sensorAlignment.gyro_2_align_roll = sensorAlignment.gyro_2_align_roll;
                    fcStore.sensorAlignment.gyro_2_align_pitch = sensorAlignment.gyro_2_align_pitch;
                    fcStore.sensorAlignment.gyro_2_align_yaw = sensorAlignment.gyro_2_align_yaw;
                } else {
                    // API 1.47+ Multi-Gyro
                    fcStore.sensorAlignment.gyro_enable_mask = sensorAlignment.gyro_enable_mask;
                    fcStore.sensorAlignment.gyro_align = sensorAlignment.gyro_align;
                    fcStore.sensorAlignment.gyro_align_roll = sensorAlignment.gyro_align_roll;
                    fcStore.sensorAlignment.gyro_align_pitch = sensorAlignment.gyro_align_pitch;
                    fcStore.sensorAlignment.gyro_align_yaw = sensorAlignment.gyro_align_yaw;
                }

                if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_47)) {
                    fcStore.sensorAlignment.mag_align_roll = sensorAlignment.mag_align_roll;
                    fcStore.sensorAlignment.mag_align_pitch = sensorAlignment.mag_align_pitch;
                    fcStore.sensorAlignment.mag_align_yaw = sensorAlignment.mag_align_yaw;
                }

                if (showMagDeclination.value) {
                    fcStore.compassConfig.mag_declination = magDeclination.value;
                }

                if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_47)) {
                    fcStore.sensorConfig.sonar_hardware = sensorConfig.sonar_hardware;
                    fcStore.sensorConfig.opticalflow_hardware = sensorConfig.opticalflow_hardware;
                }

                // Send MSP commands
                await MSP.promise(MSPCodes.MSP_SET_FEATURE_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_FEATURE_CONFIG));

                if (fcStore.beepers) {
                    await MSP.promise(MSPCodes.MSP_SET_BEEPER_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_BEEPER_CONFIG));
                }

                await MSP.promise(
                    MSPCodes.MSP_SET_BOARD_ALIGNMENT_CONFIG,
                    mspHelper.crunch(MSPCodes.MSP_SET_BOARD_ALIGNMENT_CONFIG),
                );
                await MSP.promise(MSPCodes.MSP_SET_ACC_TRIM, mspHelper.crunch(MSPCodes.MSP_SET_ACC_TRIM));
                await MSP.promise(MSPCodes.MSP_SET_ARMING_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_ARMING_CONFIG));
                await MSP.promise(MSPCodes.MSP_SET_SENSOR_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_SENSOR_CONFIG));
                await MSP.promise(
                    MSPCodes.MSP_SET_SENSOR_ALIGNMENT,
                    mspHelper.crunch(MSPCodes.MSP_SET_SENSOR_ALIGNMENT),
                );

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

                if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_46)) {
                    await MSP.promise(
                        MSPCodes.MSP_SET_COMPASS_CONFIG,
                        mspHelper.crunch(MSPCodes.MSP_SET_COMPASS_CONFIG),
                    );
                }

                gui_log(i18n.getMessage("configurationSaved"));

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
                gui_log(i18n.getMessage("configurationSaveFailed"));
            } finally {
                isSaving.value = false;
            }
        };

        onMounted(() => {
            loadConfig();
        });

        // Watch for beeper mask changes to reinitialize Switchery
        watch([beeperDisabledMask, dshotDisabledMask, featureMask], async () => {
            await nextTick();
            GUI.switchery();
        });

        return {
            pidAdvancedConfig,
            sensorConfig,
            accHardwareEnabled,
            enableAllDshot,
            disableAllDshot,
            baroHardwareEnabled,
            magHardwareEnabled,
            gyroFrequencyDisplay,
            pidDenomOptions,
            boardAlignment,
            fpvCamAngleDegrees,
            craftName,
            pilotName,
            showPilotName,
            featuresList,
            beepersList,
            dshotBeaconConditionsList,
            dshotBeaconTone,
            beeperDisabledMask,
            dshotDisabledMask,
            featureMask,
            isFeatureEnabled,
            toggleFeature,
            isBeeperEnabled,
            toggleBeeper,
            enableAllBeepers,
            disableAllBeepers,
            isDshotConditionEnabled,
            toggleDshotCondition,
            armingConfig,
            accelTrims,
            sensorAlignment,
            magDeclination,
            showGyroCalOnFirstArm,
            showAutoDisarmDelay,
            hasSecondGyro,
            hasDualGyros,
            showGyro1Align,
            showGyro2Align,
            showMagAlign,
            showSensorAlignment,
            showOtherSensors,
            showMagDeclination,
            showRangefinder,
            showOpticalFlow,
            sonarTypesList,
            showGyroToUse,
            opticalFlowTypesList,
            sensorAlignments,
            gyroToUseSelectItems,
            gyroAlignSelectItems,
            showMultiGyro,
            gyroList,
            getGyroLabel,
            toggleGyro,
            updateGyroAlign,
            saveConfig,
        };
    },
});
</script>

<style lang="less">
.tab-configuration {
    .alignicon {
        width: 15px;
        height: 15px;
        margin: 3px;
    }

    .pitch {
        background-image: url(../../images/icons/cf_icon_pitch.svg);
        background-repeat: no-repeat;
        background-position: center;
    }

    .yaw {
        background-image: url(../../images/icons/cf_icon_yaw.svg);
        background-repeat: no-repeat;
        background-position: center;
    }

    .roll {
        background-image: url(../../images/icons/cf_icon_roll.svg);
        background-repeat: no-repeat;
        background-position: center;
    }

    .sensor_align_content {
        display: flex;
        justify-content: space-between;
        width: 100%;
        flex-wrap: wrap;
        gap: 0.5rem;

        .sensor_align_inputs {
            display: flex;
            align-items: center;

            label {
                white-space: nowrap;
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }
        }
    }

    table {
        td {
            height: 1.75rem;
        }
    }

    .visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
    }

    @media all and (max-width: 575px) {
        .grid-box {
            &.col2 {
                grid-template-columns: 1fr !important;
            }
        }
    }
}
</style>
