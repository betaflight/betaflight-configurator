import GUI, { TABS } from "./gui";
import { i18n } from "./localization";
// NOTE: this is a circular dependency, needs investigating
import Features from "./Features";
import MspHelper from "./msp/MSPHelper";
import VirtualFC from "./VirtualFC";
import Beepers from "./Beepers";
import FC from "./fc";
import MSP from "./msp";
import MSPCodes from "./msp/MSPCodes";
import PortUsage from "./port_usage";
import PortHandler from "./port_handler";
import CONFIGURATOR, { API_VERSION_1_45, API_VERSION_1_46, API_VERSION_1_47 } from "./data_storage";
import { bit_check } from "./bit.js";
import { sensor_status, have_sensor } from "./sensor_helpers";
import { update_dataflash_global } from "./update_dataflash_global";
import { gui_log } from "./gui_log";
import { updateTabList } from "./utils/updateTabList";
import { get as getConfig } from "./ConfigStorage";
import { tracking } from "./Analytics";
import semver from "semver";
import CryptoES from "crypto-es";
import $ from "jquery";
import BuildApi from "./BuildApi";

import { serial } from "./serial.js";
import { EventBus } from "../components/eventBus";
import { ispConnected } from "./utils/connection";

const logHead = "[SERIAL-BACKEND]";

let mspHelper;
let connectionTimestamp = null;
let liveDataRefreshTimerId = false;

let isConnected = false;

const REBOOT_CONNECT_MAX_TIME_MS = 10000;
const REBOOT_GRACE_PERIOD_MS = 2000;
let rebootTimestamp = 0;

function isCliOnlyMode() {
    return getConfig("cliOnlyMode")?.cliOnlyMode === true;
}

const toggleStatus = function () {
    isConnected = !isConnected;
};

function connectHandler(event) {
    onOpen(event.detail);
    toggleStatus();
}

function disconnectHandler(event) {
    onClosed(event.detail);
}

export function initializeSerialBackend() {
    $("a.connection_button__link").on("click", connectDisconnect);

    EventBus.$on("port-handler:auto-select-serial-device", function () {
        if (
            (!GUI.connected_to &&
                !GUI.connecting_to &&
                !["cli", "firmware_flasher"].includes(GUI.active_tab) &&
                PortHandler.portPicker.autoConnect &&
                !isCliOnlyMode() &&
                (connectionTimestamp === null || connectionTimestamp > 0)) ||
            Date.now() - rebootTimestamp <= REBOOT_CONNECT_MAX_TIME_MS
        ) {
            connectDisconnect();
        }
    });

    // Using serial and bluetooth we don't know which event we need before we connect
    // Perhaps we should implement a Connection class that handles the connection and events for bluetooth, serial and sockets
    // TODO: use event gattserverdisconnected for save and reboot and device removal.

    serial.addEventListener("removedDevice", (event) => {
        if (event.detail.path === GUI.connected_to) {
            connectDisconnect();
        }
    });

    PortHandler.initialize();
    PortUsage.initialize();
}

async function sendConfigTracking() {
    tracking.sendEvent(tracking.EVENT_CATEGORIES.FLIGHT_CONTROLLER, "Loaded", {
        boardIdentifier: FC.CONFIG.boardIdentifier,
        targetName: FC.CONFIG.targetName,
        boardName: FC.CONFIG.boardName,
        hardware: FC.CONFIG.hardwareName,
        manufacturerId: FC.CONFIG.manufacturerId,
        apiVersion: FC.CONFIG.apiVersion,
        flightControllerVersion: FC.CONFIG.flightControllerVersion,
        flightControllerIdentifier: FC.CONFIG.flightControllerIdentifier,
        mcu: FC.CONFIG.targetName,
        deviceIdentifier: CryptoES.SHA1(FC.CONFIG.deviceIdentifier).toString(),
        buildKey: FC.CONFIG.buildKey,
    });
}

function connectDisconnect() {
    const selectedPort = PortHandler.portPicker.selectedPort;

    if (!GUI.connect_lock && selectedPort !== "noselection" && !selectedPort.path?.startsWith("usb")) {
        // GUI control overrides the user control

        GUI.configuration_loaded = false;

        if (isConnected) {
            // If connected, start disconnection sequence
            GUI.timeout_kill_all();
            GUI.interval_kill_all();
            GUI.tab_switch_cleanup(() => (GUI.tab_switch_in_progress = false));

            function onFinishCallback() {
                finishClose(toggleStatus);
            }

            mspHelper?.setArmingEnabled(true, false, onFinishCallback);
        } else {
            // prevent connection when we do not have permission
            if (selectedPort.startsWith("requestpermission")) {
                return;
            }

            // When rebooting, adhere to the auto-connect setting
            if (!PortHandler.portPicker.autoConnect && Date.now() - rebootTimestamp < REBOOT_GRACE_PERIOD_MS) {
                console.log(`${logHead} Rebooting, not connecting`);
                return;
            }

            const portName = selectedPort === "manual" ? PortHandler.portPicker.portOverride : selectedPort;

            console.log(`${logHead} Connecting to: ${portName}`);
            GUI.connecting_to = portName;

            // lock port select & baud while we are connecting / connected
            PortHandler.portPickerDisabled = true;
            $("div.connection_button__label").text(i18n.getMessage("connecting"));

            // Set up event listeners for non-virtual connections
            if (selectedPort !== "virtual") {
                serial.removeEventListener("connect", connectHandler);
                serial.addEventListener("connect", connectHandler);

                serial.removeEventListener("disconnect", disconnectHandler);
                serial.addEventListener("disconnect", disconnectHandler);
            }

            serial.connect(
                portName,
                { baudRate: PortHandler.portPicker.selectedBauds },
                selectedPort === "virtual" ? onOpenVirtual : undefined,
            );
        }

        // show CLI panel on Control+I
        document.onkeydown = function (e) {
            if (e.code === "KeyI" && e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
                if (
                    serial.connected &&
                    GUI.active_tab !== "cli" &&
                    semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)
                ) {
                    GUI.showCliPanel();
                }
            }
        };
    }
}

function finishClose(finishedCallback) {
    const wasConnected = CONFIGURATOR.connectionValid;

    if (semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_46)) {
        // close reset to custom defaults dialog
        $("#dialogResetToCustomDefaults")[0].close();
    }

    serial.disconnect();

    if (CONFIGURATOR.virtualMode) {
        onClosed(true);
    }

    MSP.disconnect_cleanup();
    PortUsage.reset();
    // To trigger the UI updates by Vue reset the state.
    FC.resetState();

    GUI.connected_to = false;
    GUI.allowedTabs = GUI.defaultAllowedTabsWhenDisconnected.slice();

    // close problems dialog
    $("#dialogReportProblems-closebtn").click();

    // unlock port select & baud
    PortHandler.portPickerDisabled = false;

    // reset connect / disconnect button
    $("a.connection_button__link").removeClass("active");
    $("div.connection_button__label").text(i18n.getMessage("connect"));

    // reset active sensor indicators
    sensor_status();

    if (wasConnected) {
        // detach listeners and remove element data
        $("#content").empty();

        // close cliPanel if left open
        $(".dialogInteractive")[0].close();
    }

    $("#tabs .tab_landing a").click();

    finishedCallback();
}

function setConnectionTimeout() {
    // disconnect after 10 seconds with error if we don't get IDENT data
    GUI.timeout_add(
        "connecting",
        function () {
            if (!CONFIGURATOR.connectionValid) {
                gui_log(i18n.getMessage("noConfigurationReceived"));

                connectDisconnect();
            }
        },
        10000,
    );
}

function resetConnection() {
    // reset connect / disconnect button
    $("div.connection_button__label").text(i18n.getMessage("connect"));
    $("a.connection_button__link").removeClass("active");

    clearLiveDataRefreshTimer();

    MSP.clearListeners();

    if (PortHandler.portPicker.selectedPort !== "virtual") {
        serial.removeEventListener("receive", read_serial_adapter);
        serial.removeEventListener("connect", connectHandler);
        serial.removeEventListener("disconnect", disconnectHandler);
    }

    $("#tabs ul.mode-connected").hide();
    $("#tabs ul.mode-connected-cli").hide();
    $("#tabs ul.mode-disconnected").show();

    // header bar
    $("#sensor-status").hide();
    $("#portsinput").show();
    $("#dataflash_wrapper_global").hide();
    $("#quad-status_wrapper").hide();

    CONFIGURATOR.connectionValid = false;
    CONFIGURATOR.cliValid = false;
    CONFIGURATOR.cliActive = false;
    CONFIGURATOR.cliEngineValid = false;
    CONFIGURATOR.cliEngineActive = false;

    // unlock port select & baud
    PortHandler.portPickerDisabled = false;
}

function abortConnection() {
    GUI.timeout_remove("connecting"); // kill connecting timer

    GUI.connected_to = false;
    GUI.connecting_to = false;

    gui_log(i18n.getMessage("serialPortOpenFail"));

    resetConnection();
}

// Centralized helper: show version mismatch warning and switch to CLI
function showVersionMismatchAndCli(message) {
    const dialog = $(".dialogConnectWarning")[0];

    $(".dialogConnectWarning-content").html(message);
    $(".dialogConnectWarning-closebtn").one("click", () => dialog.close());

    dialog.showModal();

    connectCli();
}

/**
 * purpose of this is to bridge the old and new api
 * when serial events are handled.
 */
function read_serial_adapter(event) {
    read_serial(event.detail.data);
}

function onOpen(openInfo) {
    if (openInfo) {
        CONFIGURATOR.virtualMode = false;

        // update connected_to
        GUI.connected_to = GUI.connecting_to;

        // reset connecting_to
        GUI.connecting_to = false;

        gui_log(i18n.getMessage("serialPortOpened", [PortHandler.portPicker.selectedPort]));

        // reset expert mode
        const result = getConfig("expertMode")?.expertMode ?? false;
        $('input[name="expertModeCheckbox"]').prop("checked", result).trigger("change");

        // serial adds event listener for selected connection type
        serial.removeEventListener("receive", read_serial_adapter);
        serial.addEventListener("receive", read_serial_adapter);

        setConnectionTimeout();
        FC.resetState();
        mspHelper = new MspHelper();
        MSP.listen(mspHelper.process_data.bind(mspHelper));

        console.log(`${logHead} Requesting configuration data`);

        MSP.send_message(MSPCodes.MSP_API_VERSION, false, false, function () {
            gui_log(i18n.getMessage("apiVersionReceived", FC.CONFIG.apiVersion));

            if (FC.CONFIG.apiVersion.includes("null")) {
                abortConnection();
                return;
            }

            if (
                !semver.satisfies(
                    FC.CONFIG.apiVersion,
                    `<=${semver.major(CONFIGURATOR.API_VERSION_MAX_SUPPORTED)}.${semver.minor(CONFIGURATOR.API_VERSION_MAX_SUPPORTED)}`,
                )
            ) {
                showVersionMismatchAndCli(
                    i18n.getMessage("reportProblemsDialogAPI_VERSION_MAX_SUPPORTED", [
                        CONFIGURATOR.getDisplayVersion(),
                        CONFIGURATOR.API_VERSION_MAX_SUPPORTED,
                    ]),
                );
                return;
            }

            if (semver.gte(FC.CONFIG.apiVersion, CONFIGURATOR.API_VERSION_ACCEPTED)) {
                MSP.send_message(MSPCodes.MSP_FC_VARIANT, false, false, function () {
                    if (FC.CONFIG.flightControllerIdentifier === "BTFL") {
                        MSP.send_message(MSPCodes.MSP_FC_VERSION, false, false, function () {
                            gui_log(
                                i18n.getMessage("fcInfoReceived", [
                                    FC.CONFIG.flightControllerIdentifier,
                                    FC.CONFIG.flightControllerVersion,
                                ]),
                            );

                            MSP.send_message(MSPCodes.MSP_BUILD_INFO, false, false, function () {
                                gui_log(i18n.getMessage("buildInfoReceived", [FC.CONFIG.buildInfo]));

                                MSP.send_message(MSPCodes.MSP_BOARD_INFO, false, false, processBoardInfo);
                            });
                        });
                    } else {
                        showVersionMismatchAndCli(
                            i18n.getMessage("firmwareTypeNotSupported", [CONFIGURATOR.API_VERSION_ACCEPTED]),
                        );
                    }
                });
            } else {
                showVersionMismatchAndCli(i18n.getMessage("firmwareUpgradeRequired"));
            }
        });
    } else {
        abortConnection();
    }
}

function onOpenVirtual() {
    GUI.connected_to = GUI.connecting_to;
    GUI.connecting_to = false;

    CONFIGURATOR.connectionValid = true;
    CONFIGURATOR.virtualMode = true;
    CONFIGURATOR.virtualApiVersion = PortHandler.portPicker.virtualMspVersion;

    isConnected = true;

    // Set connection timestamp for virtual connections
    connectionTimestamp = Date.now();
    setTimeout(() => {
        if (globalThis.vm?.CONNECTION) {
            globalThis.vm.CONNECTION.timestamp = connectionTimestamp;
        }
    }, 100);

    mspHelper = new MspHelper();

    VirtualFC.setVirtualConfig();

    processBoardInfo();

    update_dataflash_global();
    sensor_status(FC.CONFIG.activeSensors);
    updateTabList(FC.FEATURE_CONFIG.features);
}

function processCustomDefaults() {
    if (
        bit_check(FC.CONFIG.targetCapabilities, FC.TARGET_CAPABILITIES_FLAGS.SUPPORTS_CUSTOM_DEFAULTS) &&
        bit_check(FC.CONFIG.targetCapabilities, FC.TARGET_CAPABILITIES_FLAGS.HAS_CUSTOM_DEFAULTS) &&
        FC.CONFIG.configurationState === FC.CONFIGURATION_STATES.DEFAULTS_BARE
    ) {
        const dialog = $("#dialogResetToCustomDefaults")[0];

        $("#dialogResetToCustomDefaults-acceptbtn").click(function () {
            const buffer = [];
            buffer.push(mspHelper.RESET_TYPES.CUSTOM_DEFAULTS);
            MSP.send_message(MSPCodes.MSP_RESET_CONF, buffer, false);

            dialog.close();

            GUI.timeout_add(
                "disconnect",
                function () {
                    connectDisconnect(); // disconnect
                },
                0,
            );
        });

        $("#dialogResetToCustomDefaults-cancelbtn").click(function () {
            dialog.close();

            setConnectionTimeout();
            checkReportProblems();
        });

        dialog.showModal();

        GUI.timeout_remove("connecting"); // kill connecting timer
    } else {
        checkReportProblems();
    }
}

function processBoardInfo() {
    gui_log(i18n.getMessage("boardInfoReceived", [FC.CONFIG.hardwareName, FC.CONFIG.boardVersion]));

    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_46)) {
        checkReportProblems();
    } else {
        processCustomDefaults();
    }
}

function checkReportProblem(problemName, problems) {
    if (bit_check(FC.CONFIG.configurationProblems, FC.CONFIGURATION_PROBLEM_FLAGS[problemName])) {
        problems.push({ name: problemName, description: i18n.getMessage(`reportProblemsDialog${problemName}`) });
        return true;
    }
    return false;
}

async function checkReportProblems() {
    await MSP.promise(MSPCodes.MSP_STATUS);

    let needsProblemReportingDialog = false;
    let problems = [];

    // only check for more problems if we are not already aborting
    needsProblemReportingDialog =
        checkReportProblem("MOTOR_PROTOCOL_DISABLED", problems) || needsProblemReportingDialog;

    if (have_sensor(FC.CONFIG.activeSensors, "acc")) {
        needsProblemReportingDialog =
            checkReportProblem("ACC_NEEDS_CALIBRATION", problems) || needsProblemReportingDialog;
    }

    if (needsProblemReportingDialog) {
        const problemItemTemplate = $("#dialogReportProblems-listItemTemplate");
        const problemDialogList = $("#dialogReportProblems-list");

        problemDialogList.empty();

        for (const problem of problems) {
            problemItemTemplate.clone().prop("id", null).html(problem.description).appendTo(problemDialogList);
        }

        const problemDialog = $("#dialogReportProblems")[0];
        $("#dialogReportProblems-closebtn")
            .off("click")
            .one("click", () => problemDialog.close());

        problemDialog.showModal();
        $("#dialogReportProblems").scrollTop(0);
        $("#dialogReportProblems-closebtn").focus();
    }

    processUid();
}

async function processBuildConfiguration() {
    const supported = semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45);

    if (supported) {
        // get build key from firmware
        await MSP.promise(MSPCodes.MSP2_GET_TEXT, mspHelper.crunch(MSPCodes.MSP2_GET_TEXT, MSPCodes.BUILD_KEY));
        gui_log(i18n.getMessage("buildKey", FC.CONFIG.buildKey));

        // firmware 1_45 or higher is required to support cloud build options
        // firmware 1_46 or higher retrieves build options from the flight controller
        if (FC.CONFIG.buildKey.length === 32 && ispConnected()) {
            const buildApi = new BuildApi();
            try {
                let options = await buildApi.requestBuildOptions(FC.CONFIG.buildKey);
                if (options) {
                    FC.CONFIG.buildOptions = options.Request.Options;
                }
            } catch (error) {
                console.error("Failed to request build options: ", error);
            }
        }
    }

    await processCraftName();
}

async function processUid() {
    await MSP.promise(MSPCodes.MSP_UID);

    connectionTimestamp = Date.now();

    // Update the global CONNECTION object for Vue components
    // Use a small delay to ensure the Vue app is mounted
    setTimeout(() => {
        if (globalThis.vm?.CONNECTION) {
            globalThis.vm.CONNECTION.timestamp = connectionTimestamp;
        }
    }, 100);

    gui_log(i18n.getMessage("uniqueDeviceIdReceived", FC.CONFIG.deviceIdentifier));

    await processBuildConfiguration();
    await sendConfigTracking();
}

async function processCraftName() {
    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
        await MSP.promise(MSPCodes.MSP2_GET_TEXT, mspHelper.crunch(MSPCodes.MSP2_GET_TEXT, MSPCodes.CRAFT_NAME));
    } else {
        await MSP.promise(MSPCodes.MSP_NAME);
    }

    gui_log(
        i18n.getMessage(
            "craftNameReceived",
            semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45) ? [FC.CONFIG.craftName] : [FC.CONFIG.name],
        ),
    );

    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
        await MSP.promise(MSPCodes.MSP2_GET_TEXT, mspHelper.crunch(MSPCodes.MSP2_GET_TEXT, MSPCodes.PILOT_NAME));
    }

    FC.CONFIG.armingDisabled = false;
    mspHelper.setArmingEnabled(false, false, setRtc);
}

function setRtc() {
    MSP.send_message(MSPCodes.MSP_SET_RTC, mspHelper.crunch(MSPCodes.MSP_SET_RTC), false, finishOpen);
}

function finishOpen() {
    CONFIGURATOR.connectionValid = true;

    if (isCliOnlyMode()) {
        connectCli();
        return;
    }

    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45) && FC.CONFIG.buildOptions.length) {
        GUI.allowedTabs = Array.from(GUI.defaultAllowedTabs);

        for (const tab of GUI.defaultCloudBuildTabOptions) {
            if (FC.CONFIG.buildOptions.some((opt) => opt.toLowerCase().includes(tab))) {
                GUI.allowedTabs.push(tab);
            }
        }

        // Special case: USE_WING includes servo functionality but doesn't expose USE_SERVOS in build options
        if (FC.CONFIG.buildOptions.some((opt) => opt.includes("USE_WING")) && !GUI.allowedTabs.includes("servos")) {
            GUI.allowedTabs.push("servos");
        }
    } else {
        GUI.allowedTabs = Array.from(GUI.defaultAllowedFCTabsWhenConnected);
    }

    onConnect();

    GUI.selectDefaultTabWhenConnected();
}

function connectCli() {
    CONFIGURATOR.connectionValid = true; // making it possible to open the CLI tab
    GUI.allowedTabs = ["cli"];

    MSP.clearListeners();
    MSP.disconnect_cleanup();

    onConnect();
    $("#tabs .tab_cli a").click();
}

function onConnect() {
    if (
        $("a.firmware_flasher_button__label").hasClass("active") ||
        $("a.firmware_flasher_button__link").hasClass("active")
    ) {
        $("a.firmware_flasher_button__label").removeClass("active");
        $("a.firmware_flasher_button__link").removeClass("active");
    }

    GUI.timeout_remove("connecting"); // kill connecting timer

    $("div.connection_button__label").text(i18n.getMessage("disconnect")).addClass("active");
    $("a.connection_button__link").addClass("active");

    $("#tabs ul.mode-disconnected").hide();
    $("#tabs ul.mode-connected-cli").show();

    // show only appropriate tabs
    $("#tabs ul.mode-connected li").hide();
    $("#tabs ul.mode-connected li")
        .filter(function () {
            const classes = $(this).attr("class").split(/\s+/);
            let found = false;

            $.each(GUI.allowedTabs, (_index, value) => {
                const tabName = `tab_${value}`;
                if ($.inArray(tabName, classes) >= 0) {
                    found = true;
                }
            });

            if (FC.CONFIG.boardType == 0) {
                if (classes.includes("osd-required")) {
                    found = false;
                }
            }

            return found;
        })
        .show();

    if (FC.CONFIG.flightControllerVersion !== "" && !isCliOnlyMode()) {
        FC.FEATURE_CONFIG.features = new Features(FC.CONFIG);
        FC.BEEPER_CONFIG.beepers = new Beepers(FC.CONFIG);
        FC.BEEPER_CONFIG.dshotBeaconConditions = new Beepers(FC.CONFIG, ["RX_LOST", "RX_SET"]);

        $("#tabs ul.mode-connected").show();

        MSP.send_message(MSPCodes.MSP_FEATURE_CONFIG, false, false);
        MSP.send_message(MSPCodes.MSP_BATTERY_CONFIG, false, false);
        MSP.send_message(MSPCodes.MSP_BLACKBOX_CONFIG, false, false);
        MSP.send_message(MSPCodes.MSP_DATAFLASH_SUMMARY, false, false);
        MSP.send_message(MSPCodes.MSP_SDCARD_SUMMARY, false, false);

        if (FC.CONFIG.boardType === 0 || FC.CONFIG.boardType === 2) {
            startLiveDataRefreshTimer();
        }

        $("#sensor-status").show();
        $("#dataflash_wrapper_global").show();
    }

    $("#portsinput").hide();
}

function onClosed(result) {
    gui_log(i18n.getMessage(result ? "serialPortClosedOk" : "serialPortClosedFail"));

    // Clear connection timestamp
    connectionTimestamp = null;
    setTimeout(() => {
        if (globalThis.vm?.CONNECTION) {
            globalThis.vm.CONNECTION.timestamp = null;
        }
    }, 100);

    console.log(`${logHead} Connection closed:`, result);

    resetConnection();
}

export function read_serial(info) {
    if (CONFIGURATOR.cliActive) {
        MSP.clearListeners();
        MSP.disconnect_cleanup();
        TABS.cli.read(info);
    } else if (CONFIGURATOR.cliEngineActive) {
        TABS.presets.read(info);
    } else {
        MSP.read(info);
    }
}

export async function update_sensor_status() {
    const statuswrapper = $("#quad-status_wrapper");

    await MSP.promise(MSPCodes.MSP_ANALOG);
    await MSP.promise(MSPCodes.MSP_BATTERY_STATE);

    if (FC.ANALOG !== undefined) {
        let nbCells = Math.floor(FC.ANALOG.voltage / FC.BATTERY_CONFIG.vbatmaxcellvoltage) + 1;

        if (FC.ANALOG.voltage == 0) {
            nbCells = 1;
        }

        const min = FC.BATTERY_CONFIG.vbatmincellvoltage * nbCells;
        const max = FC.BATTERY_CONFIG.vbatmaxcellvoltage * nbCells;
        const warn = FC.BATTERY_CONFIG.vbatwarningcellvoltage * nbCells;
        const NO_BATTERY_VOLTAGE_MAXIMUM = 1.8; // Maybe is better to add a call to MSP_BATTERY_STATE but is not available for all versions

        if (FC.ANALOG.voltage < min && FC.ANALOG.voltage > NO_BATTERY_VOLTAGE_MAXIMUM) {
            $(".battery-status").addClass("state-empty").removeClass("state-ok").removeClass("state-warning");
            $(".battery-status").css({ width: "100%" });
        } else {
            $(".battery-status").css({ width: `${((FC.ANALOG.voltage - min) / (max - min)) * 100}%` });

            if (FC.ANALOG.voltage < warn) {
                $(".battery-status").addClass("state-warning").removeClass("state-empty").removeClass("state-ok");
            } else {
                $(".battery-status").addClass("state-ok").removeClass("state-warning").removeClass("state-empty");
            }
        }
    }

    await MSP.promise(MSPCodes.MSP_BOXNAMES);
    await MSP.promise(MSPCodes.MSP_STATUS_EX);

    const active = performance.now() - FC.ANALOG.last_received_timestamp < 300;
    $(".linkicon").toggleClass("active", active);

    for (let i = 0; i < FC.AUX_CONFIG.length; i++) {
        if (FC.AUX_CONFIG[i] === "ARM") {
            $(".armedicon").toggleClass("active", bit_check(FC.CONFIG.mode, i));
        }
        if (FC.AUX_CONFIG[i] === "FAILSAFE") {
            $(".failsafeicon").toggleClass("active", bit_check(FC.CONFIG.mode, i));
        }
    }

    if (have_sensor(FC.CONFIG.activeSensors, "gps")) {
        await MSP.promise(MSPCodes.MSP_RAW_GPS);
    }

    sensor_status(FC.CONFIG.activeSensors, FC.GPS_DATA.fix);

    statuswrapper.show();
}

async function update_live_status() {
    // cli or presets tab do not use MSP connection
    if (GUI.active_tab !== "cli" && GUI.active_tab !== "presets") {
        await update_sensor_status();
    }
}

function clearLiveDataRefreshTimer() {
    if (liveDataRefreshTimerId) {
        clearInterval(liveDataRefreshTimerId);
        liveDataRefreshTimerId = false;
    }
}

function startLiveDataRefreshTimer() {
    // live data refresh
    clearLiveDataRefreshTimer();
    liveDataRefreshTimerId = setInterval(update_live_status, 250);
}

export function reinitializeConnection() {
    if (CONFIGURATOR.virtualMode) {
        connectDisconnect();
        if (PortHandler.portPicker.autoConnect) {
            return setTimeout(function () {
                $("a.connection_button__link").trigger("click");
            }, 500);
        }
    }

    const currentPort = PortHandler.portPicker.selectedPort;

    // Set the reboot timestamp to the current time
    rebootTimestamp = Date.now();

    // Send reboot command to the flight controller
    MSP.send_message(MSPCodes.MSP_SET_REBOOT, false, false);

    if (currentPort.startsWith("bluetooth") || currentPort === "manual") {
        return setTimeout(function () {
            $("a.connection_button__link").trigger("click");
        }, 1500);
    }

    // Show reboot progress modal except for cli and presets tab
    if (["cli", "presets"].includes(GUI.active_tab)) {
        console.log(`${logHead} Rebooting in ${GUI.active_tab} tab, skipping reboot dialog`);
        gui_log(i18n.getMessage("deviceRebooting"));
        gui_log(i18n.getMessage("deviceReady"));

        return;
    }
    // Show reboot progress modal
    showRebootDialog();
}

function showRebootDialog() {
    gui_log(i18n.getMessage("deviceRebooting"));

    // Show reboot progress modal
    const rebootDialog = document.getElementById("rebootProgressDialog") || createRebootProgressDialog();
    rebootDialog.querySelector(".reboot-progress-bar").style.width = "0%";
    rebootDialog.querySelector(".reboot-status").textContent = i18n.getMessage("rebootFlightController");
    rebootDialog.showModal();

    // Update progress during reboot
    let progress = 0;
    const progressInterval = setInterval(() => {
        progress += 5;
        if (progress <= 100) {
            rebootDialog.querySelector(".reboot-progress-bar").style.width = `${progress}%`;
        }
    }, 100);

    // Check for successful connection every 100ms with a timeout
    const connectionCheckInterval = setInterval(() => {
        const connectionCheckTimeoutReached = Date.now() - rebootTimestamp > REBOOT_CONNECT_MAX_TIME_MS;
        const noSerialReconnect = !PortHandler.portPicker.autoConnect && PortHandler.portAvailable;

        if (CONFIGURATOR.connectionValid || connectionCheckTimeoutReached || noSerialReconnect) {
            clearInterval(connectionCheckInterval);
            clearInterval(progressInterval);

            rebootDialog.querySelector(".reboot-progress-bar").style.width = "100%";
            rebootDialog.querySelector(".reboot-status").textContent = i18n.getMessage("rebootFlightControllerReady");

            // Close the dialog after showing "ready" message briefly
            setTimeout(() => {
                rebootDialog.close();
            }, 1000);

            if (connectionCheckTimeoutReached) {
                console.log(`${logHead} Reboot timeout reached`);
            } else {
                gui_log(i18n.getMessage("deviceReady"));
            }
        }
    }, 100);

    // Helper function to create the reboot dialog if it doesn't exist
    function createRebootProgressDialog() {
        const dialog = document.createElement("dialog");
        dialog.id = "rebootProgressDialog";
        dialog.className = "dialogReboot";

        dialog.innerHTML = `
            <div class="content">
                <div class="reboot-status">${i18n.getMessage("rebootFlightController")}</div>
                <div class="reboot-progress-container">
                    <div class="reboot-progress-bar"></div>
                </div>
            </div>
        `;

        document.body.appendChild(dialog);

        // Add styles if not already defined
        if (!document.getElementById("rebootProgressStyle")) {
            const style = document.createElement("style");
            style.id = "rebootProgressStyle";
            style.textContent = `
                .dialogReboot {
                    border: 1px solid #3f4241;
                    border-radius: 5px;
                    background-color: #2d3233;
                    color: #fff;
                    padding: 20px;
                    max-width: 400px;
                }
                .reboot-progress-container {
                    width: 100%;
                    background-color: #424546;
                    border-radius: 3px;
                    margin: 15px 0 5px;
                    height: 10px;
                }
                .reboot-progress-bar {
                    height: 100%;
                    background-color: #ffbb00;
                    border-radius: 3px;
                    transition: width 0.1s ease-in-out;
                    width: 0%;
                }
                .reboot-status {
                    text-align: center;
                    margin: 10px 0;
                }
            `;
            document.head.appendChild(style);
        }

        return dialog;
    }
}
