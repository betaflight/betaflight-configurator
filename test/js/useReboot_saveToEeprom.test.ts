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
import MSP, { type MspResponse } from "../../src/js/msp";
import MSPCodes from "../../src/js/msp/MSPCodes";
import { MspRefusedError } from "../../src/js/msp/mspErrors";
import { gui_log } from "../../src/js/gui_log";
import { useFlightControllerStore } from "../../src/stores/fc";
import { useReboot } from "../../src/composables/useReboot";

vi.mock("../../src/js/serial_backend", () => ({ reinitializeConnection: vi.fn() }));
vi.mock("../../src/js/tab_adapters", () => ({ tabSwitchCleanup: vi.fn() }));
vi.mock("../../src/js/msp/MSPHelper", () => ({ mspHelper: { disableArming: vi.fn(), writeConfiguration: vi.fn() } }));
vi.mock("../../src/js/msp", () => ({ default: { promise: vi.fn() } }));
vi.mock("../../src/js/gui_log", () => ({ gui_log: vi.fn() }));
vi.mock("../../src/js/localization", () => ({ i18n: { getMessage: (key: string) => key } }));

// The EEPROM write reply carries no payload, so the fake leaves `data` out; only the
// error-reply flag matters to saveToEeprom.
const eepromReply = (unsupported: number) =>
    ({ command: MSPCodes.MSP_EEPROM_WRITE, length: 0, crcError: false, unsupported }) as Omit<
        MspResponse,
        "data"
    > as MspResponse;

describe("saveToEeprom", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        setActivePinia(createPinia());
        useFlightControllerStore().config.armingDisabled = true;
    });

    it("resolves once the FC acknowledges the EEPROM write", async () => {
        vi.mocked(MSP.promise).mockResolvedValue(eepromReply(0));

        await expect(useReboot().saveToEeprom()).resolves.toBeUndefined();
        expect(gui_log).toHaveBeenCalledWith("configurationEepromSaved");
    });

    it("rejects when the FC refuses the EEPROM write with an error reply", async () => {
        vi.mocked(MSP.promise).mockResolvedValue(eepromReply(1));

        await expect(useReboot().saveToEeprom()).rejects.toBeInstanceOf(MspRefusedError);
        expect(gui_log).not.toHaveBeenCalled();
    });
});
