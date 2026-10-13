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
import { flushPromises } from "@vue/test-utils";
import MSP from "../../src/js/msp";
import MSPCodes from "../../src/js/msp/MSPCodes";
import { MspDataView } from "../../src/js/msp/mspBytes";
import { mspHelper } from "../../src/js/msp/MSPHelper";
import { gui_log } from "../../src/js/gui_log";
import { tabSwitchCleanup } from "../../src/js/tab_adapters";
import { reinitializeConnection } from "../../src/js/serial_backend";
import { useFlightControllerStore } from "../../src/stores/fc";
import { useReboot } from "../../src/composables/useReboot";

vi.mock("../../src/js/msp", () => ({ default: { promise: vi.fn() } }));
vi.mock("../../src/js/msp/MSPHelper", () => ({ mspHelper: { disableArming: vi.fn() } }));
vi.mock("../../src/js/gui_log", () => ({ gui_log: vi.fn() }));
vi.mock("../../src/js/localization", () => ({ i18n: { getMessage: (key: string) => key } }));
vi.mock("../../src/js/serial_backend", () => ({ reinitializeConnection: vi.fn() }));
vi.mock("../../src/js/tab_adapters", () => ({ tabSwitchCleanup: vi.fn((callback: () => void) => callback()) }));

const acknowledged = () => ({
    command: MSPCodes.MSP_EEPROM_WRITE,
    data: new MspDataView(new ArrayBuffer(0)),
    length: 0,
    crcError: false,
    unsupported: 0,
});

describe("separate persistence and reboot", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setActivePinia(createPinia());
        useFlightControllerStore().config.armingDisabled = true;
        vi.mocked(MSP.promise).mockResolvedValue(acknowledged());
        vi.mocked(reinitializeConnection).mockReset();
    });

    it("waits for EEPROM acknowledgement before reporting saved", async () => {
        let acknowledge!: () => void;
        vi.mocked(MSP.promise).mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    acknowledge = () => resolve(acknowledged());
                }),
        );
        const pending = useReboot().saveToEeprom();
        await flushPromises();
        expect(gui_log).not.toHaveBeenCalled();
        expect(reinitializeConnection).not.toHaveBeenCalled();
        acknowledge();
        await pending;
        expect(gui_log).toHaveBeenCalledWith("configurationEepromSaved");
        expect(MSP.promise).toHaveBeenCalledWith(MSPCodes.MSP_EEPROM_WRITE);
    });

    it("rejects a refused EEPROM write without reporting saved", async () => {
        vi.mocked(MSP.promise).mockResolvedValue({ ...acknowledged(), unsupported: 1 });
        await expect(useReboot().saveToEeprom()).rejects.toThrow("refused");
        expect(gui_log).not.toHaveBeenCalled();
        expect(reinitializeConnection).not.toHaveBeenCalled();
    });

    it("rejects transport failure without reporting saved", async () => {
        vi.mocked(MSP.promise).mockRejectedValueOnce(new Error("EEPROM timeout"));
        await expect(useReboot().saveToEeprom()).rejects.toThrow("EEPROM timeout");
        expect(gui_log).not.toHaveBeenCalled();
    });

    it("retains the arming guard", async () => {
        useFlightControllerStore().config.armingDisabled = false;
        await useReboot().saveToEeprom();
        expect(mspHelper.disableArming).toHaveBeenCalledOnce();
    });

    it("reboots after cleanup without writing EEPROM again", async () => {
        const events: string[] = [];
        vi.mocked(tabSwitchCleanup).mockImplementationOnce((callback: () => void) => {
            events.push("cleanup");
            callback();
        });
        vi.mocked(reinitializeConnection).mockImplementationOnce(() => {
            events.push("reboot");
        });
        await useReboot().rebootAfterSave();
        expect(events).toEqual(["cleanup", "reboot"]);
        expect(MSP.promise).not.toHaveBeenCalled();
    });

    it("propagates a reboot error after successful persistence", async () => {
        const flow = useReboot();
        await flow.saveToEeprom();
        vi.mocked(reinitializeConnection).mockImplementationOnce(() => {
            throw new Error("reboot failed");
        });
        await expect(flow.rebootAfterSave()).rejects.toThrow("reboot failed");
        expect(MSP.promise).toHaveBeenCalledOnce();
        expect(gui_log).toHaveBeenCalledWith("configurationEepromSaved");
    });
});
