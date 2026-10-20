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

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const { dfuConnect } = vi.hoisted(() => ({ dfuConnect: vi.fn() }));

vi.mock("../../src/composables/useDialog", () => ({ useDialog: () => ({}) }));
vi.mock("../../src/js/Analytics", () => ({ getTracking: () => null }));
vi.mock("../../src/js/device_handler", () => ({
    default: { devicePicker: { selectedDevice: "usb_1" }, dfuProtocol: { connect: dfuConnect } },
}));

import { useFirmwareFlashing } from "../../src/composables/useFirmwareFlashing";
import type { ParsedHex } from "../../src/js/workers/hex_parser";

const POINTER_ADDRESS = 0x08002800;
const AREA_START = 0x08010000;
const AREA_END = 0x08014000;

function le32(value: number): number[] {
    return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

// A firmware image whose custom defaults pointer names a free 16 KiB area.
function firmwareWithDefaultsArea(): ParsedHex {
    const data = [...le32(AREA_START), ...le32(AREA_END)];
    return {
        data: [{ address: POINTER_ADDRESS, bytes: data.length, data }],
        end_of_file: true,
        bytes_total: data.length,
        start_linear_address: 0,
    };
}

function flasher(firmware: ParsedHex) {
    const flashing = useFirmwareFlashing({
        flashingMessage: vi.fn(),
        flashProgress: vi.fn(),
        FLASH_MESSAGE_TYPES: {
            NEUTRAL: "NEUTRAL",
            VALID: "VALID",
            INVALID: "INVALID",
            ACTION: "ACTION",
            ERASING: "ERASING",
            FLASHING: "FLASHING",
            VERIFYING: "VERIFYING",
        },
        $t: (key) => key,
    });
    flashing.firmwareState.parsedHex = firmware;
    return flashing;
}

describe("useFirmwareFlashing board config insertion", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        dfuConnect.mockReset();
    });

    it("writes a loaded board config into the custom defaults area", () => {
        const firmware = firmwareWithDefaultsArea();
        const clearBoardConfig = vi.fn();

        flasher(firmware).startFlashing({ config: "set x = 1", clearBoardConfig });

        const text = "# Betaflight\nset x = 1\0";
        expect(firmware.data[1]).toEqual({
            address: AREA_START,
            bytes: text.length,
            data: [...text].map((c) => c.charCodeAt(0)),
        });
        expect(firmware.configInserted).toBe(true);
        expect(clearBoardConfig).not.toHaveBeenCalled();
        expect(dfuConnect).toHaveBeenCalledWith("usb_1", firmware, expect.anything());
    });

    it("leaves the image alone when no board config is loaded", () => {
        const firmware = firmwareWithDefaultsArea();
        const before = structuredClone(firmware);

        // FirmwareFlasherTab holds `{}` until a config is loaded.
        flasher(firmware).startFlashing({ config: {} });

        expect(firmware).toEqual(before);
        expect(dfuConnect).toHaveBeenCalledWith("usb_1", firmware, expect.anything());
    });
});
