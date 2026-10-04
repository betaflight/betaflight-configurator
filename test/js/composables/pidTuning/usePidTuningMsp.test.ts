import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import FC from "../../../../src/js/fc";
import MSP from "../../../../src/js/msp";
import MSPCodes, { MSP2TextType } from "../../../../src/js/msp/MSPCodes";
import { mspHelper } from "../../../../src/js/msp/MSPHelper";
import { CopyProfileType, usePidTuningMsp } from "../../../../src/composables/pidTuning/usePidTuningMsp";

vi.mock("../../../../src/js/msp", () => ({ default: { promise: vi.fn() } }));
vi.mock("../../../../src/js/msp/MSPHelper", () => ({ mspHelper: { crunch: vi.fn() } }));
vi.mock("../../../../src/js/fc", () => ({
    default: {
        CONFIG: { apiVersion: "1.49.0", buildOptions: [], pidProfileNames: [], rateProfileNames: [] },
        COPY_PROFILE: undefined,
    },
}));

/** A fake crunch result that records which code (and text type) it was built for. */
const payload = (code: number, modifier?: number) => [0xfa, code, modifier ?? -1];

type Call = [number, unknown?];

const PID_NAME = payload(MSPCodes.MSP2_GET_TEXT, MSP2TextType.PID_PROFILE_NAME);
const RATE_NAME = payload(MSPCodes.MSP2_GET_TEXT, MSP2TextType.RATE_PROFILE_NAME);

const LOAD_HEAD: Call[] = [
    [MSPCodes.MSP_PIDNAMES],
    [MSPCodes.MSP_PID],
    [MSPCodes.MSP_PID_ADVANCED],
    [MSPCodes.MSP_RC_TUNING],
    [MSPCodes.MSP_FILTER_CONFIG],
    [MSPCodes.MSP_RC_DEADBAND],
    [MSPCodes.MSP_MOTOR_CONFIG],
];
const LOAD_NAMES: Call[] = [
    [MSPCodes.MSP2_GET_TEXT, PID_NAME],
    [MSPCodes.MSP2_GET_TEXT, RATE_NAME],
];
const LOAD_STATUS_EX: Call[] = [[MSPCodes.MSP_STATUS_EX]];
const LOAD_TAIL: Call[] = [
    [MSPCodes.MSP_SIMPLIFIED_TUNING],
    [MSPCodes.MSP_ADVANCED_CONFIG],
    [MSPCodes.MSP_MIXER_CONFIG],
];
const LOAD_WING: Call[] = [[MSPCodes.MSP_WING]];
const LOAD_ALL = [...LOAD_HEAD, ...LOAD_NAMES, ...LOAD_STATUS_EX, ...LOAD_TAIL, ...LOAD_WING];

const set = (code: number): Call => [code, payload(code)];
const WRITE_HEAD: Call[] = [
    set(MSPCodes.MSP_SET_PID),
    set(MSPCodes.MSP_SET_PID_ADVANCED),
    set(MSPCodes.MSP_SET_RC_TUNING),
    set(MSPCodes.MSP_SET_FILTER_CONFIG),
    set(MSPCodes.MSP_SET_SIMPLIFIED_TUNING),
];
const WRITE_PID_NAME: Call = [MSPCodes.MSP2_SET_TEXT, payload(MSPCodes.MSP2_SET_TEXT, MSP2TextType.PID_PROFILE_NAME)];
const WRITE_RATE_NAME: Call = [MSPCodes.MSP2_SET_TEXT, payload(MSPCodes.MSP2_SET_TEXT, MSP2TextType.RATE_PROFILE_NAME)];
const WRITE_WING = set(MSPCodes.MSP_SET_WING);
const WRITE_ALL = [...WRITE_HEAD, WRITE_PID_NAME, WRITE_RATE_NAME, WRITE_WING];

const calls = () => vi.mocked(MSP.promise).mock.calls.map((args) => (args.length > 1 ? args : [args[0]]));

function setFc(apiVersion: string, { wing = false } = {}) {
    FC.CONFIG.apiVersion = apiVersion;
    FC.CONFIG.buildOptions = wing ? ["USE_WING"] : [];
    FC.CONFIG.pidProfileNames = ["a", "b", "c"];
    FC.CONFIG.rateProfileNames = ["d", "e", "f"];
}

describe("usePidTuningMsp", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.mocked(MSP.promise).mockResolvedValue(undefined);
        vi.mocked(mspHelper.crunch).mockImplementation(payload);
        setFc("1.49.0", { wing: true });
        // The tab guarded against a missing COPY_PROFILE, so start without one.
        Object.assign(FC, { COPY_PROFILE: undefined });
    });

    describe("loadPidTuningData", () => {
        it.each([
            ["1.44.0", false, [...LOAD_HEAD, ...LOAD_TAIL]],
            ["1.45.0", false, [...LOAD_HEAD, ...LOAD_NAMES, ...LOAD_TAIL]],
            ["1.47.0", true, [...LOAD_HEAD, ...LOAD_NAMES, ...LOAD_STATUS_EX, ...LOAD_TAIL]],
            ["1.49.0", false, [...LOAD_HEAD, ...LOAD_NAMES, ...LOAD_STATUS_EX, ...LOAD_TAIL]],
            ["1.49.0", true, LOAD_ALL],
        ])("on API %s (USE_WING: %s) asks, in order, only for what the FC supports", async (api, wing, expected) => {
            setFc(api as string, { wing: wing as boolean });

            await usePidTuningMsp().loadPidTuningData();

            expect(calls()).toEqual(expected);
        });

        it("stops at the first failed request", async () => {
            vi.mocked(MSP.promise).mockRejectedValueOnce(new Error("MSP timeout"));

            await expect(usePidTuningMsp().loadPidTuningData()).rejects.toThrow("MSP timeout");

            expect(MSP.promise).toHaveBeenCalledOnce();
        });
    });

    describe("writePidTuningConfig", () => {
        it.each([
            ["1.44.0", true, WRITE_HEAD],
            ["1.49.0", false, [...WRITE_HEAD, WRITE_PID_NAME, WRITE_RATE_NAME]],
            ["1.49.0", true, WRITE_ALL],
        ])("on API %s (USE_WING: %s) writes, in order, only what the FC supports", async (api, wing, expected) => {
            setFc(api as string, { wing: wing as boolean });

            await usePidTuningMsp().writePidTuningConfig();

            expect(calls()).toEqual(expected);
        });

        it.each([
            ["pidProfileNames", [...WRITE_HEAD, WRITE_RATE_NAME]],
            ["rateProfileNames", [...WRITE_HEAD, WRITE_PID_NAME]],
        ])("skips a profile name the FC never reported (%s)", async (missing, expected) => {
            // Typed as always present, but the tab guarded against an FC that never sent them.
            setFc("1.45.0");
            Object.assign(FC.CONFIG, { [missing]: undefined });

            await usePidTuningMsp().writePidTuningConfig();

            expect(calls()).toEqual(expected);
        });

        it("settles only once the last write lands, so the caller's persist follows it", async () => {
            let release!: () => void;
            vi.mocked(MSP.promise).mockImplementation((code) =>
                code === MSPCodes.MSP_SET_WING
                    ? new Promise((resolve) => (release = () => resolve(undefined)))
                    : Promise.resolve(undefined),
            );
            let done = false;

            const writing = usePidTuningMsp()
                .writePidTuningConfig()
                .then(() => (done = true));
            await flushPromises();
            expect(done).toBe(false);

            release();
            await writing;
            expect(done).toBe(true);
        });

        it("stops at the first failed write", async () => {
            vi.mocked(MSP.promise).mockRejectedValueOnce(new Error("MSP timeout"));

            await expect(usePidTuningMsp().writePidTuningConfig()).rejects.toThrow("MSP timeout");

            expect(MSP.promise).toHaveBeenCalledOnce();
        });
    });

    describe("profile commands", () => {
        it.each([
            [
                "selects a PID profile by its index",
                () => usePidTuningMsp().selectPidProfile(2),
                [MSPCodes.MSP_SELECT_SETTING, [2]],
            ],
            [
                "selects a rate profile with the high bit set",
                () => usePidTuningMsp().selectRateProfile(3),
                [MSPCodes.MSP_SELECT_SETTING, [3 | 128]],
            ],
            [
                "resets the active PID profile",
                () => usePidTuningMsp().resetPidProfile(),
                [MSPCodes.MSP_SET_RESET_CURR_PID],
            ],
        ])("%s", async (_, run, expected) => {
            await run();

            expect(calls()).toEqual([expected]);
        });

        it.each([
            ["selectPidProfile", (msp: ReturnType<typeof usePidTuningMsp>) => msp.selectPidProfile(1)],
            ["selectRateProfile", (msp: ReturnType<typeof usePidTuningMsp>) => msp.selectRateProfile(1)],
            ["copyProfile", (msp: ReturnType<typeof usePidTuningMsp>) => msp.copyProfile(CopyProfileType.PID, 0, 1)],
            ["resetPidProfile", (msp: ReturnType<typeof usePidTuningMsp>) => msp.resetPidProfile()],
        ])("%s settles only when the FC replies, and passes a failure on", async (_, run) => {
            let reject!: (error: Error) => void;
            vi.mocked(MSP.promise).mockImplementation(
                () =>
                    new Promise((_resolve, rej) => {
                        reject = rej;
                    }),
            );
            let settled = false;

            const running = run(usePidTuningMsp()).finally(() => {
                settled = true;
            });
            await flushPromises();
            expect(settled).toBe(false);

            reject(new Error("MSP timeout"));
            await expect(running).rejects.toThrow("MSP timeout");
        });

        it.each([
            [CopyProfileType.PID, 0],
            [CopyProfileType.RATE, 1],
        ])("copies with type %s, filling FC.COPY_PROFILE before the payload is built", async (type, wire) => {
            let atCrunch: unknown;
            vi.mocked(mspHelper.crunch).mockImplementation((code) => {
                atCrunch = { ...FC.COPY_PROFILE };
                return payload(code);
            });

            await usePidTuningMsp().copyProfile(type, 1, 2);

            expect(atCrunch).toEqual({ type: wire, srcProfile: 1, dstProfile: 2 });
            expect(mspHelper.crunch).toHaveBeenCalledWith(MSPCodes.MSP_COPY_PROFILE);
            expect(calls()).toEqual([[MSPCodes.MSP_COPY_PROFILE, payload(MSPCodes.MSP_COPY_PROFILE)]]);
        });
    });
});
