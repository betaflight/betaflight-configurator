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
import { MspBuffer, MspDataView } from "../src/js/msp/mspBytes";
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
describe("LED overlay compatibility across connections", () => {
    it("keeps old/new warning and rainbow positions independent on decode and encode", async () => {
        const fc = useFlightControllerStore();
        for (const [version, warningBit] of [
            ["1.44.0", 17],
            ["1.46.0", 18],
            ["1.45.0", 17],
            ["1.49.0", 18],
        ] as const) {
            fc.resetState();
            fc.config.apiVersion = version;
            const mask = 0x77 | (2 << 8) | (1 << warningBit);
            decode(MSPCodes.MSP_LED_STRIP_CONFIG, [...new MspBuffer().push32(mask), 1, 2]);
            expect(fc.ledStrip[0].functions).toEqual(["a", "w"]);
            vi.mocked(MSP.promise).mockClear();
            await mspHelper.sendLedStripConfig();
            expect(MSP.promise).toHaveBeenLastCalledWith(MSPCodes.MSP_SET_LED_STRIP_CONFIG, [
                0,
                ...new MspBuffer().push32(mask),
            ]);
            if (warningBit === 18) {
                const rainbowMask = 0x77 | (1 << 13);
                decode(MSPCodes.MSP_LED_STRIP_CONFIG, [...new MspBuffer().push32(rainbowMask), 1, 2]);
                expect(fc.ledStrip[0].functions).toEqual(["c", "y"]);
                await mspHelper.sendLedStripConfig();
                expect(MSP.promise).toHaveBeenLastCalledWith(MSPCodes.MSP_SET_LED_STRIP_CONFIG, [
                    0,
                    ...new MspBuffer().push32(rainbowMask),
                ]);
            }
        }
    });
});
