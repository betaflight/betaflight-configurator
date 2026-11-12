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
import { gui_log } from "@/js/gui_log";
import { usePortsConfiguration } from "@/composables/ports/usePortsConfiguration";

const { saveAndReboot } = vi.hoisted(() => ({ saveAndReboot: vi.fn() }));
vi.mock("@/js/msp", () => ({ default: { promise: vi.fn() } }));
vi.mock("@/js/msp/MSPHelper", () => ({ mspHelper: { crunch: (code: number) => [code] } }));
vi.mock("@/js/gui_log", () => ({ gui_log: vi.fn() }));
vi.mock("@/js/localization", () => ({ i18n: { getMessage: (key: string) => key } }));
vi.mock("@/js/Analytics", () => ({ getTracking: () => undefined }));
vi.mock("@/composables/useReboot", () => ({ useReboot: () => ({ saveAndReboot }) }));
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
        saveAndReboot.mockResolvedValue(undefined);
    });

    it("stays busy across both writes and persistence, rejecting duplicate clicks", async () => {
        const serial = deferred();
        const features = deferred();
        const persist = deferred();
        vi.mocked(MSP.promise).mockReturnValueOnce(serial.promise).mockReturnValueOnce(features.promise);
        saveAndReboot.mockReturnValueOnce(persist.promise);
        const { saveConfig, isSaving } = usePortsConfiguration([], {}, []);
        const saving = saveConfig();
        expect(isSaving.value).toBe(true);
        await saveConfig();
        expect(MSP.promise).toHaveBeenCalledTimes(1);
        expect(saveAndReboot).not.toHaveBeenCalled();

        serial.resolve();
        await flushPromises();
        expect(isSaving.value).toBe(true);
        expect(MSP.promise).toHaveBeenNthCalledWith(2, MSPCodes.MSP_SET_FEATURE_CONFIG, [
            MSPCodes.MSP_SET_FEATURE_CONFIG,
        ]);
        expect(saveAndReboot).not.toHaveBeenCalled();

        features.resolve();
        await flushPromises();
        expect(isSaving.value).toBe(true);
        expect(saveAndReboot).toHaveBeenCalledTimes(1);
        persist.resolve();
        await saving;
        expect(isSaving.value).toBe(false);
    });

    it.each(["serial", "features", "persist"])(
        "clears busy state after a %s failure and allows retry",
        async (step) => {
            const error = new Error("write rejected");
            const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
            if (step === "serial") vi.mocked(MSP.promise).mockRejectedValueOnce(error);
            if (step === "features")
                vi.mocked(MSP.promise).mockResolvedValueOnce(undefined).mockRejectedValueOnce(error);
            if (step === "persist") saveAndReboot.mockRejectedValueOnce(error);
            const { saveConfig, isSaving } = usePortsConfiguration([], {}, []);
            try {
                await saveConfig();
                expect(isSaving.value).toBe(false);
                expect(gui_log).toHaveBeenCalledWith("configurationSaveFailed");
                if (step !== "persist") expect(saveAndReboot).not.toHaveBeenCalled();
                await saveConfig();
                expect(isSaving.value).toBe(false);
                expect(gui_log).toHaveBeenCalledWith("portsEepromSave");
            } finally {
                consoleError.mockRestore();
            }
        },
    );
});
