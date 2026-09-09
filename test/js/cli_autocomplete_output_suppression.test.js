import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { useCli } from "../../src/composables/useCli";
import CliAutoComplete from "../../src/js/CliAutoComplete";
import CONFIGURATOR from "../../src/js/data_storage";
import FC from "../../src/js/fc";
import GUI from "../../src/js/gui";
import BFClipboard from "../../src/js/Clipboard";

function bytes(str) {
    return new TextEncoder().encode(str);
}

// The cache builder's own help/dump/get traffic must never reach the CLI window or the saved/copied
// history, including the tail that keeps arriving after the watchdog has given up on a slow FC.
describe("useCli output suppression around CliAutoComplete", () => {
    let cli;

    beforeEach(() => {
        vi.useFakeTimers();
        CONFIGURATOR.cliActive = true;
        CONFIGURATOR.cliValid = true;
        FC.CONFIG.flightControllerIdentifier = "BTFL";
        CliAutoComplete.builder = { state: "reset", numFails: 0, draining: false };
        CliAutoComplete.configEnabled = true;
        GUI.operating_system = "Linux";

        cli = useCli();
        cli.windowWrapperRef.value = document.createElement("div");
        cli.cliWindowRef.value = document.createElement("div");

        CliAutoComplete.initialize(
            vi.fn(),
            () => {},
            () => true,
        );
    });

    afterEach(() => {
        CliAutoComplete.cleanup();
        vi.useRealTimers();
        vi.restoreAllMocks();
        CONFIGURATOR.cliActive = false;
        CONFIGURATOR.cliValid = false;
    });

    function historyText() {
        const spy = vi.spyOn(BFClipboard, "writeText").mockImplementation(() => {});
        cli.copyToClipboard();
        const text = spy.mock.calls[0][0];
        spy.mockRestore();
        return text;
    }

    function visibleText() {
        vi.advanceTimersByTime(100); // let the buffered output flush
        return cli.windowWrapperRef.value.textContent;
    }

    function startBuildAndReachHelp() {
        CliAutoComplete.builderStart();
        cli.read(bytes(`${CliAutoComplete.builder.sentinel}\r`));
        expect(CliAutoComplete.builder.state).toBe("parse-help");
    }

    function failWatchdog() {
        vi.advanceTimersByTime(3000); // first timeout retries
        vi.advanceTimersByTime(3000); // second timeout gives up
        expect(CliAutoComplete.builder.state).toBe("fail");
    }

    it("keeps the response tail that lands after the watchdog gives up out of history and window", () => {
        startBuildAndReachHelp();
        cli.read(bytes("adjrange\rbeeper\r"));
        failWatchdog();

        cli.read(bytes("set gyro_lpf1_static_hz = 250\rset dyn_notch_count = 3\r"));

        expect(historyText()).not.toContain("gyro_lpf1_static_hz");
        expect(visibleText()).not.toContain("gyro_lpf1_static_hz");
    });

    it("resumes normal output once the trailing sentinel arrives", () => {
        startBuildAndReachHelp();
        failWatchdog();

        // the retry regenerated the sentinel; that last one sent is what ends the drain
        const sentinel = CliAutoComplete.builder.sentinel;
        cli.read(bytes(`set dyn_notch_count = 3\r${sentinel}\r`));
        expect(CliAutoComplete.isSuppressingOutput()).toBe(false);

        cli.read(bytes("REAL_USER_OUTPUT\r"));

        expect(historyText()).toContain("REAL_USER_OUTPUT");
        expect(historyText()).not.toContain("dyn_notch_count");
    });

    it("stops suppressing after the drain cap when the sentinel never comes back", () => {
        startBuildAndReachHelp();
        failWatchdog();
        expect(CliAutoComplete.isSuppressingOutput()).toBe(true);

        vi.advanceTimersByTime(6000);

        expect(CliAutoComplete.isSuppressingOutput()).toBe(false);
        cli.read(bytes("REAL_USER_OUTPUT\r"));
        expect(historyText()).toContain("REAL_USER_OUTPUT");
    });

    it("discards a line left half-received when the builder gave up mid-line", () => {
        startBuildAndReachHelp();

        cli.read(bytes("set gyro_lpf1_st")); // chunk boundary lands mid-line
        failWatchdog();
        cli.read(bytes(`atic_hz = 250\r${CliAutoComplete.builder.sentinel}\r`));
        expect(CliAutoComplete.isSuppressingOutput()).toBe(false);

        expect(historyText()).toBe("");
        expect(visibleText()).not.toContain("atic_hz");
    });

    it("does not splice a stale builder half-line onto output resuming after the drain cap", () => {
        startBuildAndReachHelp();
        cli.read(bytes("set gyro_lpf1_st")); // FC goes silent mid-line and never sends the sentinel
        failWatchdog();

        vi.advanceTimersByTime(6000);
        cli.read(bytes("REAL_USER_OUTPUT\r"));

        expect(visibleText()).not.toContain("gyro_lpf1_st");
        expect(historyText()).toContain("REAL_USER_OUTPUT");
    });

    it("does not leak the character that completes the build into history", () => {
        CliAutoComplete.builderStart();
        const sentinel = CliAutoComplete.builder.sentinel;

        for (let i = 0; i < 5; i++) {
            cli.read(bytes(`${sentinel}\r`));
        }

        expect(CliAutoComplete.builder.state).toBe("done");
        expect(historyText()).toBe("");
    });
});
