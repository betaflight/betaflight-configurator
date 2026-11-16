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
import { vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useFlightControllerStore } from "../src/stores/fc";
import MSP from "../src/js/msp";
import { mspHelper } from "../src/js/msp/MSPHelper";
import { MspDataView } from "../src/js/msp/mspBytes";

export function resetLedTestState() {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.mocked(MSP.promise).mockReset().mockResolvedValue(undefined);
}

export function decodeMsp(code: number, payload: number[]) {
    mspHelper.process_data({
        code,
        dataView: new MspDataView(new Uint8Array(payload).buffer),
        crcError: false,
        unsupported: 0,
        callbacks: [],
    });
}

export function setupLedStore() {
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
