/*
 * This file is part of Betaflight.
 *
 * Betaflight is free software. You can redistribute this software
 * and/or modify this software under the terms of the GNU General
 * Public License as published by the Free Software Foundation,
 * either version 3 of the License, or (at your option) any later
 * version.
 *
 * Betaflight is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this software.
 *
 * If not, see <http://www.gnu.org/licenses/>.
 */

import DeviceHandler from "../device_handler";
import { gui_log } from "../gui_log";
import { i18n } from "../localization";
import MspHelper from "../msp/MSPHelper";
import MSP from "../msp";
import MSPCodes from "../msp/MSPCodes";
import GUI from "../gui";
import { serial } from "../serial";
import { MIN_FC_VERSION_FOR_MSP_CLI, isMspCliSupported } from "../../composables/useMspCliSession";
import semver from "semver";
import CONFIGURATOR from "../data_storage";
import { useFlightControllerStore } from "../../stores/fc";

const DEFAULT_COMMAND_TIMEOUT_MS = 2000;
const CONNECT_TIMEOUT_MS = 10000;
const TIMEOUT_NAME = "msp_restore_timeout";
// Time to let the `save` command flush to the FC before we tear down the connection.
const SAVE_FLUSH_MS = 500;

interface CliError {
    command: string;
    error: string;
}

export interface AutoRestoreResult {
    success: boolean;
    /** The failure message, or null on success. */
    errors: string | null;
    /** CLI lines the FC rejected; absent when the restore never connected. */
    skipped?: number;
}

type AutoRestoreCallback = (result: AutoRestoreResult) => void;

class AutoRestore {
    readonly boundHandleConnect = this.handleConnect.bind(this);
    readonly boundHandleDisconnect = this.handleDisconnect.bind(this);
    readonly boundHandleSerialReceive = this.handleSerialReceive.bind(this);
    private _callback: AutoRestoreCallback | null = null;
    private _mspHelper: MspHelper | null = null;
    private _cliLines: string[] | null = null;
    // Count of CLI lines that returned an error (rejected/###ERROR) during restore.
    private _skipped = 0;
    // True while the `save` command is in flight. A `save` reboots the FC, so the
    // resulting disconnect/timeout is expected success, not a failure.
    private _saving = false;

    canAttemptConnection(): boolean {
        if (CONFIGURATOR.virtualMode) {
            gui_log(i18n.getMessage("firmwareFlasherNoValidPort"));
            return false;
        }

        if (serial.connected) {
            console.warn("AutoRestore: Attempting to connect while already connected");
            gui_log(i18n.getMessage("serialPortOpenFail"));
            return false;
        }

        return true;
    }

    handleSerialReceive(event: Event) {
        // MSP.read accepts either the raw bytes or the { data } wrapper, but pass
        // event.detail.data to match the convention used by serial_backend.
        MSP.read((event as CustomEvent).detail.data);
    }

    handleConnect(event: Event) {
        this.onConnect((event as CustomEvent).detail);
    }

    handleDisconnect() {
        // A disconnect while saving means the FC rebooted after a successful save —
        // that is the expected success path, not a failure.
        if (this._saving) {
            this._cleanup(true, null);
            return;
        }
        // An unexpected disconnect before save is a restore failure; use the
        // restore-specific message (the generic "serial port closed" wording is
        // misleading here).
        this._cleanup(false, i18n.getMessage("firmwareFlasherRestoreConnectionFailed"));
    }

    async onConnect(openInfo: unknown) {
        // A "connect" event can fire for a failed attempt too (the serial wrapper
        // normalizes the detail into a truthy object), so verify the transport is
        // actually connected rather than relying on openInfo being falsy.
        if (!openInfo || !serial.connected) {
            this._cleanup(false, i18n.getMessage("serialPortOpenFail"));
            return;
        }

        // CRITICAL: Reset FC state to clear stale data before any MSP queries
        const fcStore = useFlightControllerStore();
        fcStore.resetState();

        // Set up receive handler
        serial.removeEventListener("receive", this.boundHandleSerialReceive);
        serial.addEventListener("receive", this.boundHandleSerialReceive);

        // Create MSP helper and listen for incoming data
        this._mspHelper = new MspHelper();
        MSP.listen(this._mspHelper.process_data.bind(this._mspHelper));

        // Set connect timeout — if API version not received within CONNECT_TIMEOUT_MS, abort
        GUI.timeout_add(
            TIMEOUT_NAME,
            () => {
                this._cleanup(false, i18n.getMessage("firmwareFlasherRestoreConnectionFailed"));
            },
            CONNECT_TIMEOUT_MS,
        );

        try {
            // Query API version first
            await MSP.promise(MSPCodes.MSP_API_VERSION);
            GUI.timeout_remove(TIMEOUT_NAME);

            // Handle potential API version parsing issues
            if (
                !fcStore.config.apiVersion ||
                fcStore.config.apiVersion.includes("null") ||
                semver.lt(fcStore.config.apiVersion, "1.39.0")
            ) {
                this._cleanup(false, i18n.getMessage("firmwareFlasherRestoreConnectionFailed"));
                return;
            }

            // Query FC version to check MSP CLI support
            await MSP.promise(MSPCodes.MSP_FC_VERSION);

            const fcVersion = fcStore.config.flightControllerVersion;
            // MIN_FC_VERSION_FOR_MSP_CLI is a flight-controller version (4.5.4), so it
            // must be compared against flightControllerVersion — NOT apiVersion (1.x.x).
            if (!isMspCliSupported()) {
                const message = i18n.getMessage("mspCliFirmwareTooOld", {
                    required: MIN_FC_VERSION_FOR_MSP_CLI,
                    current: fcVersion || "unknown",
                });
                gui_log(message);
                this._cleanup(false, message);
                return;
            }

            // Handshake OK — proceed to send CLI commands
            this._sendCliCommands();
        } catch (error) {
            console.error("AutoRestore: MSP query failed:", error);
            // Only cleanup if not already cleaned up (guard against double cleanup)
            if (this._callback) {
                this._cleanup(false, i18n.getMessage("firmwareFlasherRestoreConnectionFailed"));
            }
        }
    }

    async _sendCliCommands() {
        const cliLines = this._cliLines!;
        const errors: CliError[] = [];

        try {
            for (const line of cliLines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith("#")) {
                    continue;
                }

                // `save` reboots the FC and persists the config. A `diff`/`dump` backup
                // ends with `save`, so it arrives here as a normal batch line. It never
                // returns a CLI prompt (the board reboots), so don't wait for one — flag
                // the save, fire it, and finish. The reboot's disconnect is then treated
                // as success by handleDisconnect (and this path) instead of a failure.
                if (trimmed.toLowerCase() === "save") {
                    await this._finishWithSave(errors);
                    return;
                }

                const response = await new Promise<string[]>((resolve, reject) => {
                    MSP.send_cli_command(
                        trimmed,
                        (data, error) => {
                            if (error) {
                                reject(error);
                                return;
                            }
                            resolve(Array.isArray(data) ? data : []);
                        },
                        { timeoutMs: DEFAULT_COMMAND_TIMEOUT_MS },
                    );
                }).catch((error) => {
                    const message = String(error?.message ?? error);
                    errors.push({ command: trimmed, error: message });
                    gui_log(`CLI command failed: ${trimmed} — ${message}`);
                    return null;
                });

                // Check for error lines in response
                if (response) {
                    const errorLines = response.filter((l) => l?.startsWith("###ERROR"));
                    if (errorLines.length > 0) {
                        errors.push({ command: trimmed, error: errorLines.join("; ") });
                        gui_log(`CLI command failed: ${trimmed} — ${errorLines.join("; ")}`);
                    }
                }

                // Small delay between commands
                await new Promise((resolve) => setTimeout(resolve, 15));
            }

            // Backup did not contain a `save` line — persist explicitly.
            await this._finishWithSave(errors);
        } catch (error) {
            console.error("AutoRestore: CLI command execution failed:", error);
            this._cleanup(false, String(error));
        }
    }

    /**
     * Issue `save` (which reboots the FC) and report success. Per-line CLI errors are
     * logged but never fail the restore; only a connection loss BEFORE save (reported via
     * handleDisconnect with _saving=false) is a failure.
     */
    async _finishWithSave(errors: CliError[]) {
        // Record skipped lines before save so this path and the save-reboot disconnect
        // path (handleDisconnect) report the same count.
        this._skipped = errors.length;
        if (errors.length > 0) {
            console.warn(`AutoRestore: restore applied with ${errors.length} ignored CLI error(s)`, errors);
        }

        gui_log(i18n.getMessage("buttonSaving"));
        this._saving = true;
        MSP.send_cli_command("save");
        await new Promise((resolve) => setTimeout(resolve, SAVE_FLUSH_MS));

        this._cleanup(true, null);
    }

    _cleanup(success: boolean, errorMsg: string | null) {
        // Guard against double-invocation (e.g. timeout + disconnect)
        if (!this._callback) {
            return;
        }
        const callback = this._callback;
        this._callback = null;
        this._saving = false;

        // serial.disconnect() is async; _cleanup is not, so handle any rejection with
        // .catch() rather than a (useless) synchronous try/catch.
        serial.disconnect().catch((error) => {
            console.error("AutoRestore: disconnect error:", error);
        });

        serial.removeEventListener("receive", this.boundHandleSerialReceive);
        serial.removeEventListener("connect", this.boundHandleConnect);
        serial.removeEventListener("disconnect", this.boundHandleDisconnect);

        MSP.clearListeners();
        MSP.disconnect_cleanup();
        useFlightControllerStore().resetState();

        GUI.timeout_remove(TIMEOUT_NAME);

        callback({ success, errors: errorMsg, skipped: this._skipped });
    }

    async execute(cliLines: string[], callback: AutoRestoreCallback) {
        if (!this.canAttemptConnection()) {
            callback({ success: false, errors: i18n.getMessage("firmwareFlasherRestoreConnectionFailed") });
            return;
        }

        this._cliLines = cliLines;
        this._callback = callback;
        this._saving = false;
        this._skipped = 0;

        // The board is already booted and the port is available when restore is invoked,
        // so connect directly — no need to wait for the port.
        const port = DeviceHandler.devicePicker.selectedDevice;
        const baud = DeviceHandler.devicePicker.selectedBauds;

        try {
            serial.addEventListener("connect", this.boundHandleConnect, { once: true });
            serial.addEventListener("disconnect", this.boundHandleDisconnect, { once: true });

            const result = await serial.connect(port, { baudRate: baud }, undefined);
            if (!result) {
                this._cleanup(false, i18n.getMessage("firmwareFlasherRestoreConnectionFailed"));
            }
        } catch (error) {
            console.error("AutoRestore: Connection exception:", error);
            this._cleanup(false, i18n.getMessage("firmwareFlasherRestoreConnectionFailed"));
        }
    }
}

export default new AutoRestore();
