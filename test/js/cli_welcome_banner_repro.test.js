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
const NORMAL_OUTPUT_CHUNKS = [
    "version\r\n",
    "Betaflight / STM32F7X2 (S7X2) 4.6.0 ",
    "Jan  1 2026 / 00:00:00\r\n\r\n# ",
];
const EXPECTED_HISTORY = `# ${NORMAL_OUTPUT_CHUNKS.join("")}`;

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
    // a read() event.
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

    it.each(cases)("%s: the welcome banner is kept out of outputHistory", (_label, chunks) => {
        const cli = makeCli();

        feed(cli, chunks);
        // Real traffic continuing after CLI entry, exactly as it would arrive from the FC.
        feed(cli, NORMAL_OUTPUT_CHUNKS);

        const history = getHistory(cli);

        // Exact history catches leaked partial suffixes that do not contain the full banner phrase.
        expect(history).toBe(EXPECTED_HISTORY);
        expect(countOccurrences(history, "Entering CLI Mode")).toBe(0);
    });

    // Entry validation must not come at the cost of losing or corrupting normal CLI traffic.
    it.each(cases)("%s: normal command output after entry is preserved", (_label, chunks) => {
        const cli = makeCli();

        feed(cli, chunks);
        expect(CONFIGURATOR.cliValid).toBe(true);

        feed(cli, NORMAL_OUTPUT_CHUNKS);

        const history = getHistory(cli);
        expect(countOccurrences(history, "Betaflight / STM32F7X2")).toBe(1);
    });
});
