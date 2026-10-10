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

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useFlightControllerStore } from "../../src/stores/fc";
import { useCli, type Cli } from "../../src/composables/useCli";
import CliAutoComplete from "../../src/js/CliAutoComplete";
import { useAppInfoStore } from "../../src/stores/appInfo";
import BFClipboard from "../../src/js/Clipboard";
import { useConnectionStore } from "../../src/stores/connection";

// The firmware banner is transport-fragmented. Entry validation must therefore retain its state
// across read() callbacks or a split inside "CLI" prevents validation and drops later output.

const BANNER = "\r\nEntering CLI Mode, type 'exit' to reboot, or 'help'\r\n\r\n# ";

function bytes(str: string) {
    return new TextEncoder().encode(str);
}

function makeCli() {
    const cli = useCli();
    cli.windowWrapperRef.value = document.createElement("div");
    cli.cliWindowRef.value = document.createElement("div");
    return cli;
}

function feed(cli: Cli, chunks: string[]) {
    for (const chunk of chunks) {
        cli.read(bytes(chunk));
    }
}

function getHistory(cli: Cli) {
    const spy = vi.spyOn(BFClipboard, "writeText").mockImplementation(() => {});
    cli.copyToClipboard();
    const text = spy.mock.calls[0][0];
    spy.mockRestore();
    return text;
}

describe("useCli CLI-entry validation across serial read boundaries", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        useConnectionStore().cliActive = true;
        useConnectionStore().cliValid = false;
        CliAutoComplete.builder.state = "reset";
        useAppInfoStore().operatingSystem = "Linux";
    });

    afterEach(() => {
        CliAutoComplete.cleanup();
        CliAutoComplete.configEnabled = false;
        vi.restoreAllMocks();
        useConnectionStore().cliActive = false;
        useConnectionStore().cliValid = false;
    });

    it("preserves same-read normal output before autocomplete starts", () => {
        const cli = makeCli();
        useFlightControllerStore().config.flightControllerIdentifier = "BTFL";
        CliAutoComplete.configEnabled = true;
        CliAutoComplete.initialize(vi.fn(), vi.fn(), () => Date.now() - cli.state.lastArrival > 250);

        cli.read(bytes(`${BANNER}Betaflight / STM32F7X2\r`));

        expect(getHistory(cli)).toContain("Betaflight / STM32F7X2");
    });

    it("validates when 'CLI' is split across reads and preserves subsequent traffic", () => {
        const cli = makeCli();

        feed(cli, ["\r\nEntering CL", "I Mode, type 'exit' to reboot, or 'help'\r\n\r\n# "]);
        feed(cli, ["version\r\n", "Betaflight / STM32F7X2 (S7X2) 4.6.0 Jan  1 2026 / 00:00:00\r\n\r\n# "]);

        const history = getHistory(cli);

        expect(useConnectionStore().cliValid).toBe(true);
        expect(history).toContain("Betaflight / STM32F7X2");
    });

    it("validates a byte-fragmented banner and preserves subsequent traffic", () => {
        const cli = makeCli();

        feed(cli, BANNER.split(""));
        feed(cli, ["version\r\n", "Betaflight / STM32F7X2 (S7X2) 4.6.0 Jan  1 2026 / 00:00:00\r\n\r\n# "]);

        const history = getHistory(cli);

        expect(useConnectionStore().cliValid).toBe(true);
        expect(history).toContain("Betaflight / STM32F7X2");
    });
});
