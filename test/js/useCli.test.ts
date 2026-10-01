import { afterEach, describe, expect, it, vi } from "vitest";
import { useCli } from "../../src/composables/useCli";
import FileSystem from "../../src/js/FileSystem";
import { serial } from "../../src/js/serial";

function key(code: number): KeyboardEvent {
    return { which: code, keyCode: code, preventDefault: vi.fn() } as unknown as KeyboardEvent;
}

const UP = 38;
const DOWN = 40;
const ENTER = 13;

describe("useCli", () => {
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
            expect(new TextDecoder().decode(send.mock.calls[0][0] as Uint8Array)).toBe("set a = 1\n");
        });
    });
});
