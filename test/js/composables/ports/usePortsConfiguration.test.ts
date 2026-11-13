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
import { flushPromises } from "@vue/test-utils";
import MSP from "@/js/msp";
import MSPCodes from "@/js/msp/MSPCodes";
import { MspCancelledError } from "@/js/msp/mspErrors";
import { gui_log } from "@/js/gui_log";
import { usePortsConfiguration } from "@/composables/ports/usePortsConfiguration";

const { saveToEeprom, reboot } = vi.hoisted(() => ({ saveToEeprom: vi.fn(), reboot: vi.fn() }));
vi.mock("@/js/tab_adapters", () => ({ tabSwitchCleanup: (callback: () => void) => callback() }));
vi.mock("@/js/msp", () => ({ default: { promise: vi.fn() } }));
vi.mock("@/js/msp/MSPHelper", () => ({ mspHelper: { crunch: (code: number) => [code] } }));
vi.mock("@/js/gui_log", () => ({ gui_log: vi.fn() }));
vi.mock("@/js/localization", () => ({ i18n: { getMessage: (key: string) => key } }));
vi.mock("@/js/Analytics", () => ({ getTracking: () => undefined }));
vi.mock("@/composables/useReboot", () => ({ useReboot: () => ({ saveToEeprom, reboot }) }));
vi.mock("@/stores/fc", () => ({
    useFlightControllerStore: () => ({
        serialConfig: { ports: [] },
        features: { features: { enable: vi.fn(), disable: vi.fn() } },
    }),
}));

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<undefined>((done) => {
        resolve = () => done(undefined);
    });
    return { promise, resolve };
}

describe("Ports toolbar saving state", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.mocked(MSP.promise).mockResolvedValue(undefined);
        saveToEeprom.mockResolvedValue(undefined);
    });

    it("stays busy across both writes and persistence, rejecting duplicate clicks", async () => {
        const serial = deferred();
        const features = deferred();
        const persist = deferred();
        vi.mocked(MSP.promise).mockReturnValueOnce(serial.promise).mockReturnValueOnce(features.promise);
        saveToEeprom.mockReturnValueOnce(persist.promise);
        const { saveConfig, isSaving } = usePortsConfiguration([], {}, []);
        const saving = saveConfig();
        expect(isSaving.value).toBe(true);
        await saveConfig();
        expect(MSP.promise).toHaveBeenCalledTimes(1);
        expect(saveToEeprom).not.toHaveBeenCalled();

        serial.resolve();
        await flushPromises();
        expect(isSaving.value).toBe(true);
        expect(MSP.promise).toHaveBeenNthCalledWith(2, MSPCodes.MSP_SET_FEATURE_CONFIG, [
            MSPCodes.MSP_SET_FEATURE_CONFIG,
        ]);
        expect(saveToEeprom).not.toHaveBeenCalled();

        features.resolve();
        await flushPromises();
        expect(isSaving.value).toBe(true);
        expect(saveToEeprom).toHaveBeenCalledTimes(1);
        expect(reboot).not.toHaveBeenCalled();
        persist.resolve();
        await saving;
        expect(isSaving.value).toBe(false);
        expect(reboot).toHaveBeenCalledTimes(1);
    });

    it.each(["serial", "features", "persist"])(
        "clears busy state after a %s failure and allows retry",
        async (step) => {
            const error = new Error("write rejected");
            const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
            if (step === "serial") vi.mocked(MSP.promise).mockRejectedValueOnce(error);
            if (step === "features")
                vi.mocked(MSP.promise).mockResolvedValueOnce(undefined).mockRejectedValueOnce(error);
            if (step === "persist") saveToEeprom.mockRejectedValueOnce(error);
            const { saveConfig, isSaving } = usePortsConfiguration([], {}, []);
            try {
                await saveConfig();
                expect(isSaving.value).toBe(false);
                expect(gui_log).toHaveBeenCalledWith("configurationSaveFailed");
                expect(reboot).not.toHaveBeenCalled();
                if (step !== "persist") expect(saveToEeprom).not.toHaveBeenCalled();
                await saveConfig();
                expect(isSaving.value).toBe(false);
                expect(gui_log).toHaveBeenCalledWith("portsEepromSave");
            } finally {
                consoleError.mockRestore();
            }
        },
    );
    it("clears busy state without rebooting when persistence is cancelled", async () => {
        saveToEeprom.mockRejectedValueOnce(new MspCancelledError());
        const { saveConfig, isSaving } = usePortsConfiguration([], {}, []);
        await saveConfig();
        expect(isSaving.value).toBe(false);
        expect(reboot).not.toHaveBeenCalled();
        expect(gui_log).not.toHaveBeenCalled();
        await saveConfig();
        expect(reboot).toHaveBeenCalledTimes(1);
    });
});
