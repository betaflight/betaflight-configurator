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

import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/js/localization", () => ({
    i18n: {
        getMessage: (key: string, params?: Record<string, unknown>) =>
            params ? `${key}:${JSON.stringify(params)}` : key,
    },
}));

import vtxDeviceStatusFactory from "../../src/js/utils/VtxDeviceStatus/VtxDeviceStatusFactory";
import VtxDeviceStatus, { VtxDeviceTypes } from "../../src/js/utils/VtxDeviceStatus/VtxDeviceStatus";
import VtxDeviceStatusSmartAudio from "../../src/js/utils/VtxDeviceStatus/SmartAudioDeviceStatus";
import VtxDeviceStatusTramp from "../../src/js/utils/VtxDeviceStatus/TrampDeviceStatus";
import VtxDeviceStatusMsp from "../../src/js/utils/VtxDeviceStatus/VtxMspDeviceStatus";
import VtxDeviceStatusRtc6705 from "../../src/js/utils/VtxDeviceStatus/Rtc6705DeviceStatus";

const u16 = (v: number) => [v & 0xff, (v >> 8) & 0xff];
const u32 = (v: number) => [...u16(v & 0xffff), ...u16(v >>> 16)];

interface CommonFields {
    ready?: number;
    bandAndChannel?: [number, number] | null;
    powerIndex?: number | null;
    frequency?: number | null;
    vtxStatus?: number | null;
    levels?: Array<[number, number]>;
}

/** The common part of an MSP2_GET_VTX_DEVICE_STATUS reply; `null` sends the "not available" flag. */
function common({
    ready = 1,
    bandAndChannel = [2, 5],
    powerIndex = 3,
    frequency = 5800,
    vtxStatus = 1,
    levels = [],
}: CommonFields = {}): number[] {
    return [
        ready,
        bandAndChannel ? 1 : 0,
        ...(bandAndChannel ?? [9, 9]),
        powerIndex === null ? 0 : 1,
        powerIndex ?? 9,
        frequency === null ? 0 : 1,
        ...u16(frequency ?? 9999),
        vtxStatus === null ? 0 : 1,
        ...u32(vtxStatus ?? 0xdeadbeef),
        levels.length,
        ...levels.flatMap(([level, power]) => [...u16(level), ...u16(power)]),
    ];
}

function create(type: number, bytes: number[]) {
    return vtxDeviceStatusFactory.createVtxDeviceStatus(new Uint8Array([type, ...bytes]));
}

/** Exposes the protected decoded fields, which no getter returns yet. */
function fields(status: VtxDeviceStatus) {
    return status as unknown as {
        _band: number | undefined;
        _channel: number | undefined;
        _powerIndex: number | undefined;
        _frequency: number | undefined;
        _vtxStatus: number | undefined;
        _levels: number[];
        _powers: number[];
    };
}

const smartAudio = (version: number, mode: number) =>
    create(VtxDeviceTypes.VTXDEV_SMARTAUDIO, [
        ...common(),
        5,
        version,
        mode,
        ...u16(5865),
        1,
    ]) as VtxDeviceStatusSmartAudio;

describe("VtxDeviceStatus", () => {
    it("decodes the common fields", () => {
        const status = fields(
            create(VtxDeviceTypes.VTXDEV_TRAMP, [
                ...common({
                    levels: [
                        [1, 25],
                        [2, 200],
                    ],
                    vtxStatus: 0x10002,
                }),
                0,
            ]),
        );

        expect(status._band).toBe(2);
        expect(status._channel).toBe(5);
        expect(status._powerIndex).toBe(3);
        expect(status._frequency).toBe(5800);
        expect(status._vtxStatus).toBe(0x10002);
        expect(status._levels).toEqual([1, 2]);
        expect(status._powers).toEqual([25, 200]);
    });

    it("leaves a field undefined when its available flag is clear, still consuming its bytes", () => {
        const status = create(VtxDeviceTypes.VTXDEV_TRAMP, [
            ...common({ bandAndChannel: null, powerIndex: null, frequency: null, vtxStatus: null, levels: [[7, 600]] }),
            0,
        ]);
        const f = fields(status);

        expect(f._band).toBeUndefined();
        expect(f._channel).toBeUndefined();
        expect(f._powerIndex).toBeUndefined();
        expect(f._frequency).toBeUndefined();
        expect(f._vtxStatus).toBeUndefined();
        expect(f._levels).toEqual([7]);
        expect(f._powers).toEqual([600]);
    });

    it("reports the raw ready byte", () => {
        expect(create(VtxDeviceTypes.VTXDEV_MSP, [...common({ ready: 0 }), 0]).deviceIsReady).toBe(0);
        expect(create(VtxDeviceTypes.VTXDEV_MSP, [...common({ ready: 1 }), 0]).deviceIsReady).toBe(1);
    });

    it.each([
        [VtxDeviceTypes.VTXDEV_SMARTAUDIO, VtxDeviceStatusSmartAudio],
        [VtxDeviceTypes.VTXDEV_TRAMP, VtxDeviceStatusTramp],
        [VtxDeviceTypes.VTXDEV_MSP, VtxDeviceStatusMsp],
        [VtxDeviceTypes.VTXDEV_RTC6705, VtxDeviceStatusRtc6705],
    ])("creates the registered class for type %i", (type, cls) => {
        const status = create(type, [...common(), 0, 0, 0, 0, 0, 0]);

        expect(status).toBeInstanceOf(cls);
        expect(status.deviceStatusType).toBe(type);
    });

    it("falls back to the base class for an unregistered type", () => {
        const status = create(VtxDeviceTypes.VTXDEV_UNSUPPORTED, common());

        expect(status.constructor).toBe(VtxDeviceStatus);
        expect(status.deviceStatusType).toBe(VtxDeviceTypes.VTXDEV_UNKNOWN);
    });
});

describe("VtxDeviceStatusSmartAudio", () => {
    it.each([
        [1, "1.0"],
        [2, "2.0"],
        [3, "2.1"],
        [7, "vtxType_255"],
    ])("maps version %i to %s", (version, expected) => {
        expect(smartAudio(version, 0).smartAudioVersion).toBe(expected);
    });

    it("marks an unlocked device (mode 16)", () => {
        expect(smartAudio(3, 16).smartAudioVersion).toBe('vtxSmartAudioUnlocked:{"version":"2.1"}');
    });

    it("reads the SmartAudio fields after the size byte", () => {
        const status = smartAudio(2, 1) as unknown as Record<string, unknown>;

        expect(status._version).toBe(2);
        expect(status._mode).toBe(1);
        expect(status._orfreq).toBe(5865);
        expect(status._willBootIntoPitMode).toBe(true);
    });
});
