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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sendCliCommand } = vi.hoisted(() => ({ sendCliCommand: vi.fn() }));

vi.mock("../../src/js/msp", () => ({ default: { send_cli_command: sendCliCommand } }));
vi.mock("../../src/js/localization", () => ({ i18n: { getMessage: (key: string) => key } }));
vi.mock("../../src/stores/dialog", () => ({ useDialogStore: () => ({ open: vi.fn(), close: vi.fn() }) }));

import { showCliPanel } from "../../src/js/cli_panel";
import type { CliCallback } from "../../src/js/msp";

function runCommand(command: string): CliCallback {
    const input = document.getElementById("cli-command") as HTMLInputElement;
    input.value = command;
    input.dispatchEvent(new Event("change"));
    return sendCliCommand.mock.calls.at(-1)?.[1] as CliCallback;
}

describe("CLI panel", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        sendCliCommand.mockReset();
        // Stands in for the dialog the panel opens.
        document.body.innerHTML = '<input id="cli-command" /><pre id="cli-response"></pre>';
        showCliPanel();
        vi.advanceTimersByTime(100);
    });

    afterEach(() => {
        vi.useRealTimers();
        document.body.innerHTML = "";
    });

    it("sends the command with a timeout, so an unanswered one cannot block the CLI queue", () => {
        runCommand("status");

        expect(sendCliCommand).toHaveBeenCalledWith("status", expect.any(Function), { timeoutMs: 5000 });
    });

    it("shows the response lines", () => {
        runCommand("status")(["line 1", "line 2"]);

        expect(document.getElementById("cli-response")?.textContent).toBe("\nline 1\nline 2\n");
        expect((document.getElementById("cli-command") as HTMLInputElement).value).toBe("");
    });

    it("shows the error when the command fails or times out", () => {
        runCommand("status")([], new Error("Timed out after 5000ms"));

        expect(document.getElementById("cli-response")?.textContent).toBe("\nTimed out after 5000ms\n");
    });
});
