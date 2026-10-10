import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { ref, type Ref } from "vue";
import MSP from "../../../../src/js/msp";
import MSPCodes from "../../../../src/js/msp/MSPCodes";
import { mspHelper } from "../../../../src/js/msp/MSPHelper";
import { useMotorsSave, type MotorsSaveOptions } from "../../../../src/composables/motors/useMotorsSave";

const { saveToEeprom, saveAndReboot, tracking } = vi.hoisted(() => ({
    saveToEeprom: vi.fn(),
    saveAndReboot: vi.fn(),
    tracking: { sendSaveAndChangeEvents: vi.fn(), EVENT_CATEGORIES: { FLIGHT_CONTROLLER: "flight_controller" } },
}));

vi.mock("../../../../src/js/msp", () => ({ default: { promise: vi.fn() } }));
vi.mock("../../../../src/js/msp/MSPHelper", () => ({ mspHelper: { crunch: vi.fn() } }));
vi.mock("../../../../src/composables/useReboot", () => ({ useReboot: () => ({ saveToEeprom, saveAndReboot }) }));
vi.mock("../../../../src/js/Analytics", () => ({ getTracking: () => tracking }));
vi.mock("../../../../src/js/gui_log", () => ({ gui_log: vi.fn() }));
vi.mock("../../../../src/js/localization", () => ({ i18n: { getMessage: (key: string) => key } }));

const WRITE_ORDER = [
    MSPCodes.MSP_SET_FEATURE_CONFIG,
    MSPCodes.MSP_SET_MIXER_CONFIG,
    MSPCodes.MSP_SET_MOTOR_CONFIG,
    MSPCodes.MSP_SET_MOTOR_3D_CONFIG,
    MSPCodes.MSP_SET_ADVANCED_CONFIG,
    MSPCodes.MSP_SET_ARMING_CONFIG,
    MSPCodes.MSP_SET_FILTER_CONFIG,
];

/** A stand-in payload that names the code it was crunched for. */
const payloadFor = (code: number) => [code & 0xff, code >> 8];

describe("useMotorsSave", () => {
    let events: string[];
    let options: MotorsSaveOptions;
    let configHasChanged: Ref<boolean>;
    let escSensorPortChanged: Ref<boolean>;
    let motorsTestingEnabled: Ref<boolean>;
    let analyticsChanges: Ref<Record<string, unknown>>;

    beforeEach(() => {
        // reset, not clear: a failure stubbed in one test must not leak into the next
        vi.resetAllMocks();
        vi.useFakeTimers();
        events = [];
        configHasChanged = ref(true);
        escSensorPortChanged = ref(false);
        motorsTestingEnabled = ref(false);
        analyticsChanges = ref<Record<string, unknown>>({ motor_poles: 14 });

        vi.mocked(mspHelper.crunch).mockImplementation((code) => payloadFor(code));
        vi.mocked(MSP.promise).mockImplementation(async (code) => {
            events.push(`msp:${code}`);
            return undefined as never;
        });
        saveAndReboot.mockImplementation(async () => events.push("saveAndReboot"));
        saveToEeprom.mockImplementation(async () => events.push("saveToEeprom"));
        tracking.sendSaveAndChangeEvents.mockImplementation(() => events.push("analytics"));

        options = {
            motorsState: {
                configHasChanged,
                analyticsChanges,
                resetChanges: vi.fn(() => events.push("reset")),
            },
            escSensorPortChanged,
            confirmPortConflicts: vi.fn(async () => {
                events.push("confirm");
                return true;
            }),
            writeEscSensorPort: vi.fn(async () => {
                events.push("writePort");
            }),
            motorsTestingEnabled,
            stopAllMotors: vi.fn((value?: number) => events.push(`stop:${value}`)),
            zeroThrottleValue: ref(1500),
            syncAppliedMotorStopState: vi.fn(() => events.push("sync")),
        };
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    /** Run a save to completion, driving the two safety pauses. */
    const save = async (reboot?: boolean) => {
        const done = useMotorsSave(options).saveMotors(reboot);
        await vi.runAllTimersAsync();
        await done;
    };

    it("does nothing without a config or port change", async () => {
        configHasChanged.value = false;

        expect(useMotorsSave(options).saveMotors()).toBeUndefined();
        await vi.runAllTimersAsync();

        expect(events).toEqual([]);
    });

    it("saves for a port change alone", async () => {
        configHasChanged.value = false;
        escSensorPortChanged.value = true;

        await save();

        expect(events).toContain("writePort");
    });

    it("confirms, stops, writes every group with its crunched payload, writes the port, persists, then refreshes", async () => {
        await save();

        expect(events).toEqual([
            "confirm",
            "stop:1500",
            ...WRITE_ORDER.map((code) => `msp:${code}`),
            "writePort",
            "saveAndReboot",
            "sync",
            "analytics",
            "reset",
        ]);
        for (const code of WRITE_ORDER) {
            expect(MSP.promise).toHaveBeenCalledWith(code, payloadFor(code));
        }
        expect(mspHelper.crunch).toHaveBeenCalledTimes(WRITE_ORDER.length);
        expect(saveAndReboot).toHaveBeenCalledExactlyOnceWith();
        expect(tracking.sendSaveAndChangeEvents).toHaveBeenCalledExactlyOnceWith(
            "flight_controller",
            { motor_poles: 14 },
            "motors",
        );
    });

    it("persists without rebooting when asked to", async () => {
        await save(false);

        expect(saveToEeprom).toHaveBeenCalledOnce();
        expect(saveAndReboot).not.toHaveBeenCalled();
    });

    it("leaves everything untouched, motor test included, when the port conflict is declined", async () => {
        motorsTestingEnabled.value = true;
        vi.mocked(options.confirmPortConflicts).mockResolvedValue(false);

        await save();

        expect(motorsTestingEnabled.value).toBe(true);
        expect(options.stopAllMotors).not.toHaveBeenCalled();
        expect(MSP.promise).not.toHaveBeenCalled();
        expect(options.writeEscSensorPort).not.toHaveBeenCalled();
    });

    it("ends a running motor test and waits 50 ms before the stop, then 100 ms before the first write", async () => {
        motorsTestingEnabled.value = true;

        const done = useMotorsSave(options).saveMotors();
        await flushPromises();
        expect(motorsTestingEnabled.value).toBe(false);

        await vi.advanceTimersByTimeAsync(49);
        expect(options.stopAllMotors).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(options.stopAllMotors).toHaveBeenCalledExactlyOnceWith(1500);

        await vi.advanceTimersByTimeAsync(99);
        expect(MSP.promise).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(MSP.promise).toHaveBeenCalled();

        await vi.runAllTimersAsync();
        await done;
    });

    it("chains each write on the previous reply and persists only after the port write", async () => {
        let release!: () => void;
        vi.mocked(MSP.promise).mockImplementation((code) =>
            code === MSPCodes.MSP_SET_FEATURE_CONFIG
                ? new Promise((resolve) => (release = () => resolve(undefined as never)))
                : Promise.resolve(undefined as never),
        );
        let releasePort!: () => void;
        vi.mocked(options.writeEscSensorPort).mockReturnValue(new Promise((resolve) => (releasePort = resolve)));

        const done = useMotorsSave(options).saveMotors();
        await vi.runAllTimersAsync();
        expect(MSP.promise).toHaveBeenCalledOnce();
        expect(options.writeEscSensorPort).not.toHaveBeenCalled();

        release();
        await flushPromises();
        expect(options.writeEscSensorPort).toHaveBeenCalledOnce();
        expect(saveAndReboot).not.toHaveBeenCalled();

        releasePort();
        await done;
        expect(saveAndReboot).toHaveBeenCalledOnce();
    });

    it.each([true, false])("does not refresh until the persist lands (reboot %s)", async (reboot) => {
        let release!: () => void;
        (reboot ? saveAndReboot : saveToEeprom).mockReturnValue(new Promise<void>((resolve) => (release = resolve)));

        const done = useMotorsSave(options).saveMotors(reboot);
        await vi.runAllTimersAsync();
        expect(options.syncAppliedMotorStopState).not.toHaveBeenCalled();
        expect(options.motorsState.resetChanges).not.toHaveBeenCalled();

        release();
        await done;
        expect(options.syncAppliedMotorStopState).toHaveBeenCalledOnce();
        expect(options.motorsState.resetChanges).toHaveBeenCalledOnce();
    });

    it("skips the analytics event when nothing was tracked", async () => {
        analyticsChanges.value = {};

        await save();

        expect(tracking.sendSaveAndChangeEvents).not.toHaveBeenCalled();
        expect(options.motorsState.resetChanges).toHaveBeenCalledOnce();
    });

    it.each([
        ["a group write", () => vi.mocked(MSP.promise).mockRejectedValueOnce(new Error("MSP timeout"))],
        ["the port write", () => vi.mocked(options.writeEscSensorPort).mockRejectedValueOnce(new Error("refused"))],
        ["the persist", () => saveAndReboot.mockRejectedValueOnce(new Error("EEPROM"))],
    ])("keeps the old baseline when %s fails", async (_, fail) => {
        fail();
        vi.spyOn(console, "error").mockImplementation(() => {});
        const { saveMotors, isSaving } = useMotorsSave(options);

        const done = saveMotors();
        await vi.runAllTimersAsync();
        await done;

        expect(options.syncAppliedMotorStopState).not.toHaveBeenCalled();
        expect(tracking.sendSaveAndChangeEvents).not.toHaveBeenCalled();
        expect(options.motorsState.resetChanges).not.toHaveBeenCalled();
        expect(isSaving.value).toBe(false);
    });
});
