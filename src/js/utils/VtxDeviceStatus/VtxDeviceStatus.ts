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

import type { MspDataView } from "../../msp/mspBytes";

export const VtxDeviceTypes = {
    VTXDEV_UNSUPPORTED: 0, // reserved for MSP
    VTXDEV_RTC6705: 1,
    // 2 reserved
    VTXDEV_SMARTAUDIO: 3,
    VTXDEV_TRAMP: 4,
    VTXDEV_MSP: 5,
    VTXDEV_UNKNOWN: 0xff,
} as const;

/**
 * Decoded MSP2_GET_VTX_DEVICE_STATUS payload, after the leading vtx type byte
 * that the factory uses to pick the class. Fields whose "available" flag is
 * zero are `undefined`.
 */
class VtxDeviceStatus {
    protected readonly _deviceIsReady: number;
    protected readonly _band: number | undefined;
    protected readonly _channel: number | undefined;
    protected readonly _powerIndex: number | undefined;
    protected readonly _frequency: number | undefined;
    protected readonly _vtxStatus: number | undefined; // pitmode and/or locked
    protected readonly _levels: number[] = [];
    protected readonly _powers: number[] = [];

    constructor(dataView: MspDataView) {
        this._deviceIsReady = dataView.readU8();
        const bandAndChannelAvailable = Boolean(dataView.readU8());
        const band = dataView.readU8();
        const channel = dataView.readU8();
        this._band = bandAndChannelAvailable ? band : undefined;
        this._channel = bandAndChannelAvailable ? channel : undefined;

        const powerIndexAvailable = Boolean(dataView.readU8());
        const powerIndex = dataView.readU8();
        this._powerIndex = powerIndexAvailable ? powerIndex : undefined;

        const frequencyAvailable = Boolean(dataView.readU8());
        const frequency = dataView.readU16();
        this._frequency = frequencyAvailable ? frequency : undefined;

        const vtxStatusAvailable = Boolean(dataView.readU8());
        const vtxStatus = dataView.readU32();
        this._vtxStatus = vtxStatusAvailable ? vtxStatus : undefined;

        this._readPowerLevels(dataView);
    }

    private _readPowerLevels(dataView: MspDataView): void {
        const powerLevelCount = dataView.readU8();

        for (let i = 0; i < powerLevelCount; i++) {
            this._levels.push(dataView.readU16());
            this._powers.push(dataView.readU16());
        }
    }

    /** The raw ready byte from the firmware: non-zero when the device is ready. */
    get deviceIsReady(): number {
        return this._deviceIsReady;
    }

    // overload this function in subclasses
    static get staticDeviceStatusType(): number {
        return VtxDeviceTypes.VTXDEV_UNKNOWN;
    }

    get deviceStatusType(): number {
        // returns result of overloaded static function "staticDeviceStatusType"
        return (this.constructor as typeof VtxDeviceStatus).staticDeviceStatusType;
    }
}

export default VtxDeviceStatus;
