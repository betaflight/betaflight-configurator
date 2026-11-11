import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import MSP, { type CliCallback } from "../../src/js/msp";
import { useFlightControllerStore } from "../../src/stores/fc";
import {
    MIN_FC_VERSION_FOR_MSP_CLI,
    findCliError,
    findCliSettingAllowedValues,
    findCliSettingRange,
    isConnectionClosedError,
    findCliSettingValue,
    isMspCliSupported,
    useMspCliSession,
    send,
    readDumpAll,
    sendSave,
    type BatchProgress,
} from "../../src/composables/useMspCliSession";

interface PendingCommand {
    cmd: string;
    cb: CliCallback;
    opts: { timeoutMs?: number };
    timer?: ReturnType<typeof setTimeout>;
}

async function flushMicrotasks() {
    for (let i = 0; i < 5; i++) {
        await Promise.resolve();
    }
}

describe("useMspCliSession", () => {
    let sendCliCommandSpy: MockInstance<typeof MSP.send_cli_command>;
    let pending: PendingCommand[];

    beforeEach(() => {
        vi.useFakeTimers();
        pending = [];
        sendCliCommandSpy = vi.spyOn(MSP, "send_cli_command").mockImplementation((cmd, cb, opts = {}) => {
            const entry: PendingCommand = { cmd, cb: cb!, opts };
            if (opts.timeoutMs) {
                entry.timer = setTimeout(() => {
                    const idx = pending.indexOf(entry);
                    if (idx < 0) {
                        return;
                    }
                    pending.splice(idx, 1);
                    entry.cb([], new Error(`Timed out after ${opts.timeoutMs}ms waiting for response to "${cmd}"`));
                }, opts.timeoutMs);
            }
            pending.push(entry);
        });
    });

    afterEach(async () => {
        await vi.runAllTimersAsync();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    async function respondTo(cmd: string, lines: string[] = []) {
        await flushMicrotasks();
        const entry = pending.find((p) => p.cmd === cmd);
        if (!entry) {
            throw new Error(`No pending CLI command "${cmd}". pending=${pending.map((p) => p.cmd).join(",")}`);
        }
        if (entry.timer) {
            clearTimeout(entry.timer);
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
            expect(sendCliCommandSpy).toHaveBeenCalledWith(
                "status",
                expect.any(Function),
                expect.objectContaining({ timeoutMs: expect.any(Number) }),
            );
        });

        it("rejects when MSP reports a timeout error", async () => {
            const promise = send("hang", { timeoutMs: 100 });
            const expectation = expect(promise).rejects.toThrow(/Timed out after 100ms/);
            await flushMicrotasks();
            await vi.advanceTimersByTimeAsync(150);
            await expectation;
        });
    });

    describe("sendSave / readDumpAll", () => {
        it("sendSave issues the save command", async () => {
            const promise = sendSave();
            await respondTo("save", []);
            await promise;
            expect(sendCliCommandSpy).toHaveBeenCalledWith("save", expect.any(Function), expect.any(Object));
        });

        it("readDumpAll issues diff all", async () => {
            const promise = readDumpAll();
            await respondTo("diff all", ["line1"]);
            await expect(promise).resolves.toEqual(["line1"]);
            expect(sendCliCommandSpy).toHaveBeenCalledWith("diff all", expect.any(Function), expect.any(Object));
        });
    });

    describe("runBatch", () => {
        it("runs every non-skipped command and reports progress", async () => {
            const session = useMspCliSession();
            const progress: BatchProgress[] = [];
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

            await flushMicrotasks();
            await vi.advanceTimersByTimeAsync(150);
            await respondTo("set x = 1", []);
            await vi.advanceTimersByTimeAsync(20);

            const result = await promise;
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].command).toBe("slow");
            expect(result.errors[0].errors[0]).toMatch(/Timed out after 100ms/);
            expect(result.sent).toBe(1);
            expect(sendCliCommandSpy).toHaveBeenCalledTimes(2);
        });

        it("stops when cancel() is called and reports cancelled=true", async () => {
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

        it("holds isBatchRunning only while the batch runs, failures included", async () => {
            const session = useMspCliSession();
            expect(session.isBatchRunning.value).toBe(false);

            const promise = session.runBatch(["slow"], { commandTimeoutMs: 100 });
            expect(session.isBatchRunning.value).toBe(true);

            await flushMicrotasks();
            await vi.advanceTimersByTimeAsync(150);
            await promise;
            expect(session.isBatchRunning.value).toBe(false);
        });

        it("clears isBatchRunning even when a progress callback throws", async () => {
            const session = useMspCliSession();
            const promise = session.runBatch(["# comment"], {
                onProgress: () => {
                    throw new Error("listener bug");
                },
            });

            await expect(promise).rejects.toThrow("listener bug");
            expect(session.isBatchRunning.value).toBe(false);
        });

        it("starts a new batch uncancelled after an earlier cancel", async () => {
            const session = useMspCliSession();
            session.cancel();

            const promise = session.runBatch(["a"]);
            await respondTo("a", []);
            await vi.advanceTimersByTimeAsync(20);

            await expect(promise).resolves.toMatchObject({ sent: 1, cancelled: false });
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

    describe("isMspCliSupported", () => {
        let fcStore: ReturnType<typeof useFlightControllerStore>;

        beforeEach(() => {
            setActivePinia(createPinia());
            fcStore = useFlightControllerStore();
        });

        it("returns false when no firmware version is connected", () => {
            fcStore.config.flightControllerVersion = "";
            expect(isMspCliSupported()).toBe(false);
        });

        it("returns false on firmware older than the minimum", () => {
            fcStore.config.flightControllerVersion = "4.5.3";
            expect(isMspCliSupported()).toBe(false);
        });

        it("returns true on the minimum supported firmware", () => {
            fcStore.config.flightControllerVersion = MIN_FC_VERSION_FOR_MSP_CLI;
            expect(isMspCliSupported()).toBe(true);
        });

        it("returns true on newer firmware", () => {
            fcStore.config.flightControllerVersion = "4.6.0";
            expect(isMspCliSupported()).toBe(true);
        });

        it("supports vendor firmware versions with underscore prerelease identifiers", () => {
            fcStore.config.flightControllerVersion = "2025.12.3-alpha.KAACK_V19";
            expect(isMspCliSupported()).toBe(true);
        });

        it("returns false for an invalid firmware version without throwing", () => {
            fcStore.config.flightControllerVersion = "not-a-version";
            expect(() => isMspCliSupported()).not.toThrow();
            expect(isMspCliSupported()).toBe(false);
        });
    });
});

describe("findCliSettingValue", () => {
    // `get` matches on substring, so asking for one setting can return several.
    const reply = [
        "gps_baud = 115200",
        "Allowed values: AUTO, 9600, 19200, 38400, 57600, 115200, 230400",
        "Default value: 57600",
    ];

    it("reads the current value", () => {
        expect(findCliSettingValue(reply, "gps_baud")).toBe("115200");
    });

    it("ignores a setting whose name merely contains the one asked for", () => {
        expect(findCliSettingValue(["gps_baud_extra = 9600", "gps_baud = 57600"], "gps_baud")).toBe("57600");
    });

    it("reports nothing when the setting is absent", () => {
        expect(findCliSettingValue(reply, "gps_uart")).toBeNull();
        expect(findCliSettingValue(undefined, "gps_baud")).toBeNull();
    });
});

describe("findCliSettingRange", () => {
    it("reads the bounds a numeric setting prints", () => {
        const reply = ["dronecan_device = 1", "Allowed range: 1 - 3", "Default value: 1"];

        expect(findCliSettingRange(reply)).toEqual({ min: 1, max: 3 });
    });

    it("copes with a negative lower bound", () => {
        expect(findCliSettingRange(["Allowed range: -5 - 5"])).toEqual({ min: -5, max: 5 });
    });

    it("reports nothing for a setting printed without a range", () => {
        expect(findCliSettingRange(["gps_baud = 57600", "Allowed values: AUTO, 9600"])).toBeNull();
        expect(findCliSettingRange(undefined)).toBeNull();
    });
});

describe("findCliSettingAllowedValues", () => {
    it("lists the names a lookup setting accepts, dropping empty entries", () => {
        expect(findCliSettingAllowedValues(["gps_provider = UBLOX", "Allowed values: NMEA, UBLOX,, MSP"])).toEqual([
            "NMEA",
            "UBLOX",
            "MSP",
        ]);
    });

    it("reports nothing for a setting printed without a list", () => {
        expect(findCliSettingAllowedValues(["Allowed range: 1 - 3"])).toBeNull();
        expect(findCliSettingAllowedValues(null)).toBeNull();
    });
});

describe("findCliError", () => {
    it("returns the first refusal line", () => {
        expect(findCliError(["set x = 1", "###ERROR: INVALID NAME", "###ERROR: second"])).toBe(
            "###ERROR: INVALID NAME",
        );
    });

    it("returns null for a clean or missing reply", () => {
        expect(findCliError(["x = 1"])).toBeNull();
        expect(findCliError(undefined)).toBeNull();
    });
});

describe("isConnectionClosedError", () => {
    it("recognises only the drain's tagged error", () => {
        expect(isConnectionClosedError(Object.assign(new Error("closed"), { connectionClosed: true }))).toBe(true);

        expect(isConnectionClosedError(new Error("Serial connection closed"))).toBe(false);
        expect(isConnectionClosedError({ connectionClosed: "true" })).toBe(false);
        expect(isConnectionClosedError(null)).toBe(false);
        expect(isConnectionClosedError("connectionClosed")).toBe(false);
    });
});
