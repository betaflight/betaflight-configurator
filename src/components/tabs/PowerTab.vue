<template>
    <BaseTab tab-name="power" :extra-class="supported ? 'supported' : ''">
        <div class="content_wrapper grid-box col1">
            <!-- Title and Documentation -->
            <div class="cf_column">
                <div class="tab_title" v-html="$t('tabPower')"></div>
                <WikiButton docUrl="power" />
            </div>

            <!-- Battery Profile Selector -->
            <UiBox v-if="hasBatteryProfiles" :title="$t('powerBatteryProfile')">
                <SettingRow :label="$t('powerBatteryProfile')">
                    <USelect
                        :items="batteryProfileItems"
                        :model-value="activeBatteryProfile"
                        @update:model-value="onBatteryProfileChange"
                        size="sm"
                        class="min-w-40"
                    />
                </SettingRow>
                <SettingRow :label="$t('powerBatteryProfileNameLabel')">
                    <UInput
                        v-model="batteryProfileName"
                        maxlength="8"
                        :placeholder="$t('powerBatteryProfileNamePlaceholder')"
                        size="sm"
                    />
                </SettingRow>
            </UiBox>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <!-- Left Column -->
                <div class="flex flex-col gap-4">
                    <!-- Battery Configuration -->
                    <UiBox :title="$t('powerBatteryHead')">
                        <SettingRow :label="$t('powerBatteryVoltageMeterSource')">
                            <USelect
                                :items="batteryMeterTypeItems"
                                v-model="batteryConfig.voltageMeterSource"
                                @update:model-value="onVoltageMeterSourceChange"
                                size="sm"
                                class="min-w-40"
                            />
                        </SettingRow>
                        <SettingRow :label="$t('powerBatteryCurrentMeterSource')">
                            <USelect
                                :items="currentMeterTypeItems"
                                v-model="batteryConfig.currentMeterSource"
                                @update:model-value="onCurrentMeterSourceChange"
                                size="sm"
                                class="min-w-40"
                            />
                        </SettingRow>
                        <SettingRow :label="$t('powerBatteryMinimum')" :help="$t('powerBatteryMinimumHelp')">
                            <UInputNumber
                                id="mincellvoltage"
                                name="mincellvoltage"
                                :step="0.01"
                                :min="1"
                                :max="batteryConfig.vbatwarningcellvoltage"
                                v-model="batteryConfig.vbatmincellvoltage"
                            />
                        </SettingRow>
                        <SettingRow :label="$t('powerBatteryMaximum')" :help="$t('powerBatteryMaximumHelp')">
                            <UInputNumber
                                id="maxcellvoltage"
                                name="maxcellvoltage"
                                :step="0.01"
                                :min="batteryConfig.vbatwarningcellvoltage"
                                :max="5"
                                v-model="batteryConfig.vbatmaxcellvoltage"
                            />
                        </SettingRow>
                        <SettingRow :label="$t('powerBatteryWarning')" :help="$t('powerBatteryWarningHelp')">
                            <UInputNumber
                                id="warningcellvoltage"
                                name="warningcellvoltage"
                                :step="0.01"
                                :min="batteryConfig.vbatmincellvoltage"
                                :max="batteryConfig.vbatmaxcellvoltage"
                                v-model="batteryConfig.vbatwarningcellvoltage"
                            />
                        </SettingRow>
                        <SettingRow :label="$t('powerBatteryCapacity')">
                            <UInputNumber
                                id="capacity"
                                name="capacity"
                                :step="1"
                                :min="0"
                                :max="20000"
                                v-model="batteryConfig.capacity"
                            />
                        </SettingRow>
                    </UiBox>

                    <!-- Voltage Configuration -->
                    <UiBox v-show="showVoltageConfiguration" :title="$t('powerVoltageHead')">
                        <div class="note">
                            <div v-html="$t('powerVoltageWarning')"></div>
                        </div>
                        <div
                            v-for="(meter, index) in voltageMeters"
                            :key="`voltage-${index}`"
                            v-show="isVoltageMeterVisible(meter)"
                            class="flex flex-col gap-2"
                        >
                            <div class="flex justify-between items-center">
                                <span class="font-semibold">{{ getVoltageMeterLabel(meter.id) }}</span>
                                <span>{{ $t("powerVoltageValue", { 1: meter.voltage.toFixed(2) }) }}</span>
                            </div>
                            <div v-if="voltageConfigs[index]" class="flex flex-col gap-2">
                                <SettingRow :label="$t('powerVoltageScale')">
                                    <UInputNumber
                                        :id="`vbatscale-${index}`"
                                        :name="`vbatscale-${index}`"
                                        :step="1"
                                        :min="10"
                                        :max="255"
                                        v-model="voltageConfigs[index].vbatscale"
                                        @update:model-value="onVoltageScaleChange(index, $event)"
                                    />
                                </SettingRow>
                                <SettingRow :label="$t('powerVoltageDivider')">
                                    <UInputNumber
                                        :id="`vbatresdivval-${index}`"
                                        :name="`vbatresdivval-${index}`"
                                        :step="1"
                                        :min="1"
                                        :max="255"
                                        v-model="voltageConfigs[index].vbatresdivval"
                                    />
                                </SettingRow>
                                <SettingRow :label="$t('powerVoltageMultiplier')">
                                    <UInputNumber
                                        :id="`vbatresdivmultiplier-${index}`"
                                        :name="`vbatresdivmultiplier-${index}`"
                                        :step="1"
                                        :min="1"
                                        :max="255"
                                        v-model="voltageConfigs[index].vbatresdivmultiplier"
                                    />
                                </SettingRow>
                            </div>
                        </div>
                    </UiBox>
                </div>

                <!-- Right Column -->
                <div class="flex flex-col gap-4">
                    <!-- Battery State -->
                    <UiBox :title="$t('powerStateHead')">
                        <div class="flex justify-between items-center">
                            <span v-html="$t('powerBatteryConnected')"></span>
                            <span>
                                {{
                                    batteryState.cellCount > 0
                                        ? $t("powerBatteryConnectedValueYes", { 1: batteryState.cellCount })
                                        : $t("powerBatteryConnectedValueNo")
                                }}
                            </span>
                        </div>
                        <div class="flex justify-between items-center">
                            <span v-html="$t('powerBatteryVoltage')"></span>
                            <span>{{ $t("powerVoltageValue", { 1: batteryState.voltage.toFixed(2) }) }}</span>
                        </div>
                        <div class="flex justify-between items-center">
                            <span v-html="$t('powerBatteryCurrentDrawn')"></span>
                            <span>{{ $t("powerMahValue", { 1: batteryState.mAhDrawn }) }}</span>
                        </div>
                        <div class="flex justify-between items-center">
                            <span v-html="$t('powerBatteryAmperage')"></span>
                            <span>{{ $t("powerAmperageValue", { 1: batteryState.amperage.toFixed(2) }) }}</span>
                        </div>
                    </UiBox>

                    <!-- Amperage Configuration -->
                    <UiBox v-show="showAmperageConfiguration" :title="$t('powerAmperageHead')">
                        <div class="note">
                            <div v-html="$t('powerAmperageWarning')"></div>
                        </div>
                        <div
                            v-for="(meter, index) in currentMeters"
                            :key="`amperage-${index}`"
                            v-show="isCurrentMeterVisible(meter)"
                            class="flex flex-col gap-2"
                        >
                            <div class="flex justify-between items-center">
                                <span class="font-semibold">{{ getAmperageMeterLabel(meter.id) }}</span>
                                <span>{{ $t("powerAmperageValue", { 1: meter.amperage.toFixed(2) }) }}</span>
                            </div>
                            <div v-if="currentConfigs[index]" class="flex flex-col gap-2">
                                <SettingRow :label="$t('powerAmperageScale')">
                                    <UInputNumber
                                        :id="`amperagescale-${index}`"
                                        :name="`amperagescale-${index}`"
                                        :step="1"
                                        :min="-16000"
                                        :max="16000"
                                        v-model="currentConfigs[index].scale"
                                        @update:model-value="onAmperageScaleChange(index, $event)"
                                    />
                                </SettingRow>
                                <SettingRow :label="$t('powerAmperageOffset')">
                                    <UInputNumber
                                        :id="`amperageoffset-${index}`"
                                        :name="`amperageoffset-${index}`"
                                        :step="1"
                                        :min="-32000"
                                        :max="32000"
                                        v-model="currentConfigs[index].offset"
                                    />
                                </SettingRow>
                            </div>
                        </div>
                    </UiBox>
                </div>
            </div>

            <div class="note hidden">
                <p v-html="$t('powerFirmwareUpgradeRequired')"></p>
            </div>
        </div>

        <!-- Bottom Toolbar -->
        <div class="content_toolbar toolbar_fixed_bottom">
            <div class="btn calibration" v-show="showCalibration">
                <button
                    type="button"
                    class="calibrationmanager"
                    id="calibrationmanager"
                    @click="openCalibrationManager"
                    v-html="$t('powerCalibrationManagerButton')"
                ></button>
            </div>
            <div class="btn save_btn">
                <button type="button" class="save" @click="handleSave" v-html="$t('powerButtonSave')"></button>
            </div>
        </div>

        <!-- Calibration Manager Dialog -->
        <Dialog v-model="showCalibrationManagerDialog" :title="$t('powerCalibrationManagerTitle')">
            <div class="note">
                <p v-html="$t('powerCalibrationManagerHelp')"></p>
            </div>
            <div class="note">
                <p v-html="$t('powerCalibrationManagerNote')"></p>
            </div>
            <div class="note nocalib" v-show="calibrationVisibility.showNoCalib">
                <p v-html="$t('powerCalibrationManagerWarning')"></p>
            </div>
            <div class="note srcchange" v-show="calibrationVisibility.showSrcChange">
                <p v-html="$t('powerCalibrationManagerSourceNote')"></p>
            </div>
            <div v-show="calibrationVisibility.showVbat">
                <SettingRow :label="$t('powerVoltageCalibration')">
                    <UInputNumber
                        id="vbatcalibration"
                        name="vbatcalibration"
                        :step="0.01"
                        :min="0"
                        :max="255"
                        v-model="vbatcalibrationValue"
                    />
                </SettingRow>
            </div>
            <div v-show="calibrationVisibility.showAmperage">
                <SettingRow :label="$t('powerAmperageCalibration')">
                    <UInputNumber
                        id="amperagecalibration"
                        name="amperagecalibration"
                        :step="0.01"
                        :min="0"
                        :max="255"
                        v-model="amperagecalibrationValue"
                    />
                </SettingRow>
            </div>
            <div class="default_btn margin-top5" v-show="calibrationVisibility.showCalibrate">
                <a
                    class="calibrate"
                    href="#"
                    :aria-label="$t('powerCalibrationSave')"
                    @click.prevent="handleCalibrate"
                    v-html="$t('powerCalibrationSave')"
                ></a>
            </div>
        </Dialog>

        <!-- Calibration Confirmation Dialog -->
        <Dialog
            v-model="showCalibrationConfirmDialog"
            :title="$t('powerCalibrationManagerConfirmationTitle')"
            @close="handleCalibrationConfirmClose"
        >
            <div class="note">
                <p v-html="$t('powerCalibrationConfirmHelp')"></p>
            </div>
            <div v-show="vbatscalechanged" class="flex justify-between items-center font-semibold">
                <span v-html="$t('powerVoltageCalibratedScale')"></span>
                <span>{{ vbatnewscale }}</span>
            </div>
            <div v-show="amperagescalechanged" class="flex justify-between items-center font-semibold">
                <span v-html="$t('powerAmperageCalibratedScale')"></span>
                <span>{{ amperagenewscale }}</span>
            </div>

            <div class="default_btn margin-top5">
                <a
                    class="applycalibration"
                    href="#"
                    :aria-label="$t('powerCalibrationApply')"
                    @click.prevent="handleApplyCalibration"
                    v-html="$t('powerCalibrationApply')"
                ></a>
            </div>
            <div class="default_btn">
                <a
                    class="discardcalibration"
                    href="#"
                    :aria-label="$t('powerCalibrationDiscard')"
                    @click.prevent="handleDiscardCalibration"
                    v-html="$t('powerCalibrationDiscard')"
                ></a>
            </div>
        </Dialog>
    </BaseTab>
</template>

<script>
import { defineComponent, onMounted, computed, nextTick, ref } from "vue";
import BaseTab from "./BaseTab.vue";
import WikiButton from "../elements/WikiButton.vue";
import Dialog from "../elements/Dialog.vue";
import UiBox from "../elements/UiBox.vue";
import SettingRow from "../elements/SettingRow.vue";
import GUI from "../../js/gui";
import FC from "../../js/fc";
import { i18n } from "../../js/localization";
import { usePower } from "../../composables/usePower";
import { useInterval } from "../../composables/useInterval";

export default defineComponent({
    name: "PowerTab",
    components: {
        BaseTab,
        WikiButton,
        Dialog,
        UiBox,
        SettingRow,
    },
    setup() {
        const {
            supported,
            hasBatteryProfiles,
            activeBatteryProfile,
            batteryProfileName,
            batteryState,
            voltageMeters,
            currentMeters,
            batteryConfig,
            voltageConfigs,
            currentConfigs,
            showVoltageConfiguration,
            showAmperageConfiguration,
            showCalibration,
            batteryMeterTypes,
            currentMeterTypes,
            getVoltageMeterLabel,
            getAmperageMeterLabel,
            isVoltageMeterVisible,
            isCurrentMeterVisible,
            loadData,
            changeBatteryProfile,
            updateLiveData,
            onVoltageMeterSourceChange,
            onCurrentMeterSourceChange,
            onVoltageScaleChange,
            onAmperageScaleChange,
            getCalibrationVisibility,
            calibrate,
            applyCalibration,
            discardCalibration,
            saveConfig,
            vbatcalibrationValue,
            amperagecalibrationValue,
            vbatscalechanged,
            amperagescalechanged,
            vbatnewscale,
            amperagenewscale,
            sourceschanged,
        } = usePower();

        const calibrationVisibility = computed(() => getCalibrationVisibility());
        const numberOfBatteryProfiles = computed(() => FC.CONFIG.numberOfBatteryProfiles || 0);

        const batteryProfileItems = computed(() =>
            Array.from({ length: numberOfBatteryProfiles.value }, (_, i) => ({
                label: i18n.getMessage("powerBatteryProfileOption", { 1: i + 1 }),
                value: i,
            })),
        );

        const batteryMeterTypeItems = computed(() =>
            batteryMeterTypes.value.map((type, index) => ({ label: type, value: index })),
        );

        const currentMeterTypeItems = computed(() =>
            currentMeterTypes.value.map((type, index) => ({ label: type, value: index })),
        );

        const onBatteryProfileChange = async (value) => {
            const profileIndex = Number(value);
            if (!Number.isInteger(profileIndex) || profileIndex < 0 || profileIndex >= numberOfBatteryProfiles.value) {
                return;
            }
            try {
                await changeBatteryProfile(profileIndex);
            } catch (error) {
                console.error("Battery profile change failed:", error);
            }
        };

        // Dialog visibility state
        const showCalibrationManagerDialog = ref(false);
        const showCalibrationConfirmDialog = ref(false);

        const { addInterval } = useInterval();

        onMounted(async () => {
            await loadData();

            nextTick(() => {
                i18n.localizePage();
                GUI.content_ready();
            });

            // Start polling
            addInterval("power_data_pull_slow", updateLiveData, 200, true);
        });

        // Interval cleanup handled automatically by useInterval on unmount

        const handleSave = () => {
            saveConfig(() => loadData());
        };

        const openCalibrationManager = () => {
            sourceschanged.value = false;
            showCalibrationManagerDialog.value = true;
        };

        const handleCalibrate = async () => {
            calibrate();
            if (vbatscalechanged.value || amperagescalechanged.value) {
                // Close manager dialog first to avoid InvalidStateError
                showCalibrationManagerDialog.value = false;
                // Wait for dialog to close before opening confirmation
                await nextTick();
                showCalibrationConfirmDialog.value = true;
            }
        };

        const handleApplyCalibration = () => {
            applyCalibration();
            showCalibrationConfirmDialog.value = false;
        };

        const handleDiscardCalibration = () => {
            discardCalibration();
            showCalibrationConfirmDialog.value = false;
        };

        const handleCalibrationConfirmClose = () => {
            if (vbatscalechanged.value || amperagescalechanged.value) {
                showCalibrationManagerDialog.value = false;
            }
        };

        return {
            supported,
            hasBatteryProfiles,
            activeBatteryProfile,
            batteryProfileName,
            numberOfBatteryProfiles,
            batteryProfileItems,
            batteryMeterTypeItems,
            currentMeterTypeItems,
            onBatteryProfileChange,
            batteryState,
            voltageMeters,
            currentMeters,
            batteryConfig,
            voltageConfigs,
            currentConfigs,
            showVoltageConfiguration,
            showAmperageConfiguration,
            showCalibration,
            getVoltageMeterLabel,
            getAmperageMeterLabel,
            isVoltageMeterVisible,
            isCurrentMeterVisible,
            onVoltageMeterSourceChange,
            onCurrentMeterSourceChange,
            onVoltageScaleChange,
            onAmperageScaleChange,
            openCalibrationManager,
            calibrationVisibility,
            handleSave,
            vbatcalibrationValue,
            amperagecalibrationValue,
            vbatscalechanged,
            amperagescalechanged,
            vbatnewscale,
            amperagenewscale,
            showCalibrationManagerDialog,
            showCalibrationConfirmDialog,
            handleCalibrate,
            handleApplyCalibration,
            handleDiscardCalibration,
            handleCalibrationConfirmClose,
        };
    },
});
</script>
