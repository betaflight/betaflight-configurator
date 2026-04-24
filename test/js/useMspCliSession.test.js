import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MSP from "../../src/js/msp";
import { useMspCliSession, send, readDumpAll, sendSave } from "../../src/composables/useMspCliSession";

async function flushMicrotasks() {
    for (let i = 0; i < 5; i++) {
        await Promise.resolve();
    }
}

describe("useMspCliSession", () => {
    let sendCliCommandSpy;
    let pending;

    beforeEach(() => {
        vi.useFakeTimers();
        pending = [];
        sendCliCommandSpy = vi.spyOn(MSP, "send_cli_command").mockImplementation((cmd, cb) => {
            pending.push({ cmd, cb });
        });
    });

    afterEach(async () => {
        // Drain any timers so the module-level CLI mutex resolves between tests.
        await vi.runAllTimersAsync();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    async function respondTo(cmd, lines = []) {
        await flushMicrotasks();
        const entry = pending.find((p) => p.cmd === cmd);
        if (!entry) {
            throw new Error(`No pending CLI command "${cmd}". pending=${pending.map((p) => p.cmd).join(",")}`);
        }
        pending.splice(pending.indexOf(entry), 1);
        entry.cb(lines);
        await flushMicrotasks();
    }

    describe("send", () => {
        it("resolves with the response lines", async () => {
            const promise = send("status");
            await respondTo("status", ["foo", "bar"]);
            await expect(promise).resolves.toEqual(["foo", "bar"]);
            expect(sendCliCommandSpy).toHaveBeenCalledWith("status", expect.any(Function));
        });

        it("rejects on timeout", async () => {
            const promise = send("hang", { timeoutMs: 100 });
            const expectation = expect(promise).rejects.toThrow(/Timed out after 100ms/);
            await flushMicrotasks();
            await vi.advanceTimersByTimeAsync(150);
            await expectation;
        });

        it("serialises concurrent sends through a module-level queue", async () => {
            const first = send("one");
            const second = send("two");

            await flushMicrotasks();
            expect(sendCliCommandSpy).toHaveBeenCalledTimes(1);
            expect(sendCliCommandSpy).toHaveBeenLastCalledWith("one", expect.any(Function));

            await respondTo("one", ["one-response"]);
            await expect(first).resolves.toEqual(["one-response"]);

            expect(sendCliCommandSpy).toHaveBeenCalledTimes(2);
            expect(sendCliCommandSpy).toHaveBeenLastCalledWith("two", expect.any(Function));

            await respondTo("two", ["two-response"]);
            await expect(second).resolves.toEqual(["two-response"]);
        });
    });

    describe("sendSave / readDumpAll", () => {
        it("sendSave issues the save command", async () => {
            const promise = sendSave();
            await respondTo("save", []);
            await promise;
            expect(sendCliCommandSpy).toHaveBeenCalledWith("save", expect.any(Function));
        });

        it("readDumpAll issues diff all", async () => {
            const promise = readDumpAll();
            await respondTo("diff all", ["line1"]);
            await expect(promise).resolves.toEqual(["line1"]);
            expect(sendCliCommandSpy).toHaveBeenCalledWith("diff all", expect.any(Function));
        });
    });

    describe("runBatch", () => {
        it("runs every non-skipped command and reports progress", async () => {
            const session = useMspCliSession();
            const progress = [];
            const promise = session.runBatch(["set foo = 1", "", "# comment", "set bar = 2"], {
                onProgress: (update) => progress.push({ ...update }),
            });

            await respondTo("set foo = 1", []);
            await vi.advanceTimersByTimeAsync(20);
            await respondTo("set bar = 2", []);
            await vi.advanceTimersByTimeAsync(20);

            const result = await promise;
            expect(result.sent).toBe(2);
            expect(result.total).toBe(4);
            expect(result.errors).toEqual([]);
            expect(progress.at(-1)).toEqual({ index: 4, total: 4, sent: 2, errorCount: 0 });
            expect(sendCliCommandSpy).toHaveBeenCalledTimes(2);
        });

        it("collects ###ERROR lines into the errors list", async () => {
            const session = useMspCliSession();
            const onError = vi.fn();
            const promise = session.runBatch(["set bad = 9"], { onError });

            await respondTo("set bad = 9", ["###ERROR: invalid value"]);
            await vi.advanceTimersByTimeAsync(20);

            const result = await promise;
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0]).toMatchObject({
                command: "set bad = 9",
                errors: ["###ERROR: invalid value"],
            });
            expect(onError).toHaveBeenCalledOnce();
        });

        it("records per-command timeouts as failures and keeps going", async () => {
            const session = useMspCliSession();
            const promise = session.runBatch(["slow", "set x = 1"], { commandTimeoutMs: 100 });

            // Let the first command time out without a response.
            await flushMicrotasks();
            await vi.advanceTimersByTimeAsync(150);
            // The second command should have been dispatched; respond so the batch completes.
            await respondTo("set x = 1", []);
            await vi.advanceTimersByTimeAsync(20);

            const result = await promise;
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].command).toBe("slow");
            expect(result.errors[0].errors[0]).toMatch(/Timed out after 100ms/);
            expect(result.sent).toBe(1);
            expect(sendCliCommandSpy).toHaveBeenCalledTimes(2);
        });

        it("stops when cancel() is called", async () => {
            const session = useMspCliSession();
            const promise = session.runBatch(["a", "b", "c"]);

            await respondTo("a", []);
            session.cancel();
            await vi.advanceTimersByTimeAsync(20);

            const result = await promise;
            expect(result.cancelled).toBe(true);
            expect(result.sent).toBe(1);
            expect(sendCliCommandSpy).toHaveBeenCalledTimes(1);
        });

        it("applies a longer delay after profile commands", async () => {
            const session = useMspCliSession();
            const promise = session.runBatch(["profile 1", "set x = 1"]);

            await respondTo("profile 1", []);
            await vi.advanceTimersByTimeAsync(15);
            expect(sendCliCommandSpy).toHaveBeenCalledTimes(1);
            await vi.advanceTimersByTimeAsync(100);
            await respondTo("set x = 1", []);
            await vi.advanceTimersByTimeAsync(20);

            await promise;
            expect(sendCliCommandSpy).toHaveBeenCalledTimes(2);
        });
    });
});
