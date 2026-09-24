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

import { MspDataView } from "../../msp/mspBytes";
import VtxDeviceStatus from "./VtxDeviceStatus";
import VtxDeviceStatusSmartAudio from "./SmartAudioDeviceStatus";
import VtxDeviceStatusTramp from "./TrampDeviceStatus";
import VtxDeviceStatusMsp from "./VtxMspDeviceStatus";
import VtxDeviceStatusRtc6705 from "./Rtc6705DeviceStatus";

type VtxDeviceStatusClass = typeof VtxDeviceStatus;

const vtxDeviceStatusFactory = {
    _vtxDeviceStatusClasses: [] as VtxDeviceStatusClass[],

    // call this to register a new vtx type like SmartAudio, Tramp or Rtc6705
    registerVtxDeviceStatusClass: function (vtxDeviceStatusClass: VtxDeviceStatusClass): void {
        this._vtxDeviceStatusClasses.push(vtxDeviceStatusClass);
    },

    createVtxDeviceStatus: function (byteArray: Uint8Array): VtxDeviceStatus {
        const dataView = new MspDataView(byteArray.buffer);

        const vtxTypeIndex = dataView.readU8();
        const vtxDeviceStatusClass = this._getDeviceStatusClass(vtxTypeIndex);

        return new vtxDeviceStatusClass(dataView);
    },

    _readVtxType: function (dataView: MspDataView): number {
        return dataView.readU8();
    },

    _getDeviceStatusClass: function (vtxTypeIndex: number): VtxDeviceStatusClass {
        let result = this._vtxDeviceStatusClasses.find((vtxClass) => {
            return vtxClass.staticDeviceStatusType === vtxTypeIndex;
        });

        if (typeof result === "undefined") {
            result = VtxDeviceStatus;
        }

        return result;
    },
};

vtxDeviceStatusFactory.registerVtxDeviceStatusClass(VtxDeviceStatusSmartAudio);
vtxDeviceStatusFactory.registerVtxDeviceStatusClass(VtxDeviceStatusTramp);
vtxDeviceStatusFactory.registerVtxDeviceStatusClass(VtxDeviceStatusMsp);
vtxDeviceStatusFactory.registerVtxDeviceStatusClass(VtxDeviceStatusRtc6705);

export default vtxDeviceStatusFactory;
