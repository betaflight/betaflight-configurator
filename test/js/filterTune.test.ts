/*
 * This file is part of Betaflight.
 *
 * Betaflight is free software. You can redistribute this software
 * and/or modify this software under the terms of the GNU General
 * Public License as published by the Free Software Foundation,
 * either version 3 of the License, or (at your option) any later
 * version.
 *
 * Betaflight is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this software.
 *
 * If not, see <http://www.gnu.org/licenses/>.
 */

import { describe, expect, it, vi } from "vitest";
import {
    encodeForgetFrameMap,
    encodeRevertFilters,
    harmonicSummary,
    parseFilterTuneStatus,
    parseFrameMap,
    type FilterTuneStatus,
} from "../../src/stores/filterTuneProtocol";
import { encodeStart, startParamsFor } from "../../src/stores/frameWizardProtocol";

/** Writes like the firmware's sbuf: little endian, signed values as their 16-bit pattern. */
class Sbuf {
    bytes: number[] = [];
    u8(v: number) {
        this.bytes.push(v & 0xff);
        return this;
    }
    u16(v: number) {
        return this.u8(v).u8(v >> 8);
    }
}

interface StatusFields {
    state?: number;
    flags?: number;
    frames?: number;
    harmonicsDb10?: number[][];
    residualDb10?: number;
    score?: number;
    bad?: number;
    peaks?: [number, number, number][];
}

// filterAutotuneWriteStatus(), field by field
function statusPayload(f: StatusFields = {}): number[] {
    const b = new Sbuf()
        .u8(1)
        .u8(f.state ?? 3)
        .u8(f.flags ?? 0b000011)
        .u16(f.frames ?? 42)
        .u16(60)
        .u16(1000);
    const h = f.harmonicsDb10 ?? [
        [120, 60, 30, 10, 5],
        [130, 62, 31, 11, 4],
        [110, 58, 29, 9, 3],
        [125, 61, 30, 10, 2],
    ];
    h.forEach((row) => row.forEach((v) => b.u16(v)));
    b.u16(f.residualDb10 ?? -35)
        .u8(f.score ?? 87)
        .u8(f.bad ?? 255);
    const peaks = f.peaks ?? [
        [2105, 63, 1],
        [4470, 41, 2],
    ];
    b.u8(peaks.length);
    peaks.forEach(([hz10, db10, fl]) => b.u16(hz10).u16(db10).u8(fl));
    // proposed: weights, q, dyn count, lpf2, notch1 center, notch1 cutoff
    b.u8(100).u8(60).u8(30).u16(800).u8(1).u16(0).u16(210).u16(180);
    // current: the same, then lpf1 static and lpf1 dynamic min
    b.u8(100).u8(100).u8(100).u16(500).u8(3).u16(500).u16(0).u16(0).u16(250).u16(200);
    return b.bytes;
}

function status(f: StatusFields = {}): FilterTuneStatus {
    const parsed = parseFilterTuneStatus(statusPayload(f));
    if (!parsed) {
        throw new Error("status did not parse");
    }
    return parsed;
}

describe("filter autotune status", () => {
    it("parses every field", () => {
        const s = status({ flags: 0b111111, bad: 2 });
        expect(s).toMatchObject({
            state: "collecting",
            hasFrameMap: true,
            hasTelemetry: true,
            modeOn: true,
            enoughFrames: true,
            backupPresent: true,
            appliedThisBoot: true,
            frames: 42,
            minFrames: 60,
            sampleHz: 1000,
            residual1x: -3.5,
            score: 87,
            badMotor: 2,
        });
        expect(s.harmonics[1]).toEqual([13, 6.2, 3.1, 1.1, 0.4]);
        expect(s.peaks).toEqual([
            { hz: 210.5, db: 6.3, fixed: true, inMap: false },
            { hz: 447, db: 4.1, fixed: false, inMap: true },
        ]);
        expect(s.proposed).toEqual({
            rpmWeights: [100, 60, 30],
            rpmQ: 800,
            dynNotchCount: 1,
            lpf2Hz: 0,
            notch1Hz: 210,
            notch1CutoffHz: 180,
        });
        expect(s.current).toMatchObject({
            rpmQ: 500,
            dynNotchCount: 3,
            lpf2Hz: 500,
            lpf1StaticHz: 250,
            lpf1DynMinHz: 200,
        });
    });

    it("reads negative strengths and maps every state", () => {
        const s = status({
            harmonicsDb10: [
                [-15, 0, 0, 0, 0],
                [0, 0, 0, 0, 0],
                [0, 0, 0, 0, 0],
                [0, 0, 0, 0, 0],
            ],
        });
        expect(s.harmonics[0][0]).toBe(-1.5);
        const names = [0, 1, 2, 3, 4, 5, 6, 7].map((code) => status({ state: code }).state);
        expect(names).toEqual([
            "noFrameMap",
            "idle",
            "waitingHover",
            "collecting",
            "ready",
            "applied",
            "discarded",
            "noTelemetry",
        ]);
        expect(status({ bad: 255 }).badMotor).toBeNull();
    });

    it("reads the LPF2 basis when the firmware appends it, and nothing otherwise", () => {
        expect(status()).toMatchObject({ highBandDb: null, lpf2Basis: null });
        const withBasis = [...statusPayload(), ...new Sbuf().u16(-12).u8(1).bytes];
        expect(parseFilterTuneStatus(withBasis)).toMatchObject({ highBandDb: -1.2, lpf2Basis: "off" });
        const noData = [...statusPayload(), ...new Sbuf().u16(0).u8(255).bytes];
        expect(parseFilterTuneStatus(noData)).toMatchObject({ lpf2Basis: "noData" });
    });

    it("reads the fade range, the tracking error and the in-flight signals when appended, nothing otherwise", () => {
        const withBasis = [...statusPayload(), ...new Sbuf().u16(-12).u8(1).bytes];
        expect(parseFilterTuneStatus(withBasis)).toMatchObject({ rpmFade: null, trackError: null, signals: null });
        // fade proposed / current, tracking error x 1e5
        const withFade = [...withBasis, ...new Sbuf().u16(80).u16(50).u16(120).bytes];
        expect(parseFilterTuneStatus(withFade)).toMatchObject({
            rpmFade: { proposed: 80, current: 50 },
            trackError: 0.0012,
            signals: null,
        });
        expect(parseFilterTuneStatus([...withFade, 0b110])).toMatchObject({
            signals: { beeper: false, ledStrip: true, osd: true },
        });
        expect(parseFilterTuneStatus([...withFade, 0])).toMatchObject({
            signals: { beeper: false, ledStrip: false, osd: false },
        });
    });

    it("parses a status read from the bench FC (firmware 8729d4f4d, no hover yet)", () => {
        const hex =
            "01010300003c00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000ff" +
            "000000000000000000000000006450642c0101900100000000000000000000ff";
        const bytes = hex.match(/../g)!.map((b) => parseInt(b, 16));
        expect(bytes).toHaveLength(85);
        expect(parseFilterTuneStatus(bytes)).toMatchObject({
            state: "idle",
            hasFrameMap: true,
            hasTelemetry: true,
            modeOn: false,
            frames: 0,
            minFrames: 60,
            current: { rpmWeights: [100, 80, 100], rpmQ: 300, dynNotchCount: 1, lpf2Hz: 400, lpf1StaticHz: 0 },
            highBandDb: 0,
            lpf2Basis: "noData",
        });
    });

    it("rejects other versions and truncated payloads", () => {
        const other = statusPayload();
        other[0] = 2;
        expect(parseFilterTuneStatus(other)).toBeNull();
        expect(parseFilterTuneStatus(statusPayload().slice(0, 40))).toBeNull();
    });
});

describe("harmonic summary", () => {
    it("all OK when the motors' 1x agree within 3 dB and none stands out", () => {
        const s = harmonicSummary(status());
        expect(s).toMatchObject({ allOk: true, score: 87, spread1x: 2 });
        expect(s!.motors[0].orders).toEqual([12, 6, 3, 1, 0.5]);
    });

    it("not OK when the spread is wider or one motor stands out", () => {
        const wide = status({
            harmonicsDb10: [
                [120, 0, 0, 0, 0],
                [160, 0, 0, 0, 0],
                [120, 0, 0, 0, 0],
                [120, 0, 0, 0, 0],
            ],
        });
        expect(harmonicSummary(wide)).toMatchObject({ allOk: false, spread1x: 4 });
        const bad = harmonicSummary(status({ bad: 1 }));
        expect(bad!.allOk).toBe(false);
        expect(bad!.motors.map((m) => m.standsOut)).toEqual([false, true, false, false]);
    });

    it("nothing to say before any frame", () => {
        expect(harmonicSummary(status({ frames: 0 }))).toBeNull();
    });
});

describe("frame map", () => {
    // frameMapWrite()
    it("parses the parts and the modes with their sources", () => {
        const b = new Sbuf().u8(1).u8(0b01).u8(5);
        b.u16(752).u8(1).u16(2101).u8(3).u16(4460).u8(2).u16(3755).u8(4).u16(1730).u8(9);
        expect(parseFrameMap(b.bytes)).toEqual({
            hasTaps: true,
            hasMotors: false,
            motors: null,
            rotationHz: null,
            spinWrongMask: null,
            modes: [
                { hz: 75.2, fromTaps: true, fromMotors: false, fromCable: false, unstable: false },
                { hz: 210.1, fromTaps: true, fromMotors: true, fromCable: false, unstable: false },
                { hz: 446, fromTaps: false, fromMotors: true, fromCable: false, unstable: false },
                { hz: 375.5, fromTaps: false, fromMotors: false, fromCable: true, unstable: false },
                // FRAME_MAP_SRC_UNSTABLE: a tap mode few taps saw
                { hz: 173, fromTaps: true, fromMotors: false, fromCable: false, unstable: true },
            ],
        });
        expect(parseFrameMap([1, 0, 0])).toMatchObject({ hasTaps: false, hasMotors: false, modes: [] });
        expect(parseFrameMap([3, 0, 0])).toBeNull();
    });

    // frameMapWrite() v2: the motor profile after the modes
    it("reads the motor run's peaks, rotation speeds and spin check a v2 map keeps", () => {
        const b = new Sbuf().u8(2).u8(0b11).u8(1).u16(2101).u8(3);
        // motor 1: 212 Hz gain 0.1153 pitch at both speeds; 439 Hz yaw, cable; motors 2-4 one peak each
        b.u8(2)
            .u16(2120)
            .u16(1153)
            .u8(0x21)
            .u16(4390)
            .u16(1079)
            .u8(0x80 | 0x22);
        for (let m = 1; m < 4; m++) {
            b.u8(1)
                .u16(2110 + m)
                .u16(1000)
                .u8(0x20);
        }
        b.u16(1273)
            .u16(2360)
            .u8(0x80 | 0b0100);
        const map = parseFrameMap(b.bytes)!;
        expect(map.modes).toHaveLength(1);
        expect(map.motors![0]).toEqual([
            { hz: 212, gain: 0.1153, axis: "pitch", speeds: 2, cable: false },
            { hz: 439, gain: 0.1079, axis: "yaw", speeds: 2, cable: true },
        ]);
        expect(map.motors![3]).toHaveLength(1);
        expect(map.rotationHz).toEqual([127.3, 236]);
        expect(map.spinWrongMask).toBe(0b0100);
        // no spin check made
        const none = [...b.bytes.slice(0, -1), 0];
        expect(parseFrameMap(none)!.spinWrongMask).toBeNull();
    });
});

describe("ops and run flags", () => {
    it("revert and forget are ops 4 and 5", () => {
        expect(encodeRevertFilters()).toEqual([4]);
        expect(encodeForgetFrameMap()).toEqual([5]);
    });

    it("the taps run sets TAPS_ONLY, the motor run SKIP_TAPS (the flags byte after max command)", () => {
        expect(encodeStart(startParamsFor("taps"))[10]).toBe(1 << 3);
        expect(encodeStart(startParamsFor("motors"))[10]).toBe(1 << 0);
    });
});

describe("FILTER TUNE assigned to a switch", () => {
    it("counts only a FILTER TUNE range that is not empty", async () => {
        vi.resetModules();
        vi.doMock("../../src/js/msp", () => ({ default: { promise: vi.fn(), send_message: vi.fn() } }));
        const { createPinia, setActivePinia } = await import("pinia");
        setActivePinia(createPinia());
        const { useFilterTuneStore } = await import("../../src/stores/filterTune");
        const { useFlightControllerStore } = await import("../../src/stores/fc");
        const fc = useFlightControllerStore();
        const store = useFilterTuneStore();

        fc.modeRanges = [{ id: 0, auxChannelIndex: 0, range: { start: 1700, end: 2100 } }];
        expect(store.modeAssigned).toBe(false);
        fc.modeRanges = [{ id: 59, auxChannelIndex: 2, range: { start: 900, end: 900 } }]; // an empty slot
        expect(store.modeAssigned).toBe(false);
        fc.modeRanges = [
            { id: 0, auxChannelIndex: 0, range: { start: 1700, end: 2100 } },
            { id: 59, auxChannelIndex: 2, range: { start: 1300, end: 1700 } },
        ];
        expect(store.modeAssigned).toBe(true);
    });
});

describe("RPM telemetry settings", () => {
    it("counts the RPM telemetry set up when DShot, bidirectional and the RPM filter are on", async () => {
        vi.resetModules();
        const bytes = new Uint8Array(statusPayload());
        const promise = vi.fn(async (code: number) =>
            code === 0x301c
                ? { data: new DataView(bytes.buffer), unsupported: false }
                : { data: new DataView(new ArrayBuffer(0)) },
        );
        vi.doMock("../../src/js/msp", () => ({ default: { promise, send_message: vi.fn() } }));
        const { createPinia, setActivePinia } = await import("pinia");
        setActivePinia(createPinia());
        const { useFilterTuneStore } = await import("../../src/stores/filterTune");
        const { useFlightControllerStore } = await import("../../src/stores/fc");
        const fc = useFlightControllerStore();
        const { default: EscProtocols } = await import("../../src/js/utils/EscProtocols");
        fc.config.apiVersion = "1.49.0";
        fc.pidAdvancedConfig.fast_pwm_protocol = EscProtocols.GetAvailableProtocols("1.49.0").indexOf("DSHOT600");
        fc.motorConfig.use_dshot_telemetry = true;
        fc.filterConfig.gyro_rpm_notch_harmonics = 0;
        const store = useFilterTuneStore();

        await store.load();
        expect(store.telemetryConfigured).toBe(false); // RPM filter harmonics 0

        fc.filterConfig.gyro_rpm_notch_harmonics = 3;
        await store.load();
        expect(store.telemetryConfigured).toBe(true);
    });
});
