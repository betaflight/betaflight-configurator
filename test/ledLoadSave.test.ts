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
import { useFlightControllerStore } from "../src/stores/fc";
import MSP from "../src/js/msp";
import MSPCodes from "../src/js/msp/MSPCodes";
import { mspHelper } from "../src/js/msp/MSPHelper";
import { MspDataView } from "../src/js/msp/mspBytes";
vi.mock("../src/js/msp", () => ({ default: { promise: vi.fn(), send_message: vi.fn() } }));
vi.mock("../src/js/localization", () => ({ i18n: { getMessage: (key: string) => key } }));
vi.mock("../src/js/gui_log", () => ({ gui_log: vi.fn() }));
function decode(code: number, payload: number[]) {
    mspHelper.process_data({
        code,
        dataView: new MspDataView(new Uint8Array(payload).buffer),
        crcError: false,
        unsupported: 0,
        callbacks: [],
    });
}
beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.mocked(MSP.promise).mockReset().mockResolvedValue(undefined);
});
import { useLedStrip } from "../src/composables/useLedStrip";
import { isEmptyLed } from "../src/composables/ledStripUtils";
const { saveToEeprom } = vi.hoisted(() => ({ saveToEeprom: vi.fn() }));
vi.mock("../src/composables/useReboot", () => ({ useReboot: () => ({ saveToEeprom }) }));
const decodeStrip = (payload: number[]) => decode(MSPCodes.MSP_LED_STRIP_CONFIG, payload);
function setup() {
    const fc = useFlightControllerStore();
    fc.config.apiVersion = "1.46.0";
    fc.ledStripAdvanced = true;
    fc.ledStripProfile = 2;
    fc.ledStrip = Array.from({ length: 32 }, () => ({ x: 0, y: 0, color: 0, functions: "c", directions: "" }));
    fc.ledColors = Array.from({ length: 16 }, (_, index) => ({ h: index * 20, s: 0, v: index ? 255 : 0 }));
    fc.ledModeColors = Array.from({ length: 8 }, (_, direction) => ({ mode: 6, direction, color: direction }));
    fc.ledConfigValues = { brightness: 40, rainbow_delta: 33, rainbow_freq: 72 };
    fc.ledConfigValuesLoaded = true;
    return fc;
}
describe("LED load and save", () => {
    it.each([[], [1], [0, 0, 0, 1, 2], [1, 2]].map((payload) => ({ payload })))(
        "rejects an incomplete main strip response: $payload",
        async ({ payload }) => {
            const fc = setup();
            vi.mocked(MSP.promise).mockImplementation(async (code) => {
                if (code === MSPCodes.MSP_LED_STRIP_CONFIG) decodeStrip(payload);
            });
            await expect(useLedStrip().loadData()).rejects.toThrow("LED strip configuration was not loaded");
            expect(fc.ledStrip).toEqual([]);
            expect(fc.ledConfigValuesLoaded).toBe(false);
            expect(MSP.promise).toHaveBeenCalledTimes(1);
            expect(MSP.send_message).not.toHaveBeenCalled();
        },
    );

    it("loads config values on Basic firmware and saves unchanged bytes idempotently", async () => {
        const fc = setup();
        fc.ledStripAdvanced = false;
        fc.ledConfigValues = {};
        fc.ledConfigValuesLoaded = false;
        vi.mocked(MSP.promise).mockImplementation(async (code) => {
            if (code === MSPCodes.MSP2_GET_LED_STRIP_CONFIG_VALUES) decode(code, [81, 103, 1, 200, 0]);
        });
        const { loadData, saveConfig, updateLedConfigValue } = useLedStrip();
        await loadData();
        expect(vi.mocked(MSP.promise).mock.calls.map(([code]) => code)).toEqual([
            MSPCodes.MSP_LED_STRIP_CONFIG,
            MSPCodes.MSP2_GET_LED_STRIP_CONFIG_VALUES,
        ]);
        const before = JSON.stringify(fc.$state);
        updateLedConfigValue("brightness", 81);
        expect(MSP.send_message).not.toHaveBeenCalled();
        await saveConfig();
        await saveConfig();
        const values = vi
            .mocked(MSP.promise)
            .mock.calls.filter(([code]) => code === MSPCodes.MSP2_SET_LED_STRIP_CONFIG_VALUES);
        expect(values.map(([, bytes]) => Array.from(bytes as number[]))).toEqual([
            [81, 103, 1, 200, 0],
            [81, 103, 1, 200, 0],
        ]);
        expect(JSON.stringify(fc.$state)).toBe(before);
    });

    it("never writes unknown values on Basic firmware, including live controls", async () => {
        const fc = setup();
        fc.ledStripAdvanced = false;
        fc.ledConfigValues = {};
        fc.ledConfigValuesLoaded = false;
        useLedStrip().updateLedConfigValue("brightness", 50);
        mspHelper.sendLedStripConfigValues();
        await useLedStrip().saveConfig();
        expect(fc.ledConfigValues).toEqual({});
        expect(MSP.send_message).not.toHaveBeenCalled();
        expect(
            vi.mocked(MSP.promise).mock.calls.some(([code]) => code === MSPCodes.MSP2_SET_LED_STRIP_CONFIG_VALUES),
        ).toBe(false);
    });

    it("does not carry FC A values into FC B after disconnect/reset", async () => {
        const fc = setup();
        decode(MSPCodes.MSP2_GET_LED_STRIP_CONFIG_VALUES, [91, 33, 0, 72, 0]);
        expect(fc.ledConfigValuesLoaded).toBe(true);
        // serial_backend disconnect and new connection both call resetState().
        fc.resetState();
        fc.config.apiVersion = "1.46.0";
        fc.ledStripAdvanced = false;
        expect(fc.ledConfigValues).toEqual({});
        expect(fc.ledConfigValuesLoaded).toBe(false);
        await useLedStrip().saveConfig();
        expect(
            vi.mocked(MSP.promise).mock.calls.some(([code]) => code === MSPCodes.MSP2_SET_LED_STRIP_CONFIG_VALUES),
        ).toBe(false);
        decode(MSPCodes.MSP2_GET_LED_STRIP_CONFIG_VALUES, [20, 1, 0, 2, 0]);
        await useLedStrip().saveConfig();
        expect(MSP.promise).toHaveBeenLastCalledWith(MSPCodes.MSP2_SET_LED_STRIP_CONFIG_VALUES, [20, 1, 0, 2, 0]);
    });

    it("invalidates readiness on reload and propagates failed or truncated reads", async () => {
        const fc = setup();
        vi.mocked(MSP.promise).mockRejectedValueOnce(new Error("offline"));
        await expect(useLedStrip().loadData()).rejects.toThrow("offline");
        expect(fc.ledConfigValuesLoaded).toBe(false);
        vi.mocked(MSP.promise).mockImplementation(async (code) => {
            if (code === MSPCodes.MSP2_GET_LED_STRIP_CONFIG_VALUES) decode(code, [80, 0]);
        });
        await expect(useLedStrip().loadData()).rejects.toThrow("not loaded");
        await useLedStrip().saveConfig();
        expect(
            vi.mocked(MSP.promise).mock.calls.some(([code]) => code === MSPCodes.MSP2_SET_LED_STRIP_CONFIG_VALUES),
        ).toBe(false);
    });

    it("distinguishes native zero padding from nonzero legacy parameters", () => {
        const zero = { x: 0, y: 0, color: 0, functions: "c", directions: "" };
        expect(isEmptyLed(zero)).toBe(true);
        expect(isEmptyLed({ ...zero, functions: "", parameters: 0 })).toBe(true);
        expect(isEmptyLed({ ...zero, parameters: 1 })).toBe(false);
    });
    it("retains controller capacity/profile and fails closed for truncated replies", () => {
        const fc = setup();
        decodeStrip([...Array.from({ length: 8 * 4 }, () => 0), 0, 1]);
        expect(fc.ledStrip).toHaveLength(8);
        expect(fc.ledStripAdvanced).toBe(false);
        expect(fc.ledStripProfile).toBe(1);
        decodeStrip([0, 0, 0]);
        expect(fc.ledStrip).toHaveLength(0);
        expect(fc.ledStripAdvanced).toBeNull();
        expect(fc.ledStripProfile).toBeNull();
    });

    it("saves brightness with an acknowledged request before EEPROM, and propagates failure", async () => {
        const fc = setup();
        fc.ledConfigValues.brightness = 25;
        const { saveConfig } = useLedStrip();
        await saveConfig();
        const codes = vi.mocked(MSP.promise).mock.calls.map(([code]) => code);
        expect(codes.slice(0, 32)).toEqual(Array(32).fill(MSPCodes.MSP_SET_LED_STRIP_CONFIG));
        expect(codes[32]).toBe(MSPCodes.MSP_SET_LED_COLORS);
        expect(codes.at(-1)).toBe(MSPCodes.MSP2_SET_LED_STRIP_CONFIG_VALUES);
        expect(MSP.promise).toHaveBeenLastCalledWith(MSPCodes.MSP2_SET_LED_STRIP_CONFIG_VALUES, [25, 33, 0, 72, 0]);
        expect(saveToEeprom).toHaveBeenCalledOnce();
        expect(saveToEeprom.mock.invocationCallOrder[0]).toBeGreaterThan(
            vi.mocked(MSP.promise).mock.invocationCallOrder.at(-1)!,
        );
        saveToEeprom.mockClear();
        vi.mocked(MSP.promise).mockImplementation(async (code) => {
            if (code === MSPCodes.MSP2_SET_LED_STRIP_CONFIG_VALUES) throw new Error("write failed");
        });
        await expect(saveConfig()).rejects.toThrow("write failed");
        expect(saveToEeprom).not.toHaveBeenCalled();
    });

    it("does not send unsupported brightness writes to API 1.44", async () => {
        const fc = setup();
        fc.config.apiVersion = "1.44.0";
        await useLedStrip().saveConfig();
        expect(
            vi.mocked(MSP.promise).mock.calls.some(([code]) => code === MSPCodes.MSP2_SET_LED_STRIP_CONFIG_VALUES),
        ).toBe(false);
    });
});
