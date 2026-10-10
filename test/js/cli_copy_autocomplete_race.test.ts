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
import { useCli, type Cli } from "../../src/composables/useCli";
import CliAutoComplete from "../../src/js/CliAutoComplete";
import { useAppInfoStore } from "../../src/stores/appInfo";
import BFClipboard from "../../src/js/Clipboard";
import { useConnectionStore } from "../../src/stores/connection";

function bytes(str: string) {
    return new TextEncoder().encode(str);
}

// Documents the suppression contract in useCli.ts read()/writeLineToOutput (see cli_autocomplete_idle_gate.test.js for the fix that keeps builds from starting over an in-flight command).
describe("useCli output during CliAutoComplete build", () => {
    let cli: Cli;

    beforeEach(() => {
        setActivePinia(createPinia());
        useConnectionStore().cliActive = true;
        useConnectionStore().cliValid = true;
        CliAutoComplete.builder.state = "reset";
        useAppInfoStore().operatingSystem = "Linux";

        cli = useCli();
        cli.windowWrapperRef.value = document.createElement("div");
        cli.cliWindowRef.value = document.createElement("div");
    });

    afterEach(() => {
        vi.restoreAllMocks();
        useConnectionStore().cliActive = false;
        useConnectionStore().cliValid = false;
        CliAutoComplete.builder.state = "reset";
    });

    it("drops any output that streams in while isBuilding() is true", () => {
        CliAutoComplete.builder.state = "init";
        cli.read(bytes("FAKE_VERSION_OUTPUT\r"));

        CliAutoComplete.builder.state = "done";
        cli.read(bytes("FAKE_TASKS_OUTPUT\r"));

        const writeTextSpy = vi.spyOn(BFClipboard, "writeText").mockImplementation(() => {});
        cli.copyToClipboard();

        expect(writeTextSpy).toHaveBeenCalled();
        const copiedText = writeTextSpy.mock.calls[0][0];
        expect(copiedText).toContain("FAKE_TASKS_OUTPUT");
        expect(copiedText).not.toContain("FAKE_VERSION_OUTPUT");
    });
});
