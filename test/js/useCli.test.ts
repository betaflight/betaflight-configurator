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
import { createPinia, setActivePinia } from "pinia";
import { useCli } from "../../src/composables/useCli";
import CliAutoComplete from "../../src/js/CliAutoComplete";
import FileSystem from "../../src/js/FileSystem";
import { serial } from "../../src/js/serial";

function key(name: string, ime: { isComposing?: boolean; keyCode?: number } = {}): KeyboardEvent {
    return { key: name, isComposing: false, keyCode: 0, ...ime, preventDefault: vi.fn() } as unknown as KeyboardEvent;
}

const UP = "ArrowUp";
const DOWN = "ArrowDown";
const ENTER = "Enter";

function sentText(send: ReturnType<typeof vi.spyOn>, call = 0): string {
    return new TextDecoder().decode(send.mock.calls[call][0] as Uint8Array);
}

describe("useCli", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // Runs first: the history lives at module scope and outlasts each useCli().
    describe("command history before anything was sent", () => {
        it("leaves an empty line on Up and Down, which Enter can still send", async () => {
            const send = vi.spyOn(serial, "send").mockResolvedValue(undefined);
            const cli = useCli();

            cli.handleCommandKeyUp(key(UP));
            expect(cli.state.commandInput).toBe("");
            cli.handleCommandKeyUp(key(DOWN));
            expect(cli.state.commandInput).toBe("");

            cli.handleCommandKeyDown(key(ENTER));
            await Promise.resolve();

            expect(send).toHaveBeenCalledOnce();
        });
    });

    describe("command history", () => {
        it("recalls sent commands with Up and walks forward with Down", () => {
            vi.spyOn(serial, "send").mockResolvedValue(undefined);
            const cli = useCli();

            for (const command of ["status", "version"]) {
                cli.state.commandInput = command;
                cli.handleCommandKeyDown(key(ENTER));
            }

            cli.handleCommandKeyUp(key(UP));
            expect(cli.state.commandInput).toBe("version");
            cli.handleCommandKeyUp(key(UP));
            expect(cli.state.commandInput).toBe("status");
            cli.handleCommandKeyUp(key(DOWN));
            expect(cli.state.commandInput).toBe("status");
            cli.handleCommandKeyUp(key(DOWN));
            expect(cli.state.commandInput).toBe("version");
        });
    });

    describe("keys in the command input", () => {
        it("closes an open dropdown on Escape, and leaves Escape alone otherwise", () => {
            const cli = useCli();
            const hide = vi.spyOn(cli.autocomplete, "hide");
            const isOpen = vi.spyOn(cli.autocomplete, "isOpen").mockReturnValue(false);

            const ignored = key("Escape");
            cli.handleCommandKeyDown(ignored);
            expect(ignored.preventDefault).not.toHaveBeenCalled();
            expect(hide).not.toHaveBeenCalled();

            isOpen.mockReturnValue(true);
            const handled = key("Escape");
            cli.handleCommandKeyDown(handled);
            expect(handled.preventDefault).toHaveBeenCalled();
            expect(hide).toHaveBeenCalledOnce();
        });

        it("moves through an open dropdown with the arrows, and leaves them to history otherwise", () => {
            const cli = useCli();
            const up = vi.spyOn(cli.autocomplete, "navigateUp");
            const down = vi.spyOn(cli.autocomplete, "navigateDown");
            const isOpen = vi.spyOn(cli.autocomplete, "isOpen").mockReturnValue(false);

            const ignored = key(UP);
            cli.handleCommandKeyDown(ignored);
            expect(ignored.preventDefault).not.toHaveBeenCalled();

            isOpen.mockReturnValue(true);
            cli.handleCommandKeyDown(key(UP));
            cli.handleCommandKeyDown(key(DOWN));

            expect(up).toHaveBeenCalledOnce();
            expect(down).toHaveBeenCalledOnce();
        });

        it("keeps history recall off while the dropdown is open", () => {
            const cli = useCli();
            vi.spyOn(cli.autocomplete, "isOpen").mockReturnValue(true);
            cli.state.commandInput = "typed";

            cli.handleCommandKeyUp(key(UP));

            expect(cli.state.commandInput).toBe("typed");
        });

        it("on Tab, picks the highlighted suggestion from an open dropdown", () => {
            vi.spyOn(CliAutoComplete, "isEnabled").mockReturnValue(true);
            const cli = useCli();
            vi.spyOn(cli.autocomplete, "isOpen").mockReturnValue(true);
            const select = vi.spyOn(cli.autocomplete, "selectItem");
            cli.autocomplete.activeIndex.value = 2;

            const tab = key("Tab");
            cli.handleCommandKeyDown(tab);

            expect(tab.preventDefault).toHaveBeenCalled();
            expect(select).toHaveBeenCalledWith(2);
        });

        it("on Tab, opens the dropdown when it is closed", () => {
            vi.spyOn(CliAutoComplete, "isEnabled").mockReturnValue(true);
            vi.spyOn(CliAutoComplete, "isBuilding").mockReturnValue(false);
            const cli = useCli();
            const openForced = vi.spyOn(cli.autocomplete, "openForced").mockImplementation(() => {});
            cli.state.commandInput = "set gyr";

            cli.handleCommandKeyDown(key("Tab"));

            expect(openForced).toHaveBeenCalledWith("set gyr");
        });

        it("on Tab without app autocomplete, asks the FC to complete the line", () => {
            vi.spyOn(CliAutoComplete, "isEnabled").mockReturnValue(false);
            const send = vi.spyOn(serial, "send").mockResolvedValue(undefined);
            const cli = useCli();
            cli.state.commandInput = "feat";

            cli.handleCommandKeyDown(key("Tab"));

            expect(sentText(send)).toBe("feat\t");
            expect(cli.state.commandInput).toBe("");
        });

        it("holds Enter while the autocomplete cache is building", () => {
            vi.spyOn(CliAutoComplete, "isBuilding").mockReturnValue(true);
            const send = vi.spyOn(serial, "send").mockResolvedValue(undefined);
            const cli = useCli();
            cli.state.commandInput = "status";

            const enter = key(ENTER);
            cli.handleCommandKeyDown(enter);

            expect(enter.preventDefault).toHaveBeenCalled();
            expect(send).not.toHaveBeenCalled();
            expect(cli.state.commandInput).toBe("status");
        });

        it("suppresses the default Enter keypress, so no newline lands in the input", () => {
            const cli = useCli();
            const enter = key(ENTER);
            const other = key("a");

            cli.handleCommandKeyPress(enter);
            cli.handleCommandKeyPress(other);

            expect(enter.preventDefault).toHaveBeenCalled();
            expect(other.preventDefault).not.toHaveBeenCalled();
        });
    });

    describe("keys while an IME is composing", () => {
        it.each([
            ["Chromium/Firefox, during composition", { isComposing: true, keyCode: 229 }],
            ["WebKit, the keydown that commits it", { isComposing: false, keyCode: 229 }],
        ])("ignores Enter and Tab (%s)", (_engine, ime) => {
            vi.spyOn(CliAutoComplete, "isEnabled").mockReturnValue(false);
            vi.spyOn(CliAutoComplete, "isBuilding").mockReturnValue(false);
            const send = vi.spyOn(serial, "send").mockResolvedValue(undefined);
            const cli = useCli();
            cli.state.commandInput = "get gyro_";

            const enter = key(ENTER, ime);
            const tab = key("Tab", ime);
            cli.handleCommandKeyDown(enter);
            cli.handleCommandKeyDown(tab);

            expect(send).not.toHaveBeenCalled();
            expect(enter.preventDefault).not.toHaveBeenCalled();
            expect(tab.preventDefault).not.toHaveBeenCalled();
            expect(cli.state.commandInput).toBe("get gyro_");
        });

        it("leaves an open dropdown alone", () => {
            const cli = useCli();
            vi.spyOn(cli.autocomplete, "isOpen").mockReturnValue(true);
            const hide = vi.spyOn(cli.autocomplete, "hide");
            const up = vi.spyOn(cli.autocomplete, "navigateUp");

            cli.handleCommandKeyDown(key("Escape", { isComposing: true }));
            cli.handleCommandKeyDown(key(UP, { isComposing: true }));

            expect(hide).not.toHaveBeenCalled();
            expect(up).not.toHaveBeenCalled();
        });

        it("does not recall history over the text being composed", () => {
            vi.spyOn(serial, "send").mockResolvedValue(undefined);
            const cli = useCli();
            cli.state.commandInput = "earlier";
            cli.handleCommandKeyDown(key(ENTER));
            cli.state.commandInput = "かな";

            cli.handleCommandKeyUp(key(UP, { isComposing: true }));

            expect(cli.state.commandInput).toBe("かな");
        });

        it("still sends once the composition is over", () => {
            const send = vi.spyOn(serial, "send").mockResolvedValue(undefined);
            const cli = useCli();
            cli.state.commandInput = "status";

            cli.handleCommandKeyDown(key(ENTER));

            expect(sentText(send)).toBe("status\n");
        });
    });

    describe("loadFile", () => {
        it("resolves null without reading anything when no file was picked", async () => {
            vi.spyOn(FileSystem, "pickOpenFile").mockResolvedValue(null);
            const readFile = vi.spyOn(FileSystem, "readFile");
            const cli = useCli();

            await expect(cli.loadFile()).resolves.toBeNull();

            expect(readFile).not.toHaveBeenCalled();
            expect(cli.snippetPreviewOpen.value).toBe(false);
        });

        it("previews a picked file and hands back a callback that sends it", async () => {
            vi.spyOn(FileSystem, "pickOpenFile").mockResolvedValue({ name: "diff.txt" });
            vi.spyOn(FileSystem, "readFile").mockResolvedValue("set a = 1");
            const send = vi.spyOn(serial, "send").mockResolvedValue(undefined);
            const cli = useCli();

            const run = await cli.loadFile();

            expect(cli.state.snippetPreview).toBe("set a = 1");
            expect(cli.snippetPreviewOpen.value).toBe(true);

            run!();

            expect(cli.snippetPreviewOpen.value).toBe(false);
            expect(sentText(send)).toBe("set a = 1\n");
        });
    });
});
