import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { useCli } from "../../src/composables/useCli";
import CliAutoComplete from "../../src/js/CliAutoComplete";
import CONFIGURATOR from "../../src/js/data_storage";
import GUI from "../../src/js/gui";
import BFClipboard from "../../src/js/Clipboard";

function bytes(str) {
    return new TextEncoder().encode(str);
}

// Documents the suppression contract in useCli.js read()/writeLineToOutput (see cli_autocomplete_idle_gate.test.js for the fix that keeps builds from starting over an in-flight command).
describe("useCli output during CliAutoComplete build", () => {
    let cli;

    beforeEach(() => {
        CONFIGURATOR.cliActive = true;
        CONFIGURATOR.cliValid = true;
        CliAutoComplete.builder.state = "reset";
        GUI.operating_system = "Linux";

        cli = useCli();
        cli.windowWrapperRef.value = document.createElement("div");
        cli.cliWindowRef.value = document.createElement("div");
    });

    afterEach(() => {
        vi.restoreAllMocks();
        CONFIGURATOR.cliActive = false;
        CONFIGURATOR.cliValid = false;
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
