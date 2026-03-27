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
import BuildApi from "./BuildApi";

import { serial } from "./serial.js";
import { EventBus } from "../components/eventBus";
import { ispConnected } from "./utils/connection";
import { unmountVueTab } from "./vue_tab_mounter";
import { useConnectionStore } from "../stores/connection";

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
    document.querySelector("a.connection_button__link")?.addEventListener("click", connectDisconnect);

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
            const connLabel = document.querySelector("div.connection_button__label");
            if (connLabel) {
                connLabel.textContent = i18n.getMessage("connecting");
            }

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
            console.log("Press Ctrl+I to open CLI panel");
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

// Helper to show/hide elements used across this module (extracted to avoid duplicate functions)
function hide(sel) {
    const el = document.querySelector(sel);
    if (el) {
        el.style.display = "none";
    }
}

function show(sel) {
    const el = document.querySelector(sel);
    if (!el) {
        return;
    }
    // Remove inline override; if CSS still hides it, restore the tag's default display
    el.style.removeProperty("display");
    if (globalThis.getComputedStyle(el).display === "none") {
        el.style.display = defaultDisplayForTag(el.tagName);
    }
}

const tagDisplayCache = {};
function defaultDisplayForTag(tag) {
    if (tagDisplayCache[tag]) {
        return tagDisplayCache[tag];
    }
    const tmp = document.createElement(tag);
    document.body.appendChild(tmp);
    tagDisplayCache[tag] = globalThis.getComputedStyle(tmp).display || "block";
    tmp.remove();
    return tagDisplayCache[tag];
}

function finishClose(finishedCallback) {
    const wasConnected = CONFIGURATOR.connectionValid;

    if (semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_46)) {
        // close reset to custom defaults dialog
        document.getElementById("dialogResetToCustomDefaults")?.close();
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
    document.getElementById("dialogReportProblems-closebtn")?.click();

    // unlock port select & baud
    PortHandler.portPickerDisabled = false;

    // reset connect / disconnect button
    document.querySelector("a.connection_button__link")?.classList.remove("active");
    const connLabel = document.querySelector("div.connection_button__label");
    if (connLabel) {
        connLabel.textContent = i18n.getMessage("connect");
        connLabel.classList.remove("active");
    }

    // reset active sensor indicators
    sensor_status();

    if (wasConnected) {
        // Ensure any mounted Vue tab is unmounted before we remove DOM to avoid Vue runtime errors
        try {
            unmountVueTab();
        } catch (e) {
            console.warn("unmountVueTab failed:", e);
        }

        const content = document.getElementById("content");
        if (content) {
            content.innerHTML = "";
        }

        // close cliPanel if left open
        document.querySelector(".dialogInteractive")?.close();
    }

    const pendingTab = GUI.pendingTab;
    GUI.pendingTab = null;
    if (pendingTab === "firmware_flasher") {
        // Clear premature active state set before disconnect started
        document.querySelector("a.firmware_flasher_button__label")?.classList.remove("active");
        document.querySelector("a.firmware_flasher_button__link")?.classList.remove("active");
        document.querySelector("a.firmware_flasher_button__link")?.click();
    } else {
        document.querySelector("#tabs .tab_landing a")?.click();
    }

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
    const connLabel = document.querySelector("div.connection_button__label");
    if (connLabel) {
        connLabel.textContent = i18n.getMessage("connect");
        connLabel.classList.remove("active");
    }
    document.querySelector("a.connection_button__link")?.classList.remove("active");

    clearLiveDataRefreshTimer();

    MSP.clearListeners();

    if (PortHandler.portPicker.selectedPort !== "virtual") {
        serial.removeEventListener("receive", read_serial_adapter);
        serial.removeEventListener("connect", connectHandler);
        serial.removeEventListener("disconnect", disconnectHandler);
    }

    hide("#tabs ul.mode-connected");
    hide("#tabs ul.mode-connected-cli");
    show("#tabs ul.mode-disconnected");

    // header bar
    hide("#sensor-status");
    show("#portsinput");
    hide("#dataflash_wrapper_global");
    hide("#quad-status_wrapper");

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
    const dialog = document.querySelector(".dialogConnectWarning");

    const content = dialog.querySelector(".dialogConnectWarning-content");
    if (content) {
        content.innerHTML = message;
    }
    const closeBtn = dialog.querySelector(".dialogConnectWarning-closebtn");
    if (closeBtn) {
        closeBtn.onclick = () => dialog.close();
    }

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
        const expertCheckbox = document.querySelector('input[name="expertModeCheckbox"]');
        if (expertCheckbox) {
            expertCheckbox.checked = result;
            expertCheckbox.dispatchEvent(new Event("change"));
        }

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

            if (FC.CONFIG.apiVersion.includes("null") || FC.CONFIG.apiVersion === "0.0.0") {
                abortConnection();
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
        const dialog = document.getElementById("dialogResetToCustomDefaults");

        document.getElementById("dialogResetToCustomDefaults-acceptbtn").onclick = function () {
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
        };

        document.getElementById("dialogResetToCustomDefaults-cancelbtn").onclick = function () {
            dialog.close();

            setConnectionTimeout();
            checkReportProblems();
        };

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
        const problemItemTemplate = document.getElementById("dialogReportProblems-listItemTemplate");
        const problemDialogList = document.getElementById("dialogReportProblems-list");

        problemDialogList.innerHTML = "";

        for (const problem of problems) {
            const item = problemItemTemplate.cloneNode(true);
            item.removeAttribute("id");
            item.innerHTML = problem.description;
            problemDialogList.appendChild(item);
        }

        const problemDialog = document.getElementById("dialogReportProblems");
        const closeBtn = document.getElementById("dialogReportProblems-closebtn");
        closeBtn.onclick = () => problemDialog.close();

        problemDialog.showModal();
        problemDialog.scrollTop = 0;
        closeBtn.focus();
    }

    processUid();
}

async function processBuildConfiguration() {
    const buildOptionsSupported = semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45);

    if (buildOptionsSupported) {
        // get build key from firmware
        await MSP.promise(MSPCodes.MSP2_GET_TEXT, mspHelper.crunch(MSPCodes.MSP2_GET_TEXT, MSPCodes.BUILD_KEY));
        gui_log(i18n.getMessage("buildKey", FC.CONFIG.buildKey));

        // firmware 1_45 or higher is required to support cloud build options
        // firmware 1_46 or higher retrieves build options from the flight controller
        if (FC.CONFIG.buildKey.length === 32 && ispConnected() && semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_46)) {
            const buildApi = new BuildApi();
            try {
                const options = await buildApi.requestBuildOptions(FC.CONFIG.buildKey);
                if (options) {
                    FC.CONFIG.buildOptions = options?.request?.options ?? [];
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
    document.querySelector("#tabs .tab_cli a")?.click();
}

function onConnect() {
    const fwLabel = document.querySelector("a.firmware_flasher_button__label");
    const fwLink = document.querySelector("a.firmware_flasher_button__link");

    if (fwLabel?.classList.contains("active") || fwLink?.classList.contains("active")) {
        fwLabel?.classList.remove("active");
        fwLink?.classList.remove("active");
    }

    GUI.timeout_remove("connecting"); // kill connecting timer

    const connLabel = document.querySelector("div.connection_button__label");
    if (connLabel) {
        connLabel.textContent = i18n.getMessage("disconnect");
        connLabel.classList.add("active");
    }
    document.querySelector("a.connection_button__link")?.classList.add("active");

    hide("#tabs ul.mode-disconnected");
    show("#tabs ul.mode-connected-cli");

    // update tab visibility and initialize features/UI on connect
    updateTabVisibility();
    initFeaturesOnConnect();

    hide("#portsinput");
}

// Update which tabs are visible based on `GUI.allowedTabs` and board type
function updateTabVisibility() {
    const connectedItems = document.querySelectorAll("#tabs ul.mode-connected li");
    for (const li of connectedItems) {
        const classes = new Set(li.className.split(/\s+/));
        let found = false;

        for (const value of GUI.allowedTabs) {
            const tabName = `tab_${value}`;
            if (classes.has(tabName)) {
                found = true;
                break;
            }
        }

        if (FC.CONFIG.boardType == 0 && classes.has("osd-required")) {
            found = false;
        }

        li.style.display = found ? "" : "none";
    }
}

// Initialize feature-related UI and fetch configs from the flight controller
function initFeaturesOnConnect() {
    if (FC.CONFIG.flightControllerVersion !== "" && !isCliOnlyMode()) {
        if (!CONFIGURATOR.virtualMode && PortHandler.portPicker.selectedPort !== "virtual") {
            FC.FEATURE_CONFIG.features = new Features(FC.CONFIG);
            FC.BEEPER_CONFIG.beepers = new Beepers(FC.CONFIG);
            FC.BEEPER_CONFIG.dshotBeaconConditions = new Beepers(FC.CONFIG, ["RX_LOST", "RX_SET"]);
        }

        show("#tabs ul.mode-connected");

        MSP.send_message(MSPCodes.MSP_FEATURE_CONFIG, false, false);
        MSP.send_message(MSPCodes.MSP_BATTERY_CONFIG, false, false);
        MSP.send_message(MSPCodes.MSP_BLACKBOX_CONFIG, false, false);
        MSP.send_message(MSPCodes.MSP_DATAFLASH_SUMMARY, false, false);
        MSP.send_message(MSPCodes.MSP_SDCARD_SUMMARY, false, false);

        if (FC.CONFIG.boardType === 0 || FC.CONFIG.boardType === 2) {
            startLiveDataRefreshTimer();
        }

        show("#sensor-status");
        show("#dataflash_wrapper_global");
    }
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
        TABS.cli?.read?.(info);
    } else if (CONFIGURATOR.cliEngineActive) {
        TABS.presets.read(info);
    } else {
        MSP.read(info);
    }
}

export async function update_sensor_status() {
    const statuswrapper = document.getElementById("quad-status_wrapper");

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

        const batteryStatus = document.querySelector(".battery-status");
        if (batteryStatus) {
            if (FC.ANALOG.voltage < min && FC.ANALOG.voltage > NO_BATTERY_VOLTAGE_MAXIMUM) {
                batteryStatus.classList.add("state-empty");
                batteryStatus.classList.remove("state-ok", "state-warning");
                batteryStatus.style.width = "100%";
            } else {
                batteryStatus.style.width = `${((FC.ANALOG.voltage - min) / (max - min)) * 100}%`;

                if (FC.ANALOG.voltage < warn) {
                    batteryStatus.classList.add("state-warning");
                    batteryStatus.classList.remove("state-empty", "state-ok");
                } else {
                    batteryStatus.classList.add("state-ok");
                    batteryStatus.classList.remove("state-warning", "state-empty");
                }
            }
        }
    }

    await MSP.promise(MSPCodes.MSP_BOXNAMES);
    await MSP.promise(MSPCodes.MSP_STATUS_EX);

    const active = performance.now() - FC.ANALOG.last_received_timestamp < 300;
    document.querySelector(".linkicon")?.classList.toggle("active", active);

    for (let i = 0; i < FC.AUX_CONFIG.length; i++) {
        if (FC.AUX_CONFIG[i] === "ARM") {
            document.querySelector(".armedicon")?.classList.toggle("active", bit_check(FC.CONFIG.mode, i));
        }
        if (FC.AUX_CONFIG[i] === "FAILSAFE") {
            document.querySelector(".failsafeicon")?.classList.toggle("active", bit_check(FC.CONFIG.mode, i));
        }
    }

    if (have_sensor(FC.CONFIG.activeSensors, "gps")) {
        await MSP.promise(MSPCodes.MSP_RAW_GPS);
    }

    sensor_status(FC.CONFIG.activeSensors, FC.GPS_DATA.fix);

    if (statuswrapper) {
        statuswrapper.style.display = "";
        if (getComputedStyle(statuswrapper).display === "none") {
            statuswrapper.style.display = "block";
        }
    }
}

async function update_live_status() {
    // Check if live data is paused via Pinia store
    const connectionStore = useConnectionStore();
    if (connectionStore.liveDataPaused) {
        return;
    }

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

export function reinitializeConnection(suppressDialog = false) {
    // Set the reboot timestamp to the current time
    rebootTimestamp = Date.now();

    if (CONFIGURATOR.virtualMode) {
        connectDisconnect();
        if (PortHandler.portPicker.autoConnect) {
            setTimeout(function () {
                document.querySelector("a.connection_button__link")?.click();
            }, 500);
            return rebootTimestamp;
        }
        return rebootTimestamp;
    }

    const currentPort = PortHandler.portPicker.selectedPort;

    // Send reboot command to the flight controller
    MSP.send_message(MSPCodes.MSP_SET_REBOOT, false, false);

    if (currentPort.startsWith("bluetooth") || currentPort === "manual") {
        setTimeout(function () {
            document.querySelector("a.connection_button__link")?.click();
        }, 1500);
        return rebootTimestamp;
    }

    // Show reboot progress modal except for cli and presets tab
    if (["cli", "presets"].includes(GUI.active_tab)) {
        console.log(`${logHead} Rebooting in ${GUI.active_tab} tab, skipping reboot dialog`);
        gui_log(i18n.getMessage("deviceRebooting"));
        gui_log(i18n.getMessage("deviceReady"));

        return rebootTimestamp;
    }
    // Show reboot progress modal
    if (!suppressDialog) {
        showRebootDialog();
    }

    return rebootTimestamp;
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
    // Calculate increment to reach 100% when the timeout elapses (runs every 100ms)
    const progressIncrement = 100 / (REBOOT_CONNECT_MAX_TIME_MS / 100);

    const progressInterval = setInterval(() => {
        progress += progressIncrement;
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
