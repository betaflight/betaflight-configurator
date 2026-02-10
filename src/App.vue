<template>
    <UApp>
        <div>
            <div id="background"></div>
            <div id="side_menu_swipe"></div>
            <div class="headerbar">
                <div id="menu_btn">
                    <em class="fas fa-bars"></em>
                </div>
                <UButton>Test</UButton>
                <betaflight-logo
                    :configurator-version="CONFIGURATOR.getDisplayVersion()"
                    :firmware-version="FC.CONFIG.flightControllerVersion"
                    :firmware-id="FC.CONFIG.flightControllerIdentifier"
                    :hardware-id="FC.CONFIG.hardwareName"
                ></betaflight-logo>
                <port-picker
                    v-model="PortHandler.portPicker"
                    :connected-bluetooth-devices="PortHandler.currentBluetoothPorts"
                    :connected-serial-devices="PortHandler.currentSerialPorts"
                    :connected-usb-devices="PortHandler.currentUsbPorts"
                    :show-virtual-option="PortHandler.showVirtualMode"
                    :show-manual-option="PortHandler.showManualMode"
                    :show-bluetooth-option="PortHandler.showBluetoothOption"
                    :show-serial-option="PortHandler.showSerialOption"
                    :show-usb-option="PortHandler.showUsbOption"
                    :disabled="PortHandler.portPickerDisabled"
                ></port-picker>
                <div class="header-wrapper">
                    <div id="quad-status_wrapper">
                        <battery-icon
                            :voltage="FC.ANALOG.voltage"
                            :vbatmincellvoltage="FC.BATTERY_CONFIG.vbatmincellvoltage"
                            :vbatmaxcellvoltage="FC.BATTERY_CONFIG.vbatmaxcellvoltage"
                            :vbatwarningcellvoltage="FC.BATTERY_CONFIG.vbatwarningcellvoltage"
                            :batteryState="FC.BATTERY_STATE?.batteryState"
                        >
                        </battery-icon>
                        <battery-legend
                            :voltage="FC.ANALOG.voltage"
                            :vbatmaxcellvoltage="FC.BATTERY_CONFIG.vbatmaxcellvoltage"
                        ></battery-legend>
                        <div class="bottomStatusIcons">
                            <div class="armedicon cf_tip" i18n_title="mainHelpArmed"></div>
                            <div class="failsafeicon cf_tip" i18n_title="mainHelpFailsafe"></div>
                            <div class="linkicon cf_tip" i18n_title="mainHelpLink"></div>
                        </div>
                    </div>
                    <div id="sensor-status" class="sensor_state mode-connected">
                        <ul>
                            <li class="gyro" i18n_title="sensorStatusGyro">
                                <div class="gyroicon" i18n="sensorStatusGyroShort"></div>
                            </li>
                            <li class="accel" i18n_title="sensorStatusAccel">
                                <div class="accicon" i18n="sensorStatusAccelShort"></div>
                            </li>
                            <li class="mag" i18n_title="sensorStatusMag">
                                <div class="magicon" i18n="sensorStatusMagShort"></div>
                            </li>
                            <li class="baro" i18n_title="sensorStatusBaro">
                                <div class="baroicon" i18n="sensorStatusBaroShort"></div>
                            </li>
                            <li class="gps" i18n_title="sensorStatusGPS">
                                <div class="gpsicon" i18n="sensorStatusGPSShort"></div>
                            </li>
                            <li class="sonar" i18n_title="sensorStatusSonar">
                                <div class="sonaricon" i18n="sensorStatusSonarShort"></div>
                            </li>
                        </ul>
                    </div>
                    <div id="dataflash_wrapper_global">
                        <div class="noflash_global" i18n="sensorDataFlashNotFound"></div>
                        <ul class="dataflash-contents_global">
                            <div class="legend" i18n="sensorDataFlashFreeSpace"></div>
                            <progress class="dataflash-progress_global" max="100"></progress>
                        </ul>
                        <div id="expertMode">
                            <label>
                                <input
                                    name="expertModeCheckbox"
                                    class="togglesmall"
                                    type="checkbox"
                                    v-model="expertMode"
                                />
                                <span i18n="expertMode" class="expertModeText"></span>
                            </label>
                        </div>
                    </div>
                </div>
                <div id="header_buttons">
                    <div class="firmware_flasher_button">
                        <a class="firmware_flasher_button__link disabled" href="#" aria-label="Firmware Flasher"></a>
                        <div class="firmware_flasher_button__label" i18n="flashTab"></div>
                    </div>
                    <div class="connection_button">
                        <a class="connection_button__link disabled" href="#" aria-label="Connect"></a>
                        <div class="connection_button__label" i18n="connect"></div>
                    </div>
                </div>
                <div id="reveal_btn">
                    <em class="fas fa-chevron-down"></em>
                </div>
            </div>
            <div id="log">
                <div class="logswitch">
                    <a href="#" id="showlog" i18n="logActionShow"></a>
                </div>
                <div id="scrollicon"></div>
                <div class="wrapper"></div>
            </div>
            <div id="tab-content-container">
                <div class="tab_container">
                    <betaflight-logo
                        :configurator-version="CONFIGURATOR.getDisplayVersion()"
                        :firmware-version="FC.CONFIG.flightControllerVersion"
                        :firmware-id="FC.CONFIG.flightControllerIdentifier"
                        :hardware-id="FC.CONFIG.hardwareName"
                    ></betaflight-logo>
                    <div id="tabs">
                        <ul class="mode-disconnected">
                            <li class="tab_landing" id="tab_landing">
                                <a href="#" i18n="tabLanding" class="tabicon ic_welcome" i18n_title="tabLanding"></a>
                            </li>
                            <li class="tab_help" id="tab_help">
                                <a href="#" i18n="tabHelp" class="tabicon ic_help" i18n_title="tabHelp"></a>
                            </li>
                            <li class="tab_options" id="tab_options">
                                <a href="#" i18n="tabOptions" class="tabicon ic_config" i18n_title="tabOptions"></a>
                            </li>
                            <li class="tab_firmware_flasher" id="tabFirmware">
                                <a
                                    href="#"
                                    i18n="tabFirmwareFlasher"
                                    class="tabicon ic_flasher"
                                    i18n_title="tabFirmwareFlasher"
                                ></a>
                            </li>
                        </ul>
                        <ul class="mode-connected">
                            <li class="tab_setup">
                                <a href="#" i18n="tabSetup" class="tabicon ic_setup" i18n_title="tabSetup"></a>
                            </li>
                            <li class="tab_setup_osd">
                                <a href="#" i18n="tabSetupOSD" class="tabicon ic_setup" i18n_title="tabSetupOSD"></a>
                            </li>
                            <li class="tab_ports">
                                <a href="#" i18n="tabPorts" class="tabicon ic_ports" i18n_title="tabPorts"></a>
                            </li>
                            <li class="tab_configuration">
                                <a
                                    href="#"
                                    i18n="tabConfiguration"
                                    class="tabicon ic_config"
                                    i18n_title="tabConfiguration"
                                ></a>
                            </li>
                            <li class="tab_power">
                                <a href="#" i18n="tabPower" class="tabicon ic_power" i18n_title="tabPower"></a>
                            </li>
                            <li class="tab_failsafe" v-show="expertMode">
                                <a href="#" i18n="tabFailsafe" class="tabicon ic_failsafe" i18n_title="tabFailsafe"></a>
                            </li>
                            <li class="tab_presets">
                                <a href="#" i18n="tabPresets" class="tabicon ic_wizzard" i18n_title="tabPresets"></a>
                            </li>
                            <li class="tab_pid_tuning">
                                <a href="#" i18n="tabPidTuning" class="tabicon ic_pid" i18n_title="tabPidTuning"></a>
                            </li>
                            <li class="tab_receiver">
                                <a href="#" i18n="tabReceiver" class="tabicon ic_rx" i18n_title="tabReceiver"></a>
                            </li>
                            <li class="tab_auxiliary">
                                <a href="#" i18n="tabAuxiliary" class="tabicon ic_modes" i18n_title="tabAuxiliary"></a>
                            </li>
                            <li class="tab_adjustments" v-show="expertMode">
                                <a
                                    href="#"
                                    i18n="tabAdjustments"
                                    class="tabicon ic_adjust"
                                    i18n_title="tabAdjustments"
                                ></a>
                            </li>
                            <li
                                class="tab_servos"
                                v-show="
                                    ['USE_SERVOS', 'USE_WING'].some((opt) => FC.CONFIG?.buildOptions?.includes(opt))
                                "
                            >
                                <a href="#" i18n="tabServos" class="tabicon ic_servo" i18n_title="tabServos"></a>
                            </li>
                            <li class="tab_gps" v-show="FC.CONFIG?.buildOptions?.includes('USE_GPS')">
                                <a href="#" i18n="tabGPS" class="tabicon ic_gps" i18n_title="tabGPS"></a>
                            </li>
                            <li class="tab_motors">
                                <a
                                    href="#"
                                    i18n="tabMotorTesting"
                                    class="tabicon ic_motor"
                                    i18n_title="tabMotorTesting"
                                ></a>
                            </li>
                            <li
                                class="tab_osd"
                                v-show="
                                    FC.FEATURE_CONFIG?.features?.isEnabled &&
                                    FC.FEATURE_CONFIG.features.isEnabled('OSD')
                                "
                            >
                                <a href="#" i18n="tabOsd" class="tabicon ic_osd" i18n_title="tabOsd"></a>
                            </li>
                            <li class="tab_vtx">
                                <a href="#" i18n="tabVtx" class="tabicon ic_vtx" i18n_title="tabVtx"></a>
                            </li>
                            <li
                                class="tab_transponder"
                                v-show="
                                    FC.FEATURE_CONFIG?.features?.isEnabled &&
                                    FC.FEATURE_CONFIG.features.isEnabled('TRANSPONDER')
                                "
                            >
                                <a
                                    href="#"
                                    i18n="tabTransponder"
                                    class="tabicon ic_transponder"
                                    i18n_title="tabTransponder"
                                ></a>
                            </li>
                            <li
                                class="tab_led_strip"
                                v-show="
                                    FC.FEATURE_CONFIG?.features?.isEnabled &&
                                    FC.FEATURE_CONFIG.features.isEnabled('LED_STRIP')
                                "
                            >
                                <a href="#" i18n="tabLedStrip" class="tabicon ic_led" i18n_title="tabLedStrip"></a>
                            </li>
                            <li class="tab_sensors" v-show="expertMode">
                                <a
                                    href="#"
                                    i18n="tabRawSensorData"
                                    class="tabicon ic_sensors"
                                    i18n_title="tabRawSensorData"
                                ></a>
                            </li>
                            <li class="tab_logging" v-show="expertMode">
                                <a href="#" i18n="tabLogging" class="tabicon ic_log" i18n_title="tabLogging"></a>
                            </li>
                            <li class="tab_onboard_logging">
                                <a
                                    href="#"
                                    i18n="tabOnboardLogging"
                                    class="tabicon ic_data"
                                    i18n_title="tabOnboardLogging"
                                ></a>
                            </li>
                        </ul>
                        <ul class="mode-connected mode-connected-cli">
                            <li class="tab_cli">
                                <a href="#" i18n="tabCLI" class="tabicon ic_cli" i18n_title="tabCLI"></a>
                            </li>
                        </ul>
                        <ul class="mode-loggedin">
                            <li class="tab_backups">
                                <a href="#" i18n="tabBackups" class="tabicon ic_data" i18n_title="tabBackups"></a>
                            </li>
                            <li class="tab_user_profile">
                                <a
                                    href="#"
                                    i18n="tabUserProfile"
                                    class="tabicon ic_user"
                                    i18n_title="tabUserProfile"
                                ></a>
                            </li>
                        </ul>
                    </div>
                    <user-session></user-session>
                    <div class="clear-both"></div>
                </div>
                <div id="content"></div>
            </div>
            <status-bar
                :port-usage-down="PortUsage.port_usage_down"
                :port-usage-up="PortUsage.port_usage_up"
                :connection-timestamp="CONNECTION.timestamp"
                :packet-error="MSP.packet_error"
                :i2c-error="FC.CONFIG.i2cError"
                :cycle-time="FC.CONFIG.cycleTime"
                :cpu-load="FC.CONFIG.cpuload"
                :configurator-version="CONFIGURATOR.getDisplayVersion()"
                :firmware-version="FC.CONFIG.flightControllerVersion"
                :firmware-id="FC.CONFIG.flightControllerIdentifier"
                :hardware-id="FC.CONFIG.hardwareName"
            ></status-bar>
            <div id="cache">
                <div class="data-loading">
                    <p i18n="dataWaitingForData">Waiting for data ...</p>
                </div>
            </div>
        </div>
    </UApp>
</template>

<script setup>
import { computed, reactive } from "vue";
import FCModule from "./js/fc.js";
import MSPModule from "./js/msp.js";
import PortHandlerModule from "./js/port_handler.js";
import PortUsageModule from "./js/port_usage.js";
import CONFIGURATORModule from "./js/data_storage.js";

const vm = window.vm ?? {};

const CONFIGURATOR = vm.CONFIGURATOR ?? CONFIGURATORModule;
const FC = vm.FC ?? FCModule;
const MSP = vm.MSP ?? MSPModule;
const PortHandler = vm.PortHandler ?? PortHandlerModule;
const PortUsage = vm.PortUsage ?? PortUsageModule;
const CONNECTION = vm.CONNECTION ?? reactive({ timestamp: null });

const expertMode = computed({
    get() {
        return Boolean(vm.expertMode);
    },
    set(value) {
        vm.expertMode = value;
    },
});
</script>

<style scoped>
@keyframes spin {
    0% {
        transform: rotate(0deg);
    }
    100% {
        transform: rotate(360deg);
    }
}
</style>
