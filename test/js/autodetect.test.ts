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

const serial = vi.hoisted(() => ({
    connected: false,
    connectionId: false,
    connect: vi.fn(),
    disconnect: vi.fn(async () => true),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
}));

vi.mock("../../src/js/serial", () => ({ serial }));
vi.mock("../../src/js/gui_log", () => ({ gui_log: vi.fn() }));
vi.mock("../../src/js/localization", () => ({ i18n: { getMessage: (key: string) => key } }));
vi.mock("../../src/js/device_handler", () => ({
    default: { portAvailable: true, devicePicker: { selectedDevice: "tcp://10.0.0.1:5761", selectedBauds: 115200 } },
}));
vi.mock("../../src/js/BuildApi", () => ({
    default: class {
        loadTargets = async () => [{ target: "STM32F405" }];
    },
}));
vi.mock("../../src/js/msp", () => ({
    default: { clearListeners: vi.fn(), disconnect_cleanup: vi.fn(), listen: vi.fn(), promise: vi.fn() },
}));

const { default: AutoDetect } = await import("../../src/js/utils/AutoDetect");

beforeEach(() => {
    serial.connect.mockReset();
    serial.disconnect.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("AutoDetect.verifyBoard", () => {
    it("keeps a connection whose transport reports success only through the connect event", async () => {
        // WebSocket resolves connect() with no value.
        serial.connect.mockResolvedValue(undefined);

        await AutoDetect.verifyBoard(() => true);

        expect(serial.disconnect).not.toHaveBeenCalled();
    });

    it("tears down once when a failure is reported both by the result and by the connect event", async () => {
        serial.connect.mockImplementation(async () => {
            AutoDetect.onConnect(false);
            return false;
        });

        await AutoDetect.verifyBoard(() => true);

        expect(serial.disconnect).toHaveBeenCalledTimes(1);
    });

    it("tears down a failure reported only through the connect event", async () => {
        serial.connect.mockResolvedValue(undefined);

        await AutoDetect.verifyBoard(() => true);
        AutoDetect.onConnect(false);

        expect(serial.disconnect).toHaveBeenCalledTimes(1);
    });

    it("tears down when connect throws", async () => {
        serial.connect.mockRejectedValue(new Error("boom"));

        await AutoDetect.verifyBoard(() => true);

        expect(serial.disconnect).toHaveBeenCalledTimes(1);
    });
});
