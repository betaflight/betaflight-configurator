import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { effectScope } from "vue";
import FC from "../../src/js/fc";
import MSP from "../../src/js/msp";
import MSPCodes from "../../src/js/msp/MSPCodes";

// Mock useMspCliSession before importing the composable
vi.mock("../../src/composables/useMspCliSession", () => ({
    send: vi.fn().mockResolvedValue([]),
    isMspCliSupported: vi.fn().mockReturnValue(true),
}));

// Mock sphereFit utilities
vi.mock("../../src/js/utils/sphereFit", () => ({
    fitSphere: vi.fn().mockReturnValue(null),
    computeCoverage: vi.fn().mockReturnValue({ uniform: 0.5 }),
}));

// Mock geomagnetism
vi.mock("geomagnetism", () => ({
    default: {
        model: () => ({
            point: () => ({ decl: 5, incl: 60, f: 50000 }),
        }),
    },
}));

import { useMagCalibration } from "../../src/composables/useMagCalibration";
import { send, isMspCliSupported } from "../../src/composables/useMspCliSession";
import { fitSphere } from "../../src/js/utils/sphereFit";
import { useFlightControllerStore } from "../../src/stores/fc";

describe("useMagCalibration", () => {
    let scope;
    let cal;

    beforeEach(() => {
        vi.useFakeTimers();
        setActivePinia(createPinia());
        FC.resetState();
        useFlightControllerStore();

        // Set up mag data on the store
        FC.SENSOR_DATA.magnetometer = [100, 200, 300];

        // Mock MSP.send_message to immediately invoke callback
        vi.spyOn(MSP, "send_message").mockImplementation((code, data, retries, cb) => {
            if (typeof cb === "function") {
                cb();
            }
        });

        // Default: CLI returns no offsets
        send.mockResolvedValue([]);
        isMspCliSupported.mockReturnValue(true);
        fitSphere.mockReturnValue(null);

        // Create composable in an effect scope so onScopeDispose works
        scope = effectScope();
        scope.run(() => {
            cal = useMagCalibration();
        });
    });

    afterEach(() => {
        scope.stop();
        vi.runAllTimers();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    describe("startCalibration", () => {
        it("rejects when phase is not idle (concurrent guard)", async () => {
            // Start first calibration
            await cal.startCalibration("quick");
            expect(cal.phase.value).not.toBe("idle");

            const phaseBefore = cal.phase.value;
            // Try to start second calibration while first is in progress
            await cal.startCalibration("quick");
            // Phase should not have changed (second call was a no-op)
            expect(cal.phase.value).toBe(phaseBefore);
        });

        it("starts quick mode and triggers MSP_MAG_CALIBRATION", async () => {
            await cal.startCalibration("quick");

            expect(cal.mode.value).toBe("quick");
            expect(cal.phase.value).toBe("waiting");
            expect(MSP.send_message).toHaveBeenCalledWith(MSPCodes.MSP_MAG_CALIBRATION, false, false);
        });

        it("starts guided mode without sending MSP_MAG_CALIBRATION", async () => {
            await cal.startCalibration("guided");

            expect(cal.mode.value).toBe("guided");
            expect(cal.phase.value).toBe("collecting");
            // Should NOT have called MSP_MAG_CALIBRATION
            const magCalCalls = MSP.send_message.mock.calls.filter((c) => c[0] === MSPCodes.MSP_MAG_CALIBRATION);
            expect(magCalCalls).toHaveLength(0);
        });

        it("reads firmware offsets before starting guided calibration", async () => {
            send.mockResolvedValueOnce(["mag_calibration = 10,20,30"]);

            await cal.startCalibration("guided");

            expect(send).toHaveBeenCalledWith("get mag_calibration");
            expect(cal.firmwareOffsets.value).toEqual({ x: 10, y: 20, z: 30 });
        });

        it("starts check mode without triggering MSP_MAG_CALIBRATION", async () => {
            await cal.startCalibration("check");

            expect(cal.mode.value).toBe("check");
            expect(cal.phase.value).toBe("collecting");
            const magCalCalls = MSP.send_message.mock.calls.filter((c) => c[0] === MSPCodes.MSP_MAG_CALIBRATION);
            expect(magCalCalls).toHaveLength(0);
        });

        it("check mode does not add offsets to samples", async () => {
            send.mockResolvedValueOnce(["mag_calibration = 50,60,70"]);
            await cal.startCalibration("check");

            FC.SENSOR_DATA.magnetometer = [100, 200, 300];
            await vi.advanceTimersByTimeAsync(100);

            expect(cal.samples.value.length).toBeGreaterThanOrEqual(1);
            const sample = cal.samples.value[0];
            expect(sample.x).toBe(100);
            expect(sample.y).toBe(200);
            expect(sample.z).toBe(300);
        });

        it("check mode does not run sphere fit analysis", async () => {
            await cal.startCalibration("check");

            FC.SENSOR_DATA.magnetometer = [100, 200, 300];
            // Advance enough to trigger sphere fit (SPHERE_FIT_EVERY_N = 10 samples)
            for (let i = 0; i < 15; i++) {
                await vi.advanceTimersByTimeAsync(100);
            }

            expect(fitSphere).not.toHaveBeenCalled();
        });
    });

    describe("onImuData (guided mode offset reconstruction)", () => {
        it("adds back guided offsets to raw mag data", async () => {
            send.mockResolvedValueOnce(["mag_calibration = 50,60,70"]);
            await cal.startCalibration("guided");

            // The composable is polling via setInterval. Simulate the IMU callback.
            // Magnetometer data is read from fcStore.sensorData.magnetometer
            FC.SENSOR_DATA.magnetometer = [100, 200, 300];

            // Advance timer to trigger the data poll interval (100ms)
            await vi.advanceTimersByTimeAsync(100);

            // The sample should have offsets added back: 100+50=150, 200+60=260, 300+70=370
            expect(cal.samples.value.length).toBeGreaterThanOrEqual(1);
            const sample = cal.samples.value[0];
            expect(sample.x).toBe(150);
            expect(sample.y).toBe(260);
            expect(sample.z).toBe(370);
        });

        it("does not add offsets in quick mode", async () => {
            await cal.startCalibration("quick");

            FC.SENSOR_DATA.magnetometer = [100, 200, 300];
            await vi.advanceTimersByTimeAsync(100);

            // In quick mode the first real sample transitions from waiting to collecting
            expect(cal.samples.value.length).toBeGreaterThanOrEqual(1);
            const sample = cal.samples.value[0];
            expect(sample.x).toBe(100);
            expect(sample.y).toBe(200);
            expect(sample.z).toBe(300);
        });

        it("skips zero mag readings", async () => {
            await cal.startCalibration("guided");

            FC.SENSOR_DATA.magnetometer = [0, 0, 0];
            await vi.advanceTimersByTimeAsync(100);

            expect(cal.samples.value.length).toBe(0);
        });
    });

    describe("acceptCalibration", () => {
        it("returns error when no sphere fit result exists", async () => {
            const result = await cal.acceptCalibration();
            expect(result.ok).toBe(false);
            expect(result.error).toMatch(/No sphere fit/);
        });

        it("rejects non-finite center values (Number.isFinite guard)", async () => {
            cal.sphereFitResult.value = {
                center: { x: Number.NaN, y: 100, z: 200 },
                radius: 300,
                residual: 50,
            };

            const result = await cal.acceptCalibration();
            expect(result.ok).toBe(false);
            expect(result.error).toMatch(/Invalid calibration offsets/);
        });

        it("rejects Infinity center values", async () => {
            cal.sphereFitResult.value = {
                center: { x: 100, y: Infinity, z: 200 },
                radius: 300,
                residual: 50,
            };

            const result = await cal.acceptCalibration();
            expect(result.ok).toBe(false);
            expect(result.error).toMatch(/Invalid calibration offsets/);
        });

        it("sends CLI set command and updates firmwareOffsets on valid fit", async () => {
            cal.sphereFitResult.value = {
                center: { x: 123.7, y: -45.3, z: 67.9 },
                radius: 300,
                residual: 50,
            };

            const result = await cal.acceptCalibration();
            expect(result.ok).toBe(true);
            expect(send).toHaveBeenCalledWith("set mag_calibration = 124,-45,68");
            expect(cal.firmwareOffsets.value).toEqual({ x: 124, y: -45, z: 68 });
            expect(cal.phase.value).toBe("complete");
            expect(cal.progress.value).toBe(100);
        });

        it("restores collecting state when CLI command throws (allows retry)", async () => {
            cal.sphereFitResult.value = {
                center: { x: 10, y: 20, z: 30 },
                radius: 300,
                residual: 50,
            };
            send.mockRejectedValueOnce(new Error("CLI timeout"));

            const result = await cal.acceptCalibration();
            expect(result.ok).toBe(false);
            // On failure, phase returns to collecting so user can retry
            expect(cal.phase.value).toBe("collecting");
        });
    });

    describe("discardCalibration", () => {
        it("resets all state to idle", async () => {
            // Start a calibration and collect some data
            await cal.startCalibration("guided");
            FC.SENSOR_DATA.magnetometer = [100, 200, 300];
            await vi.advanceTimersByTimeAsync(100);
            expect(cal.samples.value.length).toBeGreaterThan(0);

            cal.discardCalibration();

            expect(cal.phase.value).toBe("idle");
            expect(cal.samples.value).toEqual([]);
            expect(cal.sphereFitResult.value).toBeNull();
            expect(cal.coverage.value).toBeNull();
            expect(cal.quality.value).toBeNull();
            expect(cal.progress.value).toBe(0);
            expect(cal.statusMessage.value).toBe("");
        });

        it("stops data polling after discard", async () => {
            await cal.startCalibration("guided");
            cal.discardCalibration();

            // Clear any pending state
            FC.SENSOR_DATA.magnetometer = [999, 999, 999];
            await vi.advanceTimersByTimeAsync(500);

            // No samples should have been collected after discard
            expect(cal.samples.value).toEqual([]);
        });
    });

    describe("cancelCalibration", () => {
        it("resets phase to idle and clears status", async () => {
            await cal.startCalibration("quick");
            expect(cal.phase.value).not.toBe("idle");

            cal.cancelCalibration();
            expect(cal.phase.value).toBe("idle");
            expect(cal.statusMessage.value).toBe("");
        });
    });

    describe("retry", () => {
        it("resets state to idle for a fresh start", async () => {
            await cal.startCalibration("quick");
            FC.SENSOR_DATA.magnetometer = [100, 200, 300];
            await vi.advanceTimersByTimeAsync(100);

            cal.retry();

            expect(cal.phase.value).toBe("idle");
            expect(cal.samples.value).toEqual([]);
            expect(cal.sphereFitResult.value).toBeNull();
            expect(cal.progress.value).toBe(0);
            expect(cal.firmwareDone.value).toBe(false);
        });
    });

    describe("refreshFirmwareOffsets", () => {
        it("reads and stores firmware offsets", async () => {
            send.mockResolvedValueOnce(["mag_calibration = 10,20,30"]);

            const result = await cal.refreshFirmwareOffsets();

            expect(result).toEqual({ x: 10, y: 20, z: 30 });
            expect(cal.firmwareOffsets.value).toEqual({ x: 10, y: 20, z: 30 });
        });

        it("sets firmwareOffsets to null when CLI returns no data", async () => {
            send.mockResolvedValueOnce([]);

            const result = await cal.refreshFirmwareOffsets();

            expect(result).toBeNull();
            expect(cal.firmwareOffsets.value).toBeNull();
        });
    });

    describe("writeCalValues", () => {
        it("rejects non-finite values", async () => {
            const result = await cal.writeCalValues(Number.NaN, 10, 20);
            expect(result.ok).toBe(false);
            expect(result.error).toMatch(/Invalid/);
        });

        it("rejects out-of-range values", async () => {
            const result = await cal.writeCalValues(40000, 10, 20);
            expect(result.ok).toBe(false);
            expect(result.error).toMatch(/out of range/);
        });

        it("sends CLI command and updates firmwareOffsets on valid values", async () => {
            const result = await cal.writeCalValues(100, -200, 300);

            expect(result.ok).toBe(true);
            expect(send).toHaveBeenCalledWith("set mag_calibration = 100,-200,300");
            expect(cal.firmwareOffsets.value).toEqual({ x: 100, y: -200, z: 300 });
        });

        it("rounds decimal values to integers", async () => {
            await cal.writeCalValues(10.7, -20.3, 30.5);

            expect(send).toHaveBeenCalledWith("set mag_calibration = 11,-20,31");
        });

        it("restores previous firmwareOffsets when CLI throws", async () => {
            cal.firmwareOffsets.value = { x: 5, y: 6, z: 7 };
            send.mockRejectedValueOnce(new Error("CLI timeout"));

            const result = await cal.writeCalValues(100, -200, 300);

            expect(result.ok).toBe(false);
            expect(cal.firmwareOffsets.value).toEqual({ x: 5, y: 6, z: 7 });
        });
    });

    describe("fc.js resetState", () => {
        it("initializes quaternion to null in SENSOR_DATA", () => {
            FC.resetState();
            expect(FC.SENSOR_DATA.quaternion).toBeNull();
        });
    });
});
