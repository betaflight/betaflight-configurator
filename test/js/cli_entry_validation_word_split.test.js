import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { useCli } from "../../src/composables/useCli";
import CliAutoComplete from "../../src/js/CliAutoComplete";
import CONFIGURATOR from "../../src/js/data_storage";
import GUI from "../../src/js/gui";
import BFClipboard from "../../src/js/Clipboard";

// NOT part of the #5445 fix. Discovered while building the #5445 reproduction harness
// (see cli_welcome_banner_repro.test.js) and reported separately per that investigation's
// scope rules — this is a different bug in the same code region, not the one #5445 describes.
//
// useCli.js's `validateText` (the buffer validateCliEntry() checks for the substring "CLI") is a
// variable local to a single read() call — it is rebuilt from empty on every serial read and never
// carries partial content across reads. If the 3-byte literal "CLI" itself is split across a
// read() boundary (e.g. one read ends "...Entering CL", the next begins "I Mode..."), neither
// read's isolated validateText ever contains the full substring, so CONFIGURATOR.cliValid never
// becomes true. Because the `!cliValid` branch never records bytes into outputHistory (only into
// the doomed, per-call validateText), every subsequent byte — the rest of the banner, the prompt,
// and any real command output — is silently discarded for the remainder of the session.
//
// This is materially worse than #5445's hypothesized banner-duplication: it's total data loss,
// not a duplicated fragment, and it does not require finding a specific reproduction — it happens
// whenever a read() boundary lands inside the 3-byte word "CLI", which is a near-certainty in the
// "extremely fragmented reads" case #5445 itself asked to test.
//
// These assert the current (buggy) behavior directly rather than using it.fails(): it.fails()
// would pass for ANY thrown error, including an unrelated exception from makeCli()/feed()/
// getHistory(), which would silently mask a different failure instead of documenting this one.
// Asserting the buggy values directly means setup errors fail the test as themselves, and the
// test will start *failing* — flagging that this file needs updating — the moment someone fixes
// the underlying gap.

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

describe("useCli: CLI entry never validates when 'CLI' itself is split across reads (separate from #5445)", () => {
    beforeEach(() => {
        CONFIGURATOR.cliActive = true;
        CONFIGURATOR.cliValid = false;
        CliAutoComplete.builder.state = "reset";
        GUI.operating_system = "Linux";
    });

    afterEach(() => {
        vi.restoreAllMocks();
        CONFIGURATOR.cliActive = false;
        CONFIGURATOR.cliValid = false;
        CliAutoComplete.builder.state = "reset";
    });

    it("BUG: splitting 'CL' | 'I...' leaves cliValid false and drops all subsequent traffic", () => {
        const cli = makeCli();

        feed(cli, ["\r\nEntering CL", "I Mode, type 'exit' to reboot, or 'help'\r\n\r\n# "]);
        feed(cli, ["version\r\n", "Betaflight / STM32F7X2 (S7X2) 4.6.0 Jan  1 2026 / 00:00:00\r\n\r\n# "]);

        const history = getHistory(cli);

        // Current (buggy) behavior. Once the underlying gap is fixed, cliValid should become
        // true and the version response should be recorded — flip these assertions then.
        expect(CONFIGURATOR.cliValid).toBe(false);
        expect(history).not.toContain("Betaflight / STM32F7X2");
    });

    it("BUG: byte-by-byte fragmentation of the whole banner leaves cliValid false", () => {
        const cli = makeCli();

        feed(cli, BANNER.split(""));
        feed(cli, ["version\r\n", "Betaflight / STM32F7X2 (S7X2) 4.6.0 Jan  1 2026 / 00:00:00\r\n\r\n# "]);

        const history = getHistory(cli);

        expect(CONFIGURATOR.cliValid).toBe(false);
        expect(history).not.toContain("Betaflight / STM32F7X2");
    });
});
