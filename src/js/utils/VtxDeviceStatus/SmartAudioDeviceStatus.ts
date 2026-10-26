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
import VtxDeviceStatus, { VtxDeviceTypes } from "./VtxDeviceStatus";
import { i18n } from "../../localization";

class VtxDeviceStatusSmartAudio extends VtxDeviceStatus {
    protected readonly _version: number;
    protected readonly _mode: number;
    protected readonly _orfreq: number;
    protected readonly _willBootIntoPitMode: boolean;

    constructor(dataView: MspDataView) {
        super(dataView);

        dataView.readU8(); // custom device status size

        this._version = dataView.readU8();
        this._mode = dataView.readU8();
        this._orfreq = dataView.readU16();
        this._willBootIntoPitMode = Boolean(dataView.readU8());
    }

    get smartAudioVersion(): string {
        let result: string;

        switch (this._version) {
            case 1:
                result = "1.0";
                break;
            case 2:
                result = "2.0";
                break;
            case 3:
                result = "2.1";
                break;
            default:
                // unknown SA version
                result = i18n.getMessage("vtxType_255");
        }

        if (this._mode === 16) {
            result = i18n.getMessage("vtxSmartAudioUnlocked", { version: result });
        }

        return result;
    }

    static get staticDeviceStatusType(): number {
        return VtxDeviceTypes.VTXDEV_SMARTAUDIO;
    }
}

export default VtxDeviceStatusSmartAudio;
