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

import MspHelper from "./MSPHelper";
import { i18n } from "../localization";
import GUI from "../gui";
import MSP from "../msp";
import { useFlightControllerStore } from "../../stores/fc";
import { serial } from "../serial";
import MSPCodes from "./MSPCodes";
import CONFIGURATOR from "../data_storage";
import { gui_log } from "../gui_log";

/**
 * This seems to be mainly used in firmware flasher parts.
 */

type MspReadInfo = Parameters<typeof MSP.read>[0];

/** A callback the flasher passes in; its result is awaited only where it is wrapped in a Promise. */
type ConnectorCallback = (...args: unknown[]) => unknown;

function readSerialAdapter(e: Event) {
    // The MSP connector (flashing path) must not depend on serial_backend; bytes
    // here are always MSP, so feed MSP directly.
    MSP.read((e as CustomEvent<MspReadInfo>).detail);
}

class MSPConnectorImpl {
    baud: number | false | undefined = undefined;
    port: string | undefined = undefined;
    onConnectCallback: ConnectorCallback | undefined = undefined;
    onTimeoutCallback: ConnectorCallback | undefined = undefined;
    onFailureCallback: ConnectorCallback | undefined;
    onDisconnectCallback: ConnectorCallback | undefined = undefined;
    /** Used for connect timeout only; must not toggle CONFIGURATOR.connectionValid (main UI connect button). */
    _mspApiVersionReceived = false;

    // Stored so removeEventListener gets the same reference addEventListener registered
    readonly boundHandleConnect = (e: Event) => this.handleConnect((e as CustomEvent).detail);
    readonly boundHandleDisconnect = (e: Event) => this.handleDisconnect(e);

    _disconnectAfterMspTimeout() {
        void serial.disconnect((result: unknown) => {
            console.log("Disconnected", result);

            MSP.clearListeners();

            Promise.resolve(this.onTimeoutCallback?.())
                .catch((err) => {
                    console.error(err);
                })
                .finally(() => {
                    MSP.disconnect_cleanup();
                });
        });
    }

    handleConnect(openInfo: unknown) {
        if (openInfo) {
            this._mspApiVersionReceived = false;
            useFlightControllerStore().resetState();

            // disconnect after 10 seconds with error if we don't get IDENT data
            GUI.timeout_add(
                "msp_connector",
                () => {
                    if (!this._mspApiVersionReceived) {
                        gui_log(i18n.getMessage("noConfigurationReceived"));

                        this._disconnectAfterMspTimeout();
                    }
                },
                10000,
            );

            serial.removeEventListener("receive", readSerialAdapter);
            serial.addEventListener("receive", readSerialAdapter);

            const mspHelper = new MspHelper();
            MSP.listen(mspHelper.process_data.bind(mspHelper));

            MSP.send_message(MSPCodes.MSP_API_VERSION, false, false, () => {
                this._mspApiVersionReceived = true;
                GUI.timeout_remove("msp_connector");
                console.log("Connected");

                this.onConnectCallback!();
            });
        } else {
            gui_log(i18n.getMessage("serialPortOpenFail"));
            this.onFailureCallback!();
        }
    }

    handleDisconnect(detail: unknown) {
        console.log("Disconnected", detail);

        serial.removeEventListener("receive", readSerialAdapter);

        // Calling in case event listeners were not removed
        serial.removeEventListener("connect", this.boundHandleConnect);
        serial.removeEventListener("disconnect", this.boundHandleDisconnect);

        MSP.clearListeners();
        MSP.disconnect_cleanup();

        // Flashing path does not run serial_backend disconnectHandler; clear stale UI state if anything set it.
        CONFIGURATOR.connectionValid = false;
    }

    connect(
        port: string,
        baud: number | false | undefined,
        onConnectCallback: ConnectorCallback,
        onTimeoutCallback: ConnectorCallback,
        onFailureCallback: ConnectorCallback,
    ) {
        this.port = port;
        this.baud = baud;
        this.onConnectCallback = onConnectCallback;
        this.onTimeoutCallback = onTimeoutCallback;
        this.onFailureCallback = onFailureCallback;

        serial.removeEventListener("connect", this.boundHandleConnect);
        serial.addEventListener("connect", this.boundHandleConnect, { once: true });

        serial.removeEventListener("disconnect", this.boundHandleDisconnect);
        serial.addEventListener("disconnect", this.boundHandleDisconnect, { once: true });

        // serial.js types its optional callback as required; the connect event above reports the result.
        void serial.connect(this.port, { baudRate: this.baud }, undefined);
    }

    disconnect(onDisconnectCallback: ConnectorCallback) {
        this.onDisconnectCallback = onDisconnectCallback;

        void serial.disconnect((result: unknown) => {
            MSP.clearListeners();
            console.log("Disconnected", result);

            Promise.resolve(this.onDisconnectCallback?.(result))
                .catch((err) => {
                    console.error(err);
                })
                .finally(() => {
                    MSP.disconnect_cleanup();
                });
        });
    }
}

export default MSPConnectorImpl;
