import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import CliAutoComplete from "../../src/js/CliAutoComplete";

describe("CliAutoComplete.builderStart idle gating", () => {
    let sendLine;
    let writeToOutput;

    beforeEach(() => {
        vi.useFakeTimers();
        CliAutoComplete.builder = { state: "reset", numFails: 0 };
        CliAutoComplete.configEnabled = true;
        sendLine = vi.fn();
        writeToOutput = vi.fn();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("starts immediately when the channel is already idle", () => {
        CliAutoComplete.initialize(sendLine, writeToOutput, () => true);

        CliAutoComplete.builderStart();

        expect(CliAutoComplete.isBuilding()).toBe(true);
        expect(sendLine).toHaveBeenCalled();
    });

    it("defers rather than starting while a command response is still in flight", () => {
        let idle = false;
        CliAutoComplete.initialize(sendLine, writeToOutput, () => idle);

        // simulates the watchdog retry / setEnabled() firing while a user command is still in flight
        CliAutoComplete.builderStart();

        expect(CliAutoComplete.isBuilding()).toBe(false);
        expect(sendLine).not.toHaveBeenCalled();

        // channel goes quiet; the deferred retry (every 250ms) should now proceed
        idle = true;
        vi.advanceTimersByTime(250);

        expect(CliAutoComplete.isBuilding()).toBe(true);
        expect(sendLine).toHaveBeenCalled();
    });

    it("keeps deferring across multiple retries until idle", () => {
        let idle = false;
        CliAutoComplete.initialize(sendLine, writeToOutput, () => idle);

        CliAutoComplete.builderStart();
        vi.advanceTimersByTime(250);
        vi.advanceTimersByTime(250);

        expect(CliAutoComplete.isBuilding()).toBe(false);
        expect(sendLine).not.toHaveBeenCalled();

        idle = true;
        vi.advanceTimersByTime(250);

        expect(CliAutoComplete.isBuilding()).toBe(true);
    });

    it("cancels a pending deferred retry on cleanup so it can't fire after disconnect", () => {
        CliAutoComplete.initialize(sendLine, writeToOutput, () => false);

        CliAutoComplete.builderStart();
        expect(CliAutoComplete.isBuilding()).toBe(false);

        CliAutoComplete.cleanup();
        vi.advanceTimersByTime(10_000);

        expect(CliAutoComplete.isBuilding()).toBe(false);
        expect(sendLine).not.toHaveBeenCalled();
    });
});
