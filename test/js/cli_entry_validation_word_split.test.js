import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { useCli } from "../../src/composables/useCli";
import CliAutoComplete from "../../src/js/CliAutoComplete";
import CONFIGURATOR from "../../src/js/data_storage";
import FC from "../../src/js/fc";
import GUI from "../../src/js/gui";
import BFClipboard from "../../src/js/Clipboard";

// The firmware banner is transport-fragmented. Entry validation must therefore retain its state
// across read() callbacks or a split inside "CLI" prevents validation and drops later output.

const BANNER = "\r\nEntering CLI Mode, type 'exit' to reboot, or 'help'\r\n\r\n# ";

function bytes(str) {
    return new TextEncoder().encode(str);
}

function makeCli() {
    const cli = useCli();
    cli.windowWrapperRef.value = document.createElement("div");
    cli.cliWindowRef.value = document.createElement("div");
    return cli;
}

function feed(cli, chunks) {
    for (const chunk of chunks) {
        cli.read(bytes(chunk));
    }
}

function getHistory(cli) {
    const spy = vi.spyOn(BFClipboard, "writeText").mockImplementation(() => {});
    cli.copyToClipboard();
    const text = spy.mock.calls[0][0];
    spy.mockRestore();
    return text;
}

describe("useCli CLI-entry validation across serial read boundaries", () => {
    beforeEach(() => {
        CONFIGURATOR.cliActive = true;
        CONFIGURATOR.cliValid = false;
        CliAutoComplete.builder.state = "reset";
        GUI.operating_system = "Linux";
    });

    afterEach(() => {
        CliAutoComplete.cleanup();
        CliAutoComplete.configEnabled = false;
        FC.CONFIG.flightControllerIdentifier = "";
        vi.restoreAllMocks();
        CONFIGURATOR.cliActive = false;
        CONFIGURATOR.cliValid = false;
    });

    it("preserves same-read normal output before autocomplete starts", () => {
        const cli = makeCli();
        FC.CONFIG.flightControllerIdentifier = "BTFL";
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

        expect(CONFIGURATOR.cliValid).toBe(true);
        expect(history).toContain("Betaflight / STM32F7X2");
    });

    it("validates a byte-fragmented banner and preserves subsequent traffic", () => {
        const cli = makeCli();

        feed(cli, BANNER.split(""));
        feed(cli, ["version\r\n", "Betaflight / STM32F7X2 (S7X2) 4.6.0 Jan  1 2026 / 00:00:00\r\n\r\n# "]);

        const history = getHistory(cli);

        expect(CONFIGURATOR.cliValid).toBe(true);
        expect(history).toContain("Betaflight / STM32F7X2");
    });
});
