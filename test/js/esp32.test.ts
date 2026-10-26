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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { platform, protocol, loader, transport, esptool } = vi.hoisted(() => {
    const loader = {
        main: vi.fn(),
        writeFlash: vi.fn(),
        after: vi.fn(),
    };
    const transport = { disconnect: vi.fn() };
    return {
        platform: { tauri: false, android: false },
        protocol: {
            connected: false,
            disconnect: vi.fn(),
            getNativePort: vi.fn(),
        },
        loader,
        transport,
        esptool: {
            ESPLoader: vi.fn(function () {
                return loader;
            }),
            Transport: vi.fn(function () {
                return transport;
            }),
        },
    };
});

vi.mock("../../src/js/localization", () => ({
    i18n: {
        getMessage: (key: string, args?: unknown[]) => (args ? `${key}:${args.join(",")}` : key),
    },
}));
vi.mock("../../src/js/serial", () => ({ serial: { selectProtocol: vi.fn(() => protocol) } }));
vi.mock("../../src/js/utils/checkCompatibility", () => ({
    isTauri: () => platform.tauri,
    isAndroid: () => platform.android,
}));
vi.mock("esptool-js", () => esptool);

const { default: ESP32 } = await import("../../src/js/protocols/esp32");

const TYPES = { NEUTRAL: "neutral", VALID: "valid", INVALID: "invalid", ACTION: "action", FLASHING: "flashing" };
const IMAGE = new Uint8Array([0xe9, 1, 2, 3]);
const nativePort = { readable: null };

function flash(image = IMAGE) {
    const flashingMessage = vi.fn();
    const flashProgress = vi.fn();
    const result = ESP32.connect("serial_0", 460800, image, {
        flashingMessage,
        flashProgress,
        flashMessageTypes: TYPES,
    });
    return { result, flashingMessage, flashProgress };
}

beforeEach(() => {
    vi.stubGlobal("navigator", { serial: {} });
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    protocol.getNativePort.mockReturnValue(nativePort);
    loader.main.mockResolvedValue("ESP32-S3");
    loader.writeFlash.mockImplementation(async ({ reportProgress }) => {
        reportProgress(0, 50, 200);
        reportProgress(0, 200, 200);
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    platform.tauri = false;
    platform.android = false;
    protocol.connected = false;
});

describe("ESP32 flashing preconditions", () => {
    it.each([
        ["Tauri", () => (platform.tauri = true)],
        ["Android", () => (platform.android = true)],
        ["a browser without Web Serial", () => vi.stubGlobal("navigator", {})],
    ])("refuses on %s", async (_name, arrange) => {
        arrange();
        const { result, flashingMessage } = flash();

        expect(await result).toBe(false);
        expect(flashingMessage).toHaveBeenCalledWith("firmwareFlasherEsp32NotSupported", "invalid");
        expect(esptool.Transport).not.toHaveBeenCalled();
    });

    it("refuses an empty image", async () => {
        const { result, flashingMessage } = flash(new Uint8Array(0));

        expect(await result).toBe(false);
        expect(flashingMessage).toHaveBeenCalledWith("firmwareFlasherFirmwareNotLoaded", "invalid");
    });

    it("refuses a path with no native port", async () => {
        protocol.getNativePort.mockReturnValue(undefined);
        const { result, flashingMessage } = flash();

        expect(await result).toBe(false);
        expect(protocol.getNativePort).toHaveBeenCalledWith("serial_0");
        expect(flashingMessage).toHaveBeenCalledWith("firmwareFlasherEsp32NoPort", "invalid");
    });
});

describe("ESP32 flashing", () => {
    it("releases a connected port before esptool-js takes it", async () => {
        protocol.connected = true;

        await flash().result;

        expect(protocol.disconnect).toHaveBeenCalled();
        expect(protocol.disconnect.mock.invocationCallOrder[0]).toBeLessThan(
            esptool.Transport.mock.invocationCallOrder[0],
        );
    });

    it("flashes the image at 0x0, reports progress, resets and releases the port", async () => {
        const { result, flashingMessage, flashProgress } = flash();

        expect(await result).toBe(true);

        expect(esptool.Transport).toHaveBeenCalledWith(nativePort, false);
        expect(esptool.ESPLoader).toHaveBeenCalledWith(expect.objectContaining({ transport, baudrate: 460800 }));
        expect(loader.writeFlash).toHaveBeenCalledWith(
            expect.objectContaining({ fileArray: [{ data: IMAGE, address: 0 }], eraseAll: false }),
        );
        expect(flashProgress.mock.calls.map(([value]) => value)).toEqual([0, 25, 100, 100]);
        expect(flashingMessage).toHaveBeenCalledWith("firmwareFlasherEsp32Detected:ESP32-S3", "neutral");
        expect(flashingMessage).toHaveBeenLastCalledWith("firmwareFlasherEsp32Complete", "valid");
        expect(loader.after).toHaveBeenCalledWith("hard_reset");
        expect(transport.disconnect).toHaveBeenCalled();
        expect(ESP32.transport).toBeNull();
        expect(ESP32.loader).toBeNull();
    });

    it("reports a failure with its message and still releases the port", async () => {
        loader.main.mockRejectedValue(new Error("no sync"));
        const { result, flashingMessage, flashProgress } = flash();

        expect(await result).toBe(false);

        expect(flashingMessage).toHaveBeenLastCalledWith("firmwareFlasherEsp32Failed:no sync", "invalid");
        expect(flashProgress).toHaveBeenLastCalledWith(100);
        expect(transport.disconnect).toHaveBeenCalled();
    });
});
