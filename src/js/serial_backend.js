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
import { have_sensor } from "./sensor_helpers";
import { gui_log } from "./gui_log";
import { updateTabList } from "./utils/updateTabList";
import { applyExpertMode } from "./utils/applyExpertMode";
import { get as getConfig } from "./ConfigStorage";
import { tracking } from "./Analytics";
import semver from "semver";
import CryptoES from "crypto-es";
import BuildApi from "./BuildApi";

import { serial } from "./serial.js";
import { getConnectionFsm, Event as FsmEvent } from "./connection_fsm.js";
import { EventBus } from "../components/eventBus";
import { ispConnected } from "./utils/connection";
import { unmountVueTab } from "./vue_tab_mounter";
import { switchTab } from "./tab_switch";
import { useConnectionStore } from "../stores/connection";
import { useDialogStore } from "../stores/dialog";

const logHead = "[SERIAL-BACKEND]";

let mspHelper;
let connectionTimestamp = null;
let liveDataRefreshTimerId = false;
// Handle for the BLE/manual reboot flush-timeout / reconnect-retry chain (rebootReconnect).
// Tracked so an intentional disconnect during the reboot window can cancel it — otherwise the
// retry would resurrect a connection the user just cancelled.
let rebootReconnectTimerId = false;
// Handles for the reboot progress modal's intervals, tracked so closeRebootDialog() can dismiss
// the modal (and stop its timers) when a user disconnect cancels the reboot.
let rebootDialogProgressTimerId = false;
let rebootDialogCheckTimerId = false;

// S4: the transport-open flag formerly stored here as `isConnected` now lives in
// the FSM — read via `getConnectionFsm().linkOpen`, mutated via setLinkOpen/
// toggleLinkOpen. Kept as a local read-through helper so the call sites stay terse.
const isConnected = () => getConnectionFsm().linkOpen;

// True while an intentional disconnect (Disconnect button, or removed-device toggle)
// is in flight. finishClose() owns the full teardown in that case; onClosed() uses this
// S4: the intentional-disconnect flag — telling an intentional disconnect apart
// from an unexpected one (unplug / FC reboot / BLE drop) so we don't tear down
// twice — now lives in the FSM (getConnectionFsm().markIntentionalDisconnect /
// clearIntentionalDisconnect / consumeIntentionalDisconnect). Set in
// prepareDisconnect(), cleared on connect, consumed (read-and-reset) in onClosed().

const REBOOT_CONNECT_MAX_TIME_MS = 10000;
// BLE/manual links usually survive an FC reboot (the radio stays connected while only the
// MCU restarts), so no disconnect event fires and we must drive the disconnect/reconnect
// cycle ourselves. Wait for the reboot command to flush before dropping the stale link,
// then retry reconnecting on this cadence until the FC answers or the reboot window closes.
const REBOOT_FLUSH_DELAY_MS = 1500;
const REBOOT_RECONNECT_RETRY_MS = 1000;
let rebootTimestamp = 0;

function isCliOnlyMode() {
    return getConfig("cliOnlyMode")?.cliOnlyMode === true;
}

const toggleStatus = function () {
    // S4: transport-open flag now lives in the FSM (was module-private isConnected).
    getConnectionFsm().toggleLinkOpen();
};

function connectHandler(event) {
    onOpen(event.detail);
    // Only flip the connected flag when the port actually opened. A failed open
    // (event.detail falsy) runs abortConnection inside onOpen; toggling here too would
    // leave isConnected out of sync with the real state and break reconnect retries.
    if (event.detail) {
        toggleStatus();
    }
}

function disconnectHandler(event) {
    onClosed(event.detail);
}

export function initializeSerialBackend() {
    // Exposed via EventBus so modules that can't import serial_backend directly
    // (notably gui.js, which is on the other side of an import cycle) can still
    // request a connect/disconnect toggle.
    // Connect/disconnect and reboot are now invoked directly: callers import
    // connectDisconnect / reinitializeConnection from this module (useCli, OsdTab,
    // useReboot, MSPHelper) or, where a static import would cycle (stores/connection),
    // via a dynamic import. The former "connection:toggle" / "reboot:request"
    // EventBus indirection (a workaround for gui.js not being able to import this
    // module) is gone — gui.js no longer owns any connection action.

    EventBus.$on("port-handler:auto-select-serial-device", function () {
        if (
            !GUI.connected_to &&
            !GUI.connecting_to &&
            !["cli", "firmware_flasher"].includes(GUI.active_tab) &&
            PortHandler.portPicker.autoConnect &&
            !isCliOnlyMode() &&
            (connectionTimestamp === null || connectionTimestamp > 0)
        ) {
            // S2/S6 flip (serial/Tauri path): if a reboot froze a reconnect token,
            // resolve it to the device's CURRENT path before auto-connecting, so a
            // CDC re-enumeration that changed the OS path (/dev/ttyACM0 -> ACM1,
            // COM3 -> COM5) reconnects to the right device instead of the stale
            // pinned path. No-op when no token is frozen (normal auto-connect).
            const token = getConnectionFsm().getReconnectToken();
            const resolved = token ? serial.resolveReconnectTarget?.(token) : null;
            if (resolved) {
                PortHandler.portPicker.selectedPort = resolved;
            }
            connectDisconnect();
        }
    });

    // Using serial and bluetooth we don't know which event we need before we connect
    // Perhaps we should implement a Connection class that handles the connection and events for bluetooth, serial and sockets
    // TODO: use event gattserverdisconnected for save and reboot and device removal.

    serial.addEventListener("removedDevice", (event) => {
        // event.detail.path is now a stable per-device id (WebSerial: "serial_N"),
        // so this match is device-specific: removing device A no longer triggers a
        // disconnect when device B is the connected one.
        if (event.detail?.path && event.detail.path === GUI.connected_to) {
            connectDisconnect();
        }
    });

    PortHandler.initialize();
    PortUsage.initialize();

    // On page unload (refresh / tab close) close the serial port so the FC
    // gets a clean disconnect and reconnection works without a physical replug.
    // S5: unconditional shutdown — ungated by isConnected/connect_lock. A page
    // unload mid-reconnect (loop still running) or while the flasher holds the
    // lock must still cancel the loop, stop timers and force-close the transport,
    // otherwise the FC is left holding a half-open port until a physical replug.
    window.addEventListener("pagehide", () => {
        console.log(`${logHead} Page unloading — shutting down connection FSM and force-closing transport`);
        getConnectionFsm().shutdown();
        stopRebootReconnect();
        closeRebootDialog();
        serial.forceClose();
    });
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

function stopRebootReconnect() {
    if (rebootReconnectTimerId !== false) {
        // The id may be a timeout (flush phase) or an interval (retry phase); clear both — they
        // share an id space and clearing the wrong kind is harmless.
        clearTimeout(rebootReconnectTimerId);
        clearInterval(rebootReconnectTimerId);
        rebootReconnectTimerId = false;
    }
}

// Dismiss the reboot progress modal and stop its timers. Called when a user disconnect cancels
// the reboot (otherwise the modal would linger until its own 10s timeout), and at the start of
// showRebootDialog() to clear any stale modal/intervals from a prior reboot.
function closeRebootDialog() {
    if (rebootDialogProgressTimerId !== false) {
        clearInterval(rebootDialogProgressTimerId);
        rebootDialogProgressTimerId = false;
    }
    if (rebootDialogCheckTimerId !== false) {
        clearInterval(rebootDialogCheckTimerId);
        rebootDialogCheckTimerId = false;
    }
    document.getElementById("rebootProgressDialog")?.close();
}

function prepareDisconnect() {
    // Mark this as an intentional disconnect so the later protocol "disconnect" event
    // (handled by onClosed) does not run the unexpected-disconnect teardown on top of
    // finishClose(). Covers both the Disconnect button and the removedDevice route.
    getConnectionFsm().markIntentionalDisconnect();

    // Cancel any in-flight reboot reconnect so a user-initiated disconnect during the reboot
    // window is not undone by a retry. (The reboot retry itself reconnects via beginConnect,
    // which does not pass through here, so the loop is unaffected.)
    stopRebootReconnect();

    // A user disconnect ends any reconnect-in-progress window: clear the pin so selectActivePort()
    // resumes normal fallback behavior (the user is no longer waiting for the rebooted device).
    PortHandler.pinnedReconnectTarget = null;

    GUI.configuration_loaded = false;
    GUI.timeout_kill_all();
    GUI.interval_kill_all();
    GUI.tab_switch_cleanup(() => (GUI.tab_switch_in_progress = false));
}

function beginDisconnect() {
    prepareDisconnect();

    // A user-initiated disconnect during the reboot window must also dismiss the reboot modal —
    // prepareDisconnect() only stops the reconnect timers. (disconnectForReboot does NOT close it:
    // the modal must stay up while the reboot's own reconnect runs.)
    closeRebootDialog();

    // A user disconnect aborts any in-flight reboot in the FSM read-model.
    // (disconnectForReboot is mid-reboot and deliberately does NOT conclude.)
    getConnectionFsm().concludeReboot(false);

    mspHelper?.setArmingEnabled(true, false, function () {
        finishClose(toggleStatus);
    });
}

// Disconnect when the FC is rebooting: identical to beginDisconnect but WITHOUT the
// setArmingEnabled MSP round-trip, which would hang waiting for a response the rebooting
// FC cannot send. Tears the (now-stale) connection down directly.
function disconnectForReboot() {
    prepareDisconnect();
    finishClose(toggleStatus);
}

// Explicit disconnect entry point. Safer than `connectDisconnect()` for
// callers that know they want to disconnect, because it does not flip back to
// "connect" if `isConnected` has already been toggled off (e.g. when the UI
// state still shows "connected" but the internal flag just changed).
export function disconnect() {
    if (GUI.connect_lock || !isConnected()) {
        return;
    }
    beginDisconnect();
}

function canStartConnectionAction(selectedPort) {
    return !GUI.connect_lock && selectedPort !== "noselection" && !selectedPort.path?.startsWith("usb");
}

function beginConnect(selectedPort) {
    // Clear the intentional-disconnect guard on every connect attempt. A protocol whose
    // disconnect() short-circuits (e.g. WebBluetooth when closeRequested is already set)
    // may never dispatch the "disconnect" event that would otherwise consume the flag, so
    // resetting here keeps a stale flag from downgrading a later unexpected disconnect.
    getConnectionFsm().clearIntentionalDisconnect();

    // prevent connection when we do not have permission
    if (selectedPort.startsWith("requestpermission")) {
        return;
    }

    const portName = selectedPort === "manual" ? PortHandler.portPicker.portOverride : selectedPort;

    console.log(`${logHead} Connecting to: ${portName}`);
    GUI.connecting_to = portName;

    // lock port select & baud while we are connecting / connected
    PortHandler.portPickerDisabled = true;

    // Safety net for the pre-open phase: some protocols (e.g. a ws:// endpoint that errors
    // before onopen) never emit a "connect" event, so onOpen never runs to clear connecting_to
    // and the Connect button would spin forever. If the attempt neither opens nor becomes valid
    // within the window, recover the UI and tell the user. The disconnect-during-connect path in
    // onClosed normally handles this sooner; this covers protocols that signal nothing at all.
    GUI.timeout_add(
        "connectAttempt",
        function () {
            if (GUI.connecting_to && !CONFIGURATOR.connectionValid) {
                abortConnection("connectionFailed");
            }
        },
        10000,
    );

    // Set up event listeners for non-virtual connections
    if (selectedPort !== "virtual") {
        serial.removeEventListener("connect", connectHandler);
        serial.addEventListener("connect", connectHandler);

        serial.removeEventListener("disconnect", disconnectHandler);
        serial.addEventListener("disconnect", disconnectHandler);

        // S3: a connect attempt begins. IDLE -> CONNECTING; during a reboot the
        // FSM is RECONNECTING -> CONNECTING. Readiness (finishOpen/connectCli)
        // advances it to CONNECTED/CLI. (virtual dispatches its own in onOpenVirtual.)
        getConnectionFsm().dispatch(FsmEvent.CONNECT);
    }

    serial.connect(
        portName,
        { baudRate: PortHandler.portPicker.selectedBauds },
        selectedPort === "virtual" ? onOpenVirtual : undefined,
    );
    console.log("Press Ctrl+I to open CLI panel");
}

function isCliHotkey(e) {
    return e.code === "KeyI" && e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey;
}

function registerCliHotkey() {
    document.onkeydown = function (e) {
        if (!isCliHotkey(e)) {
            return;
        }
        if (serial.connected && GUI.active_tab !== "cli" && semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
            GUI.showCliPanel();
        }
    };
}

export function connectDisconnect() {
    if (GUI.connect_lock) {
        return;
    }

    // S8: the flasher owns the port while FLASHING; hard-block connect/disconnect
    // (defence-in-depth alongside connect_lock, for flows that grab the raw port).
    // FLASHING is cleared by the flasher's exits and, as a safety net, by
    // resetConnection — so a post-flash reconnect is never blocked.
    if (getConnectionFsm().isFlashing) {
        console.log(`${logHead} connect/disconnect ignored — flashing in progress`);
        return;
    }

    // GUI control overrides the user control
    GUI.configuration_loaded = false;

    if (isConnected()) {
        beginDisconnect();
    } else {
        const selectedPort = PortHandler.portPicker.selectedPort;
        if (!canStartConnectionAction(selectedPort)) {
            return;
        }
        beginConnect(selectedPort);
    }

    registerCliHotkey();
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

// Shared connection-scoped UI teardown, run by BOTH the intentional disconnect
// (finishClose) and the unexpected disconnect (finishUnexpectedDisconnect) paths so the
// two cannot drift. Deliberately scoped to the steps finishClose adds on top of
// resetConnection() — it must NOT repeat resetConnection's work (listeners,
// connectionValid/cli flags, live-data timer, portPickerDisabled).
function teardownConnectionUi() {
    MSP.disconnect_cleanup();
    PortUsage.reset();
    // To trigger the UI updates by Vue reset the state.
    FC.resetState();

    GUI.connected_to = false;
    GUI.allowedTabs = GUI.defaultAllowedTabsWhenDisconnected.slice();
    // Release any in-progress operation lock (OSD save / flashing). The disconnect
    // invalidates that operation, and switchTab is silently rejected while the lock is
    // held — which would otherwise leave a blank content area after unmountVueTab().
    GUI.connect_lock = false;

    // Clear the active root-mounted tab before navigation selects the next one.
    try {
        unmountVueTab();
    } catch (e) {
        console.warn("unmountVueTab failed:", e);
    }

    // allowedTabs (set above) must already include "landing"/"firmware_flasher" before this,
    // or switchTab silently rejects the disconnected tab.
    const pendingTab = GUI.pendingTab;
    GUI.pendingTab = null;
    if (pendingTab === "firmware_flasher") {
        switchTab("firmware_flasher", { mode: "disconnected" });
    } else {
        switchTab("landing", { mode: "disconnected" });
    }
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

    // close problems dialog
    document.getElementById("dialogReportProblems-closebtn")?.click();

    // unlock port select & baud
    PortHandler.portPickerDisabled = false;

    if (wasConnected) {
        // close cliPanel if left open; dismiss Pinia dialogs (e.g. InteractiveDialog, or
        // InformationDialog from showVersionMismatchAndCli) so disconnect does not leave a modal open
        const dialogStore = useDialogStore();
        const activeType = dialogStore.activeDialog?.type;
        if (activeType === "InteractiveDialog" || activeType === "InformationDialog") {
            dialogStore.close();
        }
    }

    teardownConnectionUi();

    finishedCallback();
}

// Complete the teardown for an UNEXPECTED disconnect (cable unplug / FC reboot / BLE drop).
// finishClose() is never reached on this path because the protocol only emits a "disconnect"
// event (no "removedDevice") for BLE/Capacitor/WebSocket/TCP. Deliberately does NOT call
// mspHelper.setArmingEnabled — the link is already gone, so that MSP callback would never fire.
function finishUnexpectedDisconnect() {
    // Mirror the toggleStatus that finishClose runs via finishedCallback for intentional
    // disconnects. Reset before the UI teardown so a late removedDevice cannot re-enter
    // connectDisconnect() against a still-"connected" state.
    getConnectionFsm().setLinkOpen(false);

    teardownConnectionUi();
}

function setConnectionTimeout() {
    // disconnect after 10 seconds with error if we don't get IDENT data
    GUI.timeout_add(
        "connecting",
        function () {
            if (!CONFIGURATOR.connectionValid) {
                gui_log(i18n.getMessage("noConfigurationReceived"));

                // S3: bounded HANDSHAKING timeout — the FC opened the link but
                // never completed the MSP chain. HANDSHAKING -> FAILED; the
                // disconnect below tears it down (-> onClosed -> notifyClosed -> IDLE).
                getConnectionFsm().dispatch(FsmEvent.FAIL);
                connectDisconnect();
            }
        },
        10000,
    );
}

function resetConnection() {
    clearLiveDataRefreshTimer();

    // S8 safety net: any normal teardown clears a lingering FLASHING state, so the
    // hard-block above can never strand a post-flash reconnect even if a flasher
    // exit path missed its endFlashing().
    getConnectionFsm().endFlashing();

    MSP.clearListeners();

    if (PortHandler.portPicker.selectedPort !== "virtual") {
        serial.removeEventListener("receive", read_serial_adapter);
        serial.removeEventListener("connect", connectHandler);
        serial.removeEventListener("disconnect", disconnectHandler);
    }

    hide("#tabs ul.mode-connected");
    hide("#tabs ul.mode-connected-cli");
    show("#tabs ul.mode-disconnected");

    CONFIGURATOR.connectionValid = false;
    CONFIGURATOR.cliValid = false;
    CONFIGURATOR.cliActive = false;

    // unlock port select & baud
    PortHandler.portPickerDisabled = false;
}

function abortConnection(messageKey) {
    GUI.timeout_remove("connecting"); // kill post-open connecting timer
    GUI.timeout_remove("connectAttempt"); // kill pre-open watchdog

    // Default message reflects how far the attempt got: a port that already opened but failed
    // the handshake (e.g. invalid API version) did not "fail to open".
    const message = i18n.getMessage(messageKey ?? (GUI.connected_to ? "connectionFailed" : "serialPortOpenFail"));

    // S3: a failed handshake (invalid/garbage API version) is a HANDSHAKING ->
    // FAILED edge before teardown. notifyClosed (via resetConnection's close path)
    // settles to IDLE.
    getConnectionFsm().dispatch(FsmEvent.FAIL);

    GUI.connected_to = false;
    GUI.connecting_to = false;

    // A failed connect attempt ends any reconnect-in-progress window: clear the pin so
    // selectActivePort() resumes normal fallback rather than staying aimed at a dead target.
    PortHandler.pinnedReconnectTarget = null;

    gui_log(message);
    showConnectionFailedDialog(message);

    resetConnection();
}

// Surface a connection failure to the user with a dismissible dialog, not just a log line
// that is easy to miss. `text` may contain HTML markup (InformationDialog renders it).
function showConnectionFailedDialog(text) {
    const dialogStore = useDialogStore();
    dialogStore.open(
        "InformationDialog",
        {
            title: i18n.getMessage("connectionFailedTitle"),
            text,
            confirmText: i18n.getMessage("close"),
        },
        {
            confirm: () => dialogStore.close(),
        },
    );
}

// Centralized helper: show version mismatch warning and switch to CLI
function showVersionMismatchAndCli(message) {
    const dialogStore = useDialogStore();
    dialogStore.open(
        "InformationDialog",
        {
            title: i18n.getMessage("warningTitle"),
            text: message,
            confirmText: i18n.getMessage("close"),
        },
        {
            confirm: () => dialogStore.close(),
        },
    );

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

        GUI.timeout_remove("connectAttempt"); // port opened — pre-open watchdog no longer needed

        // update connected_to
        GUI.connected_to = GUI.connecting_to;

        // reset connecting_to
        GUI.connecting_to = false;

        // S3: the link is open; the MSP handshake begins now. CONNECTING ->
        // HANDSHAKING. Readiness (finishOpen/connectCli) advances to CONNECTED/CLI;
        // the bounded "connecting" timeout below dispatches FAIL on a stall.
        getConnectionFsm().dispatch(FsmEvent.HANDSHAKE);

        gui_log(i18n.getMessage("serialPortOpened", [PortHandler.portPicker.selectedPort]));

        // reset expert mode
        applyExpertMode(Boolean(getConfig("expertMode")?.expertMode), { persist: false });

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

            // "0.0.0" is the uninitialised default (no valid version received), and any
            // unparseable string (e.g. "null.null.0" from a corrupt/truncated payload)
            // would make the semver.gte() below throw. Reject both robustly instead of
            // matching a specific garbage substring.
            if (FC.CONFIG.apiVersion === "0.0.0" || !semver.valid(FC.CONFIG.apiVersion)) {
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
    GUI.timeout_remove("connectAttempt"); // virtual link is up — pre-open watchdog no longer needed
    GUI.connected_to = GUI.connecting_to;
    GUI.connecting_to = false;

    // S3 readiness edge #3: virtual is ready immediately (no MSP chain).
    // CONNECT then READY so the FSM reaches CONNECTED (FULLY_READY) cleanly.
    const fsm = getConnectionFsm();
    fsm.dispatch(FsmEvent.CONNECT);
    fsm.dispatch(FsmEvent.READY);

    CONFIGURATOR.connectionValid = true;
    CONFIGURATOR.virtualMode = true;
    CONFIGURATOR.virtualApiVersion = PortHandler.portPicker.virtualMspVersion;

    getConnectionFsm().setLinkOpen(true);

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
        const dialogStore = useDialogStore();
        dialogStore.open("ReportProblemsDialog", { problems }, { onClose: () => dialogStore.close() });
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

    // S3 readiness edge #1: full MSP chain complete -> CONNECTED (FULLY_READY).
    getConnectionFsm().dispatch(FsmEvent.READY);

    GUI.selectDefaultTabWhenConnected();
}

function connectCli() {
    CONFIGURATOR.connectionValid = true; // making it possible to open the CLI tab
    GUI.allowedTabs = ["cli"];

    MSP.clearListeners();
    MSP.disconnect_cleanup();

    onConnect();

    // S3 readiness edge #2: CLI-only / version-mismatch session -> CLI (CLI_ONLY).
    getConnectionFsm().dispatch(FsmEvent.CLI_READY);

    switchTab("cli", { mode: "cli" });
}

function onConnect() {
    GUI.timeout_remove("connecting"); // kill connecting timer

    // A connection is now established: any pending save/reboot reconnect has completed, so
    // clear the pin and let selectActivePort() resume its normal fallback behavior.
    PortHandler.pinnedReconnectTarget = null;

    hide("#tabs ul.mode-disconnected");
    show("#tabs ul.mode-connected-cli");

    // update tab visibility and initialize features/UI on connect
    updateTabVisibility();
    initFeaturesOnConnect();
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
    }
}

function onClosed(result) {
    // A "disconnect" that arrives while we are still in the connect phase (onOpen never ran, so
    // the link never became valid) is a *failed connection attempt*, not the loss of an
    // established link — e.g. a ws:// endpoint refused before onopen, which dispatches only
    // "disconnect" and never "connect". Recover the Connect button and tell the user instead of
    // running the established-connection teardown.
    if (GUI.connecting_to && !CONFIGURATOR.connectionValid && !intentionalDisconnect) {
        abortConnection("connectionFailed");
        return;
    }

    gui_log(i18n.getMessage(result ? "serialPortClosedOk" : "serialPortClosedFail"));

    // Clear connection timestamp
    connectionTimestamp = null;
    setTimeout(() => {
        if (globalThis.vm?.CONNECTION) {
            globalThis.vm.CONNECTION.timestamp = null;
        }
    }, 100);

    console.log(`${logHead} Connection closed:`, result);

    // USB/cable disconnect invokes this path (not finishClose). Clear any Pinia modal
    // (e.g. InformationDialog from showVersionMismatchAndCli) so it does not linger.
    useDialogStore().close();

    resetConnection();

    // onClosed runs for BOTH disconnect paths: intentional (finishClose → serial.disconnect()
    // → protocol "disconnect" event, which fires on a later microtask) and unexpected (unplug /
    // FC reboot / BLE drop). Read-and-reset the guard here — it cannot be cleared in finishClose(),
    // which returns before this microtask runs. Intentional disconnects are already fully torn
    // down by finishClose(); for unexpected ones complete the same UI teardown now.
    const wasIntentional = getConnectionFsm().consumeIntentionalDisconnect();
    if (!wasIntentional) {
        finishUnexpectedDisconnect();
    }

    // S4: single teardown convergence point — settle the FSM to IDLE for both
    // intentional and unexpected closes. A reboot's link drop is left alone
    // (notifyClosed ignores REBOOTING/RECONNECTING); its conclude settles it.
    getConnectionFsm().notifyClosed();
}

export function read_serial(info) {
    if (CONFIGURATOR.cliActive) {
        MSP.clearListeners();
        MSP.disconnect_cleanup();
        TABS.cli?.read?.(info);
    } else {
        MSP.read(info);
    }
}

export async function update_sensor_status() {
    await MSP.promise(MSPCodes.MSP_ANALOG);
    await MSP.promise(MSPCodes.MSP_BATTERY_STATE);
    await MSP.promise(MSPCodes.MSP_BOXNAMES);
    await MSP.promise(MSPCodes.MSP_STATUS_EX);

    if (have_sensor(FC.CONFIG.activeSensors, "gps")) {
        await MSP.promise(MSPCodes.MSP_RAW_GPS);
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

    // S2b: record reboot intent in the FSM (single owner of lifecycle state).
    // Observability + soft reentrancy signal during the migration; the actual
    // overlap guard remains stopRebootReconnect() until S4 makes the FSM the
    // authoritative gate. Virtual toggles settle immediately below.
    getConnectionFsm().requestReboot();

    if (CONFIGURATOR.virtualMode) {
        connectDisconnect();
        if (PortHandler.portPicker.autoConnect) {
            setTimeout(function () {
                connectDisconnect();
            }, 500);
            getConnectionFsm().concludeReboot(true);
            return rebootTimestamp;
        }
        getConnectionFsm().concludeReboot(false);
        return rebootTimestamp;
    }

    const currentPort = PortHandler.portPicker.selectedPort;

    // Pin the device we are about to reboot so the reconnect targets it and selectActivePort()
    // does not hijack the selection with the expert-mode virtual/manual fallback while the FC is
    // briefly off the port list. Only pin real device paths — never "virtual"/"manual"/noselection.
    if (currentPort && currentPort !== "noselection" && currentPort !== "virtual") {
        PortHandler.pinnedReconnectTarget = currentPort;

        // S2/S6 flip: freeze a transport-resolvable reconnect TOKEN (not just the
        // display path) while still connected. The retry resolves it to the FC's
        // CURRENT path — so a CDC re-enumeration that changes the OS path
        // (/dev/ttyACM0 -> ACM1, COM3 -> COM5) is followed correctly instead of
        // reconnecting to a stale path. Supersedes the pinned string (kept as a
        // fallback for transports without a token). Captured here because the
        // transport is still open and can report its identity.
        const token = serial.getReconnectToken?.();
        if (token) {
            getConnectionFsm().freezeReconnectToken(token);
        }
    }

    // Send reboot command to the flight controller
    MSP.send_message(MSPCodes.MSP_SET_REBOOT, false, false);

    if (currentPort.startsWith("bluetooth") || currentPort === "manual") {
        // BLE/manual links usually survive the FC reboot — the radio stays connected while
        // only the MCU restarts — so no disconnect event fires and the configurator would be
        // left holding a stale connection. Drive it ourselves: show the reboot dialog, drop
        // the stale link once the command has flushed, then reconnect when Auto-Connect is on.
        // The dialog polls connectionValid and closes on reconnect or timeout (same as serial).
        if (!suppressDialog && !["cli", "presets"].includes(GUI.active_tab)) {
            showRebootDialog();
        }
        rebootReconnect();
        return rebootTimestamp;
    }

    // Show reboot progress modal except for cli and presets tab
    if (["cli", "presets"].includes(GUI.active_tab)) {
        console.log(`${logHead} Rebooting in ${GUI.active_tab} tab, skipping reboot dialog`);
        gui_log(i18n.getMessage("deviceRebooting"));
        gui_log(i18n.getMessage("deviceReady"));

        // No reconnect loop runs here (auto-connect handles it); settle the FSM
        // read-model now. Authoritative readiness wiring lands in S3/S4.
        getConnectionFsm().concludeReboot(false);
        return rebootTimestamp;
    }
    // Show reboot progress modal
    if (!suppressDialog) {
        showRebootDialog();
    }

    return rebootTimestamp;
}

// Drive the disconnect/reconnect cycle for a BLE/manual reboot. The link bounces (or survives)
// as the FC restarts, and no single disconnect event marks "FC ready". Runs whether or not the
// reboot dialog is shown.
function rebootReconnect() {
    // Cancel any prior reboot cycle (e.g. a second Save-and-Reboot within the window) so we
    // never run two overlapping retry loops.
    stopRebootReconnect();

    rebootReconnectTimerId = setTimeout(() => {
        // If the link survived the reboot, drop the now-stale connection so the UI returns to
        // the landing tab instead of sitting on a dead connection. (disconnectForReboot ->
        // prepareDisconnect calls stopRebootReconnect on the already-fired timeout — harmless.)
        if (isConnected()) {
            disconnectForReboot();
        }

        // Honor Auto-Connect — read it live (not snapshotted at reboot start) so toggling it off
        // during the reboot window takes effect. When off, stay on the landing tab and let the
        // user reconnect manually (the reboot dialog closes via its no-reconnect check).
        if (!PortHandler.portPicker.autoConnect) {
            rebootReconnectTimerId = false;
            // No automatic reconnect will run, so end the reconnect-in-progress window and let
            // normal selection (incl. virtual/manual fallback) resume.
            PortHandler.pinnedReconnectTarget = null;
            getConnectionFsm().concludeReboot(false);
            return;
        }

        // Entering the retry phase: REBOOTING -> RECONNECTING in the FSM read-model.
        getConnectionFsm().reconnectStarted();

        // Retry connecting until the rebooted FC answers (connectionValid), the reboot window
        // closes, or Auto-Connect is turned off mid-window. Early attempts may connect to a
        // still-booting FC and get dropped; the device stays listed (we never remove it on
        // disconnect), so a later attempt succeeds once the FC is stable. connectDisconnect here
        // takes the connect branch (isConnected is false).
        rebootReconnectTimerId = setInterval(() => {
            const timedOut = Date.now() - rebootTimestamp > REBOOT_CONNECT_MAX_TIME_MS;
            if (CONFIGURATOR.connectionValid || timedOut || !PortHandler.portPicker.autoConnect) {
                stopRebootReconnect();
                // The reboot window has closed (reconnected, timed out, or auto-connect off):
                // stop treating a reconnect as in progress so normal selection resumes.
                PortHandler.pinnedReconnectTarget = null;
                getConnectionFsm().concludeReboot(CONFIGURATOR.connectionValid);
                return;
            }
            if (!isConnected() && !GUI.connecting_to) {
                // Drain any leftover MSP state from the reboot command (queued resends and
                // their callbacks) before the fresh handshake, so stale reboot-command
                // traffic can't collide with the new connection's request chain.
                MSP.disconnect_cleanup();

                // Aim the reconnect at the originally-connected device, not at whatever
                // selectActivePort may have drifted to while the FC was off the list.
                // S2/S6 flip: prefer resolving the frozen TOKEN to the device's CURRENT
                // path (handles a CDC path change across the reboot); fall back to the
                // pinned display path for transports that supplied no token.
                const token = getConnectionFsm().getReconnectToken();
                const resolved = token ? serial.resolveReconnectTarget?.(token) : null;
                const target = resolved ?? PortHandler.pinnedReconnectTarget;
                if (target) {
                    PortHandler.portPicker.selectedPort = target;
                }
                connectDisconnect();
            }
        }, REBOOT_RECONNECT_RETRY_MS);
    }, REBOOT_FLUSH_DELAY_MS);
}

function showRebootDialog() {
    gui_log(i18n.getMessage("deviceRebooting"));

    // Clear any leftover modal/intervals from a prior reboot before starting a new one.
    closeRebootDialog();

    // Show reboot progress modal
    const rebootDialog = document.getElementById("rebootProgressDialog") || createRebootProgressDialog();
    rebootDialog.querySelector(".reboot-progress-bar").style.width = "0%";
    rebootDialog.querySelector(".reboot-status").textContent = i18n.getMessage("rebootFlightController");
    rebootDialog.showModal();

    // Update progress during reboot
    let progress = 0;
    // Calculate increment to reach 100% when the timeout elapses (runs every 100ms)
    const progressIncrement = 100 / (REBOOT_CONNECT_MAX_TIME_MS / 100);

    rebootDialogProgressTimerId = setInterval(() => {
        progress += progressIncrement;
        if (progress <= 100) {
            rebootDialog.querySelector(".reboot-progress-bar").style.width = `${progress}%`;
        }
    }, 100);

    // Check for successful connection every 100ms with a timeout
    rebootDialogCheckTimerId = setInterval(() => {
        const connectionCheckTimeoutReached = Date.now() - rebootTimestamp > REBOOT_CONNECT_MAX_TIME_MS;
        const noSerialReconnect = !PortHandler.portPicker.autoConnect && PortHandler.portAvailable;

        if (CONFIGURATOR.connectionValid || connectionCheckTimeoutReached || noSerialReconnect) {
            clearInterval(rebootDialogCheckTimerId);
            clearInterval(rebootDialogProgressTimerId);
            rebootDialogCheckTimerId = false;
            rebootDialogProgressTimerId = false;

            // The reboot window has closed (reconnected / timed out / not auto-reconnecting):
            // end the reconnect-in-progress state so normal port selection resumes.
            PortHandler.pinnedReconnectTarget = null;
            getConnectionFsm().concludeReboot(CONFIGURATOR.connectionValid);

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
