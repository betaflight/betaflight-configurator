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

const VIRTUAL = "virtual";

/** The one device this transport lists. Unlike a real port it has no display name. */
export interface VirtualDevice {
    path: typeof VIRTUAL;
}

/**
 * Stripped down version of previous nwjs based serial port implementation
 * which is required to still have virtual serial port support in the
 * browser.
 *
 * VirtualSerial now extends EventTarget and emits synthetic connect/disconnect
 * events, so the connection state can treat it like any other transport instead
 * of special-casing "virtual" everywhere.
 */
class VirtualSerial extends EventTarget {
    connected: boolean;
    connectionId: typeof VIRTUAL | false;
    bitrate: number;
    bytesReceived: number;
    bytesSent: number;
    failed: number;
    connectionType: typeof VIRTUAL;
    transmitting: boolean;
    outputBuffer: unknown[];

    constructor() {
        super();
        this.connected = false;
        this.connectionId = false;
        this.bitrate = 0;
        this.bytesReceived = 0;
        this.bytesSent = 0;
        this.failed = 0;
        this.connectionType = VIRTUAL;
        this.transmitting = false;
        this.outputBuffer = [];
    }
    connect(_port?: unknown, _options?: unknown): boolean {
        this.connected = true;
        this.connectionId = VIRTUAL;
        this.bitrate = 115200;
        // Synthetic connect: virtual has no underlying device, but emitting the
        // same events as a real transport lets the connection state drive it uniformly.
        this.dispatchEvent(new CustomEvent("connect", { detail: { connectionId: VIRTUAL } }));
        return true;
    }
    disconnect(): boolean {
        this.connected = false;
        this.outputBuffer = [];
        this.transmitting = false;
        if (this.connectionId) {
            this.connectionId = false;
            this.bitrate = 0;
            // Virtual disconnect is always intentional (no link to lose) -> CLOSED.
            this.dispatchEvent(new CustomEvent("disconnect", { detail: true }));
            return true;
        }
        return false;
    }
    getConnectedDevice(): typeof VIRTUAL | false {
        return this.connectionId;
    }
    getDevices(): Promise<VirtualDevice[]> {
        return Promise.resolve([{ path: VIRTUAL }]);
    }
}

export default VirtualSerial;
