import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MSP from "../../src/js/msp";
import { serial } from "../../src/js/serial";

const STX = 0x02;
const ETX = 0x03;
const LF = 0x0a;

function toReadInfo(bytes) {
    return { data: new Uint8Array(bytes).buffer };
}

function responseBytes(body) {
    const bytes = [STX];
    for (let i = 0; i < body.length; i++) {
        bytes.push(body.charCodeAt(i));
    }
    bytes.push(LF, ETX);
    return bytes;
}

describe("MSP CLI queue", () => {
    let serialSendSpy;

    beforeEach(() => {
        vi.useFakeTimers();
        serialSendSpy = vi.spyOn(serial, "send").mockImplementation(() => {});
        MSP.cli_queue.length = 0;
        MSP.cli_in_flight = null;
        MSP.cli_callback = null;
        MSP.cli_buffer.length = 0;
        MSP.cli_output.length = 0;
        MSP.cli_discarding = false;
        if (MSP.cli_timer) {
            clearTimeout(MSP.cli_timer);
            MSP.cli_timer = null;
        }
        if (MSP.cli_drain_timer) {
            clearTimeout(MSP.cli_drain_timer);
            MSP.cli_drain_timer = null;
        }
        MSP.state = MSP.decoder_states.IDLE;
    });

    afterEach(() => {
        if (MSP.cli_timer) {
            clearTimeout(MSP.cli_timer);
            MSP.cli_timer = null;
        }
        if (MSP.cli_drain_timer) {
            clearTimeout(MSP.cli_drain_timer);
            MSP.cli_drain_timer = null;
        }
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("serialises commands in push order", () => {
        const order = [];

        MSP.send_cli_command("first", (lines) => order.push(["first", lines]));
        MSP.send_cli_command("second", (lines) => order.push(["second", lines]));

        expect(serialSendSpy).toHaveBeenCalledTimes(1);

        MSP.read(toReadInfo(responseBytes("hello-first")));
        expect(order).toEqual([["first", ["hello-first", ""]]]);
        expect(serialSendSpy).toHaveBeenCalledTimes(2);

        MSP.read(toReadInfo(responseBytes("hello-second")));
        expect(order).toEqual([
            ["first", ["hello-first", ""]],
            ["second", ["hello-second", ""]],
        ]);
    });

    it("fires the callback with an error when a command times out", () => {
        const results = [];
        MSP.send_cli_command("slow", (lines, error) => results.push({ cmd: "slow", lines, error }), { timeoutMs: 100 });

        vi.advanceTimersByTime(150);

        expect(results).toHaveLength(1);
        expect(results[0].cmd).toBe("slow");
        expect(results[0].error).toBeInstanceOf(Error);
        expect(results[0].error.message).toMatch(/Timed out after 100ms/);
        expect(MSP.cli_discarding).toBe(true);
    });

    it("drains a late response in full before sending the next command", () => {
        const results = [];
        MSP.send_cli_command("slow", (lines, error) => results.push({ cmd: "slow", error }), { timeoutMs: 100 });
        MSP.send_cli_command("fast", (lines, error) => results.push({ cmd: "fast", lines, error }));

        expect(serialSendSpy).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(150);
        // "fast" must not have been sent yet — we're still draining.
        expect(serialSendSpy).toHaveBeenCalledTimes(1);
        expect(MSP.cli_discarding).toBe(true);

        // The firmware's late response for "slow" finally arrives.
        MSP.read(toReadInfo(responseBytes("late-slow")));

        // Drain ends on the ETX, "fast" is dispatched, and its reply is clean.
        expect(MSP.cli_discarding).toBe(false);
        expect(serialSendSpy).toHaveBeenCalledTimes(2);

        MSP.read(toReadInfo(responseBytes("fast-response")));
        expect(results[1]).toEqual({ cmd: "fast", lines: ["fast-response", ""], error: null });
    });

    it("gives up on draining after the grace period so the queue can progress", () => {
        const results = [];
        MSP.send_cli_command("slow", (lines, error) => results.push({ cmd: "slow", error }), { timeoutMs: 100 });
        MSP.send_cli_command("fast", (lines, error) => results.push({ cmd: "fast", error }));

        vi.advanceTimersByTime(150); // timeout fires
        expect(MSP.cli_discarding).toBe(true);
        expect(serialSendSpy).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(MSP.cli_drain_grace_ms + 10);
        expect(MSP.cli_discarding).toBe(false);
        expect(serialSendSpy).toHaveBeenCalledTimes(2);
    });

    it("drains the queue on disconnect_cleanup and notifies callers", () => {
        const results = [];

        MSP.send_cli_command("a", (lines, error) => results.push({ cmd: "a", error }));
        MSP.send_cli_command("b", (lines, error) => results.push({ cmd: "b", error }));
        MSP.send_cli_command("c", (lines, error) => results.push({ cmd: "c", error }));

        MSP.disconnect_cleanup();

        expect(results).toHaveLength(3);
        for (const r of results) {
            expect(r.error).toBeInstanceOf(Error);
        }
        expect(MSP.cli_queue).toHaveLength(0);
        expect(MSP.cli_in_flight).toBeNull();
        expect(MSP.cli_callback).toBeNull();
        expect(MSP.cli_discarding).toBe(false);
    });
});
