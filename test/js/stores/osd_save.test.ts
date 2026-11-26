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
import { OSD } from "../../../src/components/tabs/osd/osd";
import MSP from "../../../src/js/msp";
import MSPCodes from "../../../src/js/msp/MSPCodes";
import { MspRefusedError } from "../../../src/js/msp/mspErrors";
import { useOsdStore } from "../../../src/stores/osd";

const saveToEeprom = vi.hoisted(() => vi.fn());
vi.mock("../../../src/composables/useReboot", () => ({ useReboot: () => ({ saveToEeprom }) }));

describe("osd store saveAllConfig", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        OSD.initData();
        saveToEeprom.mockReset();
        vi.spyOn(MSP, "promise").mockResolvedValue(undefined);
    });

    it("persists through saveToEeprom after the config writes", async () => {
        saveToEeprom.mockResolvedValue(undefined);

        await useOsdStore().saveAllConfig();

        expect(saveToEeprom).toHaveBeenCalledOnce();
        // the EEPROM write goes through saveToEeprom, not a raw MSP request
        expect(vi.mocked(MSP.promise).mock.calls.map(([code]) => code)).not.toContain(MSPCodes.MSP_EEPROM_WRITE);
    });

    it("rejects when the FC refuses the EEPROM write", async () => {
        saveToEeprom.mockRejectedValue(new MspRefusedError("refused"));

        await expect(useOsdStore().saveAllConfig()).rejects.toBeInstanceOf(MspRefusedError);
    });
});
