<template>
    <BaseTab tab-name="power">
        <div class="content_wrapper">
            <!-- Title and Documentation -->
            <div class="cf_column">
                <div class="tab_title" v-html="$t('tabPower')"></div>
                <WikiButton docUrl="power" />
            </div>

            <div class="grid-row grid-box col2">
                <!-- Left Column -->
                <div class="col-span-1">
                    <!-- Battery Configuration -->
                    <div class="gui_box grey">
                        <div class="gui_box_titlebar">
                            <div class="spacer_box_title" v-html="$t('powerBatteryHead')"></div>
                        </div>
                        <div class="spacer_box battery">
                            <table class="cf_table no-border">
                                <tbody class="battery-config">
                                    <tr>
                                        <td class="configuration">
                                            <div class="battery-configuration">
                                                <div class="select vbatmonitoring">
                                                    <label>
                                                        <select
                                                            id="batterymetersourceSelect"
                                                            class="batterymetersource"
                                                            v-model="batteryConfig.voltageMeterSource"
                                                            @change="onVoltageMeterSourceChange($event.target.value)"
                                                        >
                                                            <option
                                                                v-for="(type, index) in batteryMeterTypes"
                                                                :key="index"
                                                                :value="index"
                                                            >
                                                                {{ type }}
                                                            </option>
                                                        </select>
                                                        <span v-html="$t('powerBatteryVoltageMeterSource')"></span>
                                                    </label>
                                                </div>
                                                <div class="select currentMonitoring">
                                                    <label>
                                                        <select
                                                            id="currentmetersourceSelect"
                                                            class="currentmetersource"
                                                            v-model="batteryConfig.currentMeterSource"
                                                            @change="onCurrentMeterSourceChange($event.target.value)"
                                                        >
                                                            <option
                                                                v-for="(type, index) in currentMeterTypes"
                                                                :key="index"
                                                                :value="index"
                                                            >
                                                                {{ type }}
                                                            </option>
                                                        </select>
                                                        <span v-html="$t('powerBatteryCurrentMeterSource')"></span>
                                                    </label>
                                                </div>

                                                <div class="number">
                                                    <label>
                                                        <input
                                                            type="number"
                                                            name="mincellvoltage"
                                                            step="0.01"
                                                            min="1"
                                                            max="5"
                                                            v-model.number="batteryConfig.vbatmincellvoltage"
                                                        />
                                                        <span v-html="$t('powerBatteryMinimum')"></span>
                                                    </label>
                                                    <span
                                                        class="helpicon cf_tip"
                                                        :title="$t('powerBatteryMinimumHelp')"
                                                    ></span>
                                                </div>
                                                <div class="number">
                                                    <label>
                                                        <input
                                                            type="number"
                                                            name="maxcellvoltage"
                                                            step="0.01"
                                                            min="1"
                                                            max="5"
                                                            v-model.number="batteryConfig.vbatmaxcellvoltage"
                                                        />
                                                        <span v-html="$t('powerBatteryMaximum')"></span>
                                                    </label>
                                                    <span
                                                        class="helpicon cf_tip"
                                                        :title="$t('powerBatteryMaximumHelp')"
                                                    ></span>
                                                </div>
                                                <div class="number">
                                                    <label>
                                                        <input
                                                            type="number"
                                                            name="warningcellvoltage"
                                                            step="0.01"
                                                            min="1"
                                                            max="5"
                                                            v-model.number="batteryConfig.vbatwarningcellvoltage"
                                                        />
                                                        <span v-html="$t('powerBatteryWarning')"></span>
                                                    </label>
                                                    <span
                                                        class="helpicon cf_tip"
                                                        :title="$t('powerBatteryWarningHelp')"
                                                    ></span>
                                                </div>
                                                <div class="number">
                                                    <label>
                                                        <input
                                                            type="number"
                                                            name="capacity"
                                                            step="1"
                                                            min="0"
                                                            max="20000"
                                                            v-model.number="batteryConfig.capacity"
                                                        />
                                                        <span v-html="$t('powerBatteryCapacity')"></span>
                                                    </label>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Voltage Configuration -->
                    <div class="gui_box grey boxVoltageConfiguration" v-show="showVoltageConfiguration">
                        <div class="gui_box_titlebar">
                            <div class="spacer_box_title" v-html="$t('powerVoltageHead')"></div>
                        </div>
                        <div class="note">
                            <div v-html="$t('powerVoltageWarning')"></div>
                        </div>

                        <div class="spacer_box">
                            <table class="cf_table no-border full-width">
                                <tbody class="voltage-meters">
                                    <tr
                                        v-for="(meter, index) in voltageMeters"
                                        :key="`voltage-${index}`"
                                        :id="`voltage-meter-${index}`"
                                        class="voltage-meter"
                                        v-show="isVoltageMeterVisible(meter)"
                                    >
                                        <td class="label">{{ getVoltageMeterLabel(meter.id) }}</td>
                                        <td class="value">
                                            {{ $t("powerVoltageValue", { 1: meter.voltage.toFixed(2) }) }}
                                        </td>
                                        <td class="configuration" v-if="voltageConfigs[index]">
                                            <div class="voltage-configuration">
                                                <div class="number">
                                                    <label>
                                                        <input
                                                            type="number"
                                                            :name="`vbatscale-${index}`"
                                                            step="1"
                                                            min="10"
                                                            max="255"
                                                            v-model.number="voltageConfigs[index].vbatscale"
                                                            @change="
                                                                onVoltageScaleChange(
                                                                    index,
                                                                    voltageConfigs[index].vbatscale,
                                                                )
                                                            "
                                                        />
                                                        <span v-html="$t('powerVoltageScale')"></span>
                                                    </label>
                                                </div>
                                                <div class="number">
                                                    <label>
                                                        <input
                                                            type="number"
                                                            :name="`vbatresdivval-${index}`"
                                                            step="1"
                                                            min="1"
                                                            max="255"
                                                            v-model.number="voltageConfigs[index].vbatresdivval"
                                                        />
                                                        <span v-html="$t('powerVoltageDivider')"></span>
                                                    </label>
                                                </div>
                                                <div class="number">
                                                    <label>
                                                        <input
                                                            type="number"
                                                            :name="`vbatresdivmultiplier-${index}`"
                                                            step="1"
                                                            min="1"
                                                            max="255"
                                                            v-model.number="voltageConfigs[index].vbatresdivmultiplier"
                                                        />
                                                        <span v-html="$t('powerVoltageMultiplier')"></span>
                                                    </label>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- Right Column -->
                <div class="col-span-1">
                    <!-- Battery State -->
                    <div class="gui_box grey">
                        <div class="gui_box_titlebar">
                            <div class="spacer_box_title" v-html="$t('powerStateHead')"></div>
                        </div>
                        <div class="spacer_box battery">
                            <table class="cf_table no-border">
                                <tbody class="battery-state">
                                    <tr class="connection-state" id="battery-connection-state">
                                        <td v-html="$t('powerBatteryConnected')"></td>
                                        <td class="value">
                                            {{
                                                batteryState.cellCount > 0
                                                    ? $t("powerBatteryConnectedValueYes", { 1: batteryState.cellCount })
                                                    : $t("powerBatteryConnectedValueNo")
                                            }}
                                        </td>
                                    </tr>
                                    <tr class="voltage" id="battery-voltage">
                                        <td v-html="$t('powerBatteryVoltage')"></td>
                                        <td class="value">
                                            {{ $t("powerVoltageValue", { 1: batteryState.voltage.toFixed(2) }) }}
                                        </td>
                                    </tr>
                                    <tr class="mah-drawn" id="battery-mah-drawn">
                                        <td v-html="$t('powerBatteryCurrentDrawn')"></td>
                                        <td class="value">{{ $t("powerMahValue", { 1: batteryState.mAhDrawn }) }}</td>
                                    </tr>
                                    <tr class="amperage" id="battery-amperage">
                                        <td v-html="$t('powerBatteryAmperage')"></td>
                                        <td class="value">
                                            {{ $t("powerAmperageValue", { 1: batteryState.amperage.toFixed(2) }) }}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Amperage Configuration -->
                    <div class="gui_box grey boxAmperageConfiguration" v-show="showAmperageConfiguration">
                        <div class="gui_box_titlebar">
                            <div class="spacer_box_title" v-html="$t('powerAmperageHead')"></div>
                        </div>
                        <div class="note">
                            <div v-html="$t('powerAmperageWarning')"></div>
                        </div>

                        <div class="spacer_box">
                            <table class="cf_table no-border full-width">
                                <tbody class="amperage-meters">
                                    <tr
                                        v-for="(meter, index) in currentMeters"
                                        :key="`amperage-${index}`"
                                        :id="`amperage-meter-${index}`"
                                        class="amperage-meter"
                                        v-show="isCurrentMeterVisible(meter)"
                                    >
                                        <td class="label">{{ getAmperageMeterLabel(meter.id) }}</td>
                                        <td class="value">
                                            {{ $t("powerAmperageValue", { 1: meter.amperage.toFixed(2) }) }}
                                        </td>
                                        <td class="configuration" v-if="currentConfigs[index]">
                                            <div class="amperage-configuration">
                                                <div class="number">
                                                    <label>
                                                        <input
                                                            type="number"
                                                            :name="`amperagescale-${index}`"
                                                            step="1"
                                                            min="-16000"
                                                            max="16000"
                                                            v-model.number="currentConfigs[index].scale"
                                                            @change="
                                                                onAmperageScaleChange(
                                                                    index,
                                                                    currentConfigs[index].scale,
                                                                )
                                                            "
                                                        />
                                                        <span v-html="$t('powerAmperageScale')"></span>
                                                    </label>
                                                </div>
                                                <div class="number">
                                                    <label>
                                                        <input
                                                            type="number"
                                                            :name="`amperageoffset-${index}`"
                                                            step="1"
                                                            min="-32000"
                                                            max="32000"
                                                            v-model.number="currentConfigs[index].offset"
                                                        />
                                                        <span v-html="$t('powerAmperageOffset')"></span>
                                                    </label>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            <div class="note require-upgrade">
                <p v-html="$t('powerFirmwareUpgradeRequired')"></p>
            </div>
        </div>

        <!-- Bottom Toolbar -->
        <div class="content_toolbar toolbar_fixed_bottom">
            <div class="btn calibration" v-show="showCalibration">
                <a
                    class="calibrationmanager"
                    id="calibrationmanager"
                    href="#"
                    @click.prevent="openCalibrationManager"
                    v-html="$t('powerCalibrationManagerButton')"
                ></a>
            </div>
            <div class="btn save_btn">
                <a class="save" href="#" @click.prevent="handleSave" v-html="$t('powerButtonSave')"></a>
            </div>
        </div>

        <!-- Calibration Manager Dialog -->
        <dialog closedby="any" id="calibrationmanagerdialog" class="html-dialog">
            <div id="calibrationmanagercontent" class="html-dialog-content">
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
                <div class="vbatcalibration" v-show="calibrationVisibility.showVbat">
                    <div class="number">
                        <label>
                            <input
                                type="number"
                                name="vbatcalibration"
                                step="0.01"
                                min="0"
                                max="255"
                                v-model.number="vbatcalibrationValue"
                            />
                            <span v-html="$t('powerVoltageCalibration')"></span>
                        </label>
                    </div>
                </div>
                <div class="amperagecalibration" v-show="calibrationVisibility.showAmperage">
                    <div class="number">
                        <label>
                            <input
                                type="number"
                                name="amperagecalibration"
                                step="0.01"
                                min="0"
                                max="255"
                                v-model.number="amperagecalibrationValue"
                            />
                            <span v-html="$t('powerAmperageCalibration')"></span>
                        </label>
                    </div>
                </div>
                <div class="default_btn margin-top5" v-show="calibrationVisibility.showCalibrate">
                    <a
                        class="calibrate"
                        id="calibrate"
                        href="#"
                        @click.prevent="calibrate"
                        v-html="$t('powerCalibrationSave')"
                    ></a>
                </div>
            </div>
        </dialog>

        <!-- Calibration Confirmation Dialog -->
        <dialog closedby="any" id="calibrationmanagerconfirmdialog" class="html-dialog">
            <div id="calibrationmanagerconfirmcontent" class="html-dialog-content">
                <div class="note">
                    <p v-html="$t('powerCalibrationConfirmHelp')"></p>
                </div>
                <div class="vbatcalibration" v-show="vbatscalechanged">
                    <div class="number tab_title">
                        <label>
                            <span v-html="$t('powerVoltageCalibratedScale')"></span>
                            <output name="vbatnewscale">{{ vbatnewscale }}</output>
                        </label>
                    </div>
                </div>
                <div class="amperagecalibration" v-show="amperagescalechanged">
                    <div class="number tab_title">
                        <label>
                            <span v-html="$t('powerAmperageCalibratedScale')"></span>
                            <output name="amperagenewscale">{{ amperagenewscale }}</output>
                        </label>
                    </div>
                </div>

                <div class="default_btn margin-top5">
                    <a
                        class="applycalibration"
                        id="applycalibration"
                        href="#"
                        @click.prevent="applyCalibration"
                        v-html="$t('powerCalibrationApply')"
                    ></a>
                </div>
                <div class="default_btn">
                    <a
                        class="discardcalibration"
                        id="discardcalibration"
                        href="#"
                        @click.prevent="discardCalibration"
                        v-html="$t('powerCalibrationDiscard')"
                    ></a>
                </div>
            </div>
        </dialog>
    </BaseTab>
</template>

<script>
import { defineComponent, onMounted, onUnmounted, computed, nextTick } from "vue";
import BaseTab from "./BaseTab.vue";
import WikiButton from "../elements/WikiButton.vue";
import GUI from "../../js/gui";
import { i18n } from "../../js/localization";
import { usePower } from "../../composables/usePower";

export default defineComponent({
    name: "PowerTab",
    components: {
        BaseTab,
        WikiButton,
    },
    setup() {
        const {
            supported,
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
            updateLiveData,
            onVoltageMeterSourceChange,
            onCurrentMeterSourceChange,
            onVoltageScaleChange,
            onAmperageScaleChange,
            initializeCalibrationDialogs,
            openCalibrationManager,
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
        } = usePower();

        const calibrationVisibility = computed(() => getCalibrationVisibility());

        // Track local intervals
        const localIntervals = [];
        const addLocalInterval = (name, code, period, first = false) => {
            GUI.interval_add(name, code, period, first);
            localIntervals.push(name);
        };

        onMounted(async () => {
            await loadData();

            nextTick(() => {
                i18n.localizePage();
                initializeCalibrationDialogs(() => loadData());
                GUI.content_ready();
            });

            // Start polling
            addLocalInterval("power_data_pull_slow", updateLiveData, 200, true);
        });

        onUnmounted(() => {
            localIntervals.forEach((name) => GUI.interval_remove(name));
            localIntervals.length = 0;
        });

        const handleSave = () => {
            saveConfig(() => loadData());
        };

        return {
            supported,
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
            onVoltageMeterSourceChange,
            onCurrentMeterSourceChange,
            onVoltageScaleChange,
            onAmperageScaleChange,
            openCalibrationManager,
            calibrationVisibility,
            calibrate,
            applyCalibration,
            discardCalibration,
            handleSave,
            vbatcalibrationValue,
            amperagecalibrationValue,
            vbatscalechanged,
            amperagescalechanged,
            vbatnewscale,
            amperagenewscale,
        };
    },
});
</script>

<style scoped>
.content_toolbar.toolbar_fixed_bottom {
    position: fixed;
    bottom: 2rem;
}

table.no-border {
    border: 0;
    border-collapse: collapse;
    border-spacing: 0;
}

table.no-border td,
table.no-border th {
    padding: 0;
}

table.full-width {
    width: 100%;
}

.battery-state .configuration {
    border-bottom: 0;
}

.label {
    width: 25%;
}

.select {
    margin-bottom: 0.5rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--surface-500);
    width: 100%;
}

.select label span {
    padding-left: 1rem;
}

.select:last-child {
    border-bottom: none;
    padding-bottom: 0;
    margin-bottom: 0;
}

.require-support {
    display: none;
}

.require-upgrade {
    display: block;
}

.tab-power.supported .require-support {
    display: block;
}

.tab-power.supported .require-upgrade {
    display: none;
}

@media all and (max-width: 575px) {
    .grid-box.col2 {
        grid-template-columns: 1fr !important;
    }
}
</style>
