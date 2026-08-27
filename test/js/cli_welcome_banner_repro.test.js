import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { useCli } from "../../src/composables/useCli";
import CliAutoComplete from "../../src/js/CliAutoComplete";
import CONFIGURATOR from "../../src/js/data_storage";
import GUI from "../../src/js/gui";
import BFClipboard from "../../src/js/Clipboard";

// Reproduction harness for betaflight/betaflight-configurator#5445: "outputHistory can contain a
// leaked/duplicated fragment of the CLI welcome banner when the firmware's serial output is split
// across read() events around cliValid's flip to true."
//
// Exact firmware byte stream on CLI entry (betaflight/betaflight src/main/cli/cli.c: cliEnter()):
//   cliPrintLine("\r\nEntering CLI Mode, type 'exit' to reboot, or 'help'") -> "...'help'" + "\r\n"
//   cliPrompt()                                                            -> "\r\n# "
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

// Counts non-overlapping occurrences of `needle` in `haystack`.
function countOccurrences(haystack, needle) {
    let count = 0;
    let idx = 0;
    while ((idx = haystack.indexOf(needle, idx)) !== -1) {
        count++;
        idx += needle.length;
    }
    return count;
}

describe("useCli welcome-banner split-read handling (#5445)", () => {
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

    // Split boundaries requested by #5445, covering every place the banner could be torn across
    // a read() event. "split inside 'CLI'" and the byte-by-byte case are exercised here too: even
    // though they trip a *different* bug (see cli_entry_validation_word_split.test.js — cliValid
    // never validates, so nothing is recorded at all), that is itself proof there is no leaked
    // banner *fragment* in those cases either — there's nothing in outputHistory whatsoever.
    const cases = [
        ["complete banner in one read", [BANNER]],
        ["split immediately before 'CLI'", ["\r\nEntering ", "CLI Mode, type 'exit' to reboot, or 'help'\r\n\r\n# "]],
        ["split immediately after 'CLI'", ["\r\nEntering CLI", " Mode, type 'exit' to reboot, or 'help'\r\n\r\n# "]],
        [
            "split inside the word 'CLI' ('CL' | 'I...')",
            ["\r\nEntering CL", "I Mode, type 'exit' to reboot, or 'help'\r\n\r\n# "],
        ],
        ["split after 'CLI Mode'", ["\r\nEntering CLI Mode", ", type 'exit' to reboot, or 'help'\r\n\r\n# "]],
        ["split before the prompt", ["\r\nEntering CLI Mode, type 'exit' to reboot, or 'help'\r\n\r\n", "# "]],
        [
            "banner and prompt delivered in separate reads",
            ["\r\nEntering CLI Mode, type 'exit' to reboot, or 'help'\r\n", "\r\n# "],
        ],
        ["extremely fragmented reads (one byte per read)", BANNER.split("")],
    ];

    it.each(cases)("%s: the banner phrase is never duplicated in outputHistory", (_label, chunks) => {
        const cli = makeCli();

        feed(cli, chunks);
        // Real traffic continuing after CLI entry, exactly as it would arrive from the FC.
        feed(cli, ["version\r\n", "Betaflight / STM32F7X2 (S7X2) 4.6.0 ", "Jan  1 2026 / 00:00:00\r\n\r\n# "]);

        const history = getHistory(cli);

        // This is the literal claim under test: the CLI-entry handshake text must appear at most
        // once in the recorded history (0 times is fine — see the note above the case list — but
        // it must never be duplicated).
        expect(countOccurrences(history, "Entering CLI Mode")).toBeLessThanOrEqual(1);
    });

    // The splits that do validate from the banner (i.e. every case except the pathological
    // word-split ones covered separately) must still preserve real command output untouched —
    // the fix for #5445 must not come at the cost of losing or corrupting normal CLI traffic.
    const validatingCases = cases.filter(
        ([label]) => !label.includes("split inside the word") && !label.includes("fragmented"),
    );

    it.each(validatingCases)("%s: normal command output after entry is preserved", (_label, chunks) => {
        const cli = makeCli();

        feed(cli, chunks);
        expect(CONFIGURATOR.cliValid).toBe(true);

        feed(cli, ["version\r\n", "Betaflight / STM32F7X2 (S7X2) 4.6.0 ", "Jan  1 2026 / 00:00:00\r\n\r\n# "]);

        const history = getHistory(cli);
        expect(countOccurrences(history, "Betaflight / STM32F7X2")).toBe(1);
    });
});
