// Analyzer fed with real bench output from SPEEDYBEEF405WING
// (stock defaults, no mixer applied yet — so only motors are
// actively claimed; servos declared in config sit as FREE in
// `resource show`).

import { describe, it, expect } from "vitest";
import { analyzeResources } from "../../../src/js/utils/resourceAnalyzer.js";
import { parseResourceShow, parseTimerShow, parseDmaShow } from "../../../src/js/utils/cliOneShot.js";

const RESOURCE_SHOW = `
Currently active IO resource assignments:
(reboot to update)
--------------------
A04: GYRO_CS 1
A05: SPI_SCK 1
A06: SPI_SDI 1
A07: SPI_SDO 1
A08: LED_STRIP
A09: SERIAL_TX 1
A10: SERIAL_RX 1
A11: USB
A12: USB
A13: LED 2
A14: LED 1
B03: SPI_SCK 3
B04: SPI_SDI 3
B05: SPI_SDO 3
B06: MOTOR 2
B07: MOTOR 1
B08: I2C_SCL 1
B09: I2C_SDA 1
B12: PREINIT 3
B13: SPI_SCK 2
C00: ADC_BATT
C01: ADC_CURR
C02: SPI_SDI 2
C03: SPI_SDO 2
C06: SERIAL_TX 6
C07: SERIAL_RX 6
C13: PINIO 1
C14: SDCARD_CS
C15: BEEPER
A00: FREE
A01: FREE
A15: FREE
`;

const TIMER_SHOW = `
Currently active Timers:
-----------------------
TIM1:
    CH1 : LED_STRIP
TIM2: FREE
TIM3: FREE
TIM4:
    CH1 : MOTOR 2
    CH2 : MOTOR 1
TIM5: FREE
TIM8: FREE
`;

const DMA_SHOW = `
Currently active DMA:
--------------------
DMA1 Stream 0: SPI_SDI 3
DMA1 Stream 1: FREE
DMA1 Stream 2: FREE
DMA1 Stream 3: FREE
DMA1 Stream 4: FREE
DMA1 Stream 5: SPI_SDO 3
DMA1 Stream 6: TIMUP 4
DMA1 Stream 7: FREE
DMA2 Stream 0: ADC 1
DMA2 Stream 1: FREE
DMA2 Stream 2: SPI_SDI 1
DMA2 Stream 3: SPI_SDO 1
DMA2 Stream 4: FREE
DMA2 Stream 5: FREE
DMA2 Stream 6: LED_STRIP
DMA2 Stream 7: FREE
`;

function benchAnalysis() {
    return analyzeResources({
        resourceShow: parseResourceShow(RESOURCE_SHOW),
        timerShow: parseTimerShow(TIMER_SHOW),
        dmaShow: parseDmaShow(DMA_SHOW),
    });
}

describe("analyzeResources on SPEEDYBEEF405WING bench", () => {
    it("finds M1 on B07 (TIM4 CH2) with TIMUP burst bidir DSHOT", () => {
        const r = benchAnalysis();
        const m1 = r.motors.find((m) => m.index === 1);
        expect(m1).toEqual({
            index: 1,
            pad: "B07",
            timer: 4,
            channel: 2,
            dmaStream: null, // TIMUP burst, no per-pin stream
            bidirBurst: true,
        });
    });

    it("finds M2 on B06 (TIM4 CH1) with TIMUP burst bidir DSHOT", () => {
        const r = benchAnalysis();
        const m2 = r.motors.find((m) => m.index === 2);
        expect(m2).toEqual({
            index: 2,
            pad: "B06",
            timer: 4,
            channel: 1,
            dmaStream: null,
            bidirBurst: true,
        });
    });

    it("identifies LED_STRIP as a resource-cost line item", () => {
        const r = benchAnalysis();
        expect(r.ledStrips).toEqual([
            {
                pad: "A08",
                timer: 1,
                channel: 1,
                dmaStream: { controller: 2, stream: 6 },
            },
        ]);
    });

    it("reports zero claimed servos when mixer has none", () => {
        const r = benchAnalysis();
        expect(r.servos).toEqual([]);
    });

    it("surfaces UART1 and UART6 with both TX and RX, no DMA claimed in this config", () => {
        const r = benchAnalysis();
        expect(r.serials).toEqual([
            { index: 1, txPad: "A09", rxPad: "A10", txDma: null, rxDma: null },
            { index: 6, txPad: "C06", rxPad: "C07", txDma: null, rxDma: null },
        ]);
    });

    it("picks up UART DMA when firmware allocates it (USART/UART/SERIAL aliases)", () => {
        // Synthetic: imagine UART2_TX got DMA1/S7. The analyzer should
        // reflect it in the UART row regardless of which peripheral
        // name BF emits in `dma show` (USART2_TX, UART2_TX, SERIAL_TX).
        const resourceShow = [
            { pad: "A02", peripheral: "SERIAL_TX", index: 2 },
            { pad: "A03", peripheral: "SERIAL_RX", index: 2 },
        ];
        const dmaShow = [
            { controller: 1, stream: 7, peripheral: "USART2_TX", index: 2 },
            { controller: 1, stream: 1, peripheral: "FREE", index: null },
        ];
        const r = analyzeResources({ resourceShow, timerShow: [], dmaShow });
        expect(r.serials[0].txDma).toEqual({ controller: 1, stream: 7 });
        expect(r.serials[0].rxDma).toBeNull();
    });

    it("counts hardware-fixed pads (SPI, USB, ADC, etc.)", () => {
        const r = benchAnalysis();
        const fixedKinds = new Set(r.hardwareFixedPads.map((p) => p.peripheral));
        expect(fixedKinds.has("SPI_SCK")).toBe(true);
        expect(fixedKinds.has("SPI_SDI")).toBe(true);
        expect(fixedKinds.has("USB")).toBe(true);
        expect(fixedKinds.has("ADC_BATT")).toBe(true);
        expect(fixedKinds.has("GYRO_CS")).toBe(true);
        // LED_STRIP is NOT hardware-fixed (user-remappable).
        expect(fixedKinds.has("LED_STRIP")).toBe(false);
    });

    it("counts free DMA streams (headroom for future peripherals)", () => {
        const r = benchAnalysis();
        // DMA1: S1/2/3/4/7 free = 5; DMA2: S1/4/5/7 free = 4. Total = 9.
        expect(r.freeDmaStreams.length).toBe(9);
    });

    it("emits LED_STRIP cost info warning", () => {
        const r = benchAnalysis();
        const led = r.warnings.find((w) => w.code === "led_strip_cost");
        expect(led).toBeDefined();
        expect(led.severity).toBe("info");
        expect(led.message).toContain("A08");
        expect(led.message).toContain("TIM1");
    });

    it("does not flag motors as no-DMA when TIMUP burst is active", () => {
        const r = benchAnalysis();
        const noDmaWarnings = r.warnings.filter((w) => w.code === "motor_no_dma");
        expect(noDmaWarnings).toEqual([]);
    });
});

describe("analyzeResources edge cases", () => {
    it("flags servo sharing a motor's timer as an error", () => {
        const resourceShow = [
            { pad: "B07", peripheral: "MOTOR", index: 1 },
            { pad: "B06", peripheral: "SERVO", index: 1 },
        ];
        const timerShow = [
            { timer: 4, channel: 2, complementary: false, peripheral: "MOTOR", index: 1 },
            { timer: 4, channel: 1, complementary: false, peripheral: "SERVO", index: 1 },
        ];
        const dmaShow = [];

        const r = analyzeResources({ resourceShow, timerShow, dmaShow });
        const err = r.warnings.find((w) => w.code === "servo_on_motor_timer");
        expect(err).toBeDefined();
        expect(err.severity).toBe("error");
    });

    it("flags motor without DMA or TIMUP as bit-bang risk", () => {
        const resourceShow = [{ pad: "A01", peripheral: "MOTOR", index: 1 }];
        const timerShow = [{ timer: 2, channel: 2, complementary: false, peripheral: "MOTOR", index: 1 }];
        const dmaShow = []; // no TIMUP, no per-pin DMA

        const r = analyzeResources({ resourceShow, timerShow, dmaShow });
        const w = r.warnings.find((w) => w.code === "motor_no_dma");
        expect(w).toBeDefined();
        expect(w.severity).toBe("warn");
    });

    it("counts free pads separately from hardware-fixed", () => {
        const resourceShow = [
            { pad: "A00", peripheral: "FREE", index: null },
            { pad: "A01", peripheral: "FREE", index: null },
            { pad: "A11", peripheral: "USB", index: null },
        ];
        const r = analyzeResources({ resourceShow, timerShow: [], dmaShow: [] });
        expect(r.freePadsCount).toBe(2);
        expect(r.hardwareFixedPads).toHaveLength(1);
    });

    describe("padDmaDefaults + motor_no_dma warning fix", () => {
        // Bench-confirmed format: bare `dma` dump on TMOTORF7X2.
        const TMOTORF7X2_DMA_DUMP = {
            resources: [],
            pads: [
                { pad: "B06", opt: 0, controller: 1, stream: 0, channel: 2 },
                { pad: "B08", opt: 0, controller: 1, stream: 7, channel: 2 },
                { pad: "B09", opt: null, controller: null, stream: null, channel: null },
            ],
        };

        it("populates padDmaDefaults Map from dmaDump.pads", () => {
            const r = analyzeResources({
                resourceShow: [],
                timerShow: [],
                dmaShow: [],
                dmaDump: TMOTORF7X2_DMA_DUMP,
            });
            expect(r.padDmaDefaults.get("B06")).toEqual({ controller: 1, stream: 0, channel: 2 });
            expect(r.padDmaDefaults.get("B08")).toEqual({ controller: 1, stream: 7, channel: 2 });
            // null payload for no-DMA pins (TIM11 etc).
            expect(r.padDmaDefaults.get("B09")).toBeNull();
        });

        it("suppresses motor_no_dma warning when pin has default DMA option", () => {
            // Motor on B06: no `dma MOTOR 1 <opt>` resource binding,
            // but pin's default option (0) lands on DMA1 S0. Pre-fix
            // this fired motor_no_dma falsely; post-fix it's silent.
            const resourceShow = [{ pad: "B06", peripheral: "MOTOR", index: 1 }];
            const r = analyzeResources({
                resourceShow,
                timerShow: [{ timer: 4, channel: 1, complementary: false, peripheral: "MOTOR", index: 1 }],
                dmaShow: [],
                dmaDump: TMOTORF7X2_DMA_DUMP,
            });
            const w = r.warnings.find((x) => x.code === "motor_no_dma");
            expect(w).toBeUndefined();
        });

        it("still warns when pin has no DMA option at all (e.g. TIM11)", () => {
            const resourceShow = [{ pad: "B09", peripheral: "MOTOR", index: 1 }];
            const r = analyzeResources({
                resourceShow,
                timerShow: [],
                dmaShow: [],
                dmaDump: TMOTORF7X2_DMA_DUMP,
            });
            const w = r.warnings.find((x) => x.code === "motor_no_dma");
            expect(w).toBeDefined();
        });

        it("still warns when no dmaDump supplied (older firmware)", () => {
            // Without dmaDump, can't confirm pin has DMA — fall back
            // to today's "warn unless m.dmaStream" behavior.
            const resourceShow = [{ pad: "A01", peripheral: "MOTOR", index: 1 }];
            const r = analyzeResources({
                resourceShow,
                timerShow: [{ timer: 2, channel: 2, complementary: false, peripheral: "MOTOR", index: 1 }],
                dmaShow: [],
            });
            const w = r.warnings.find((x) => x.code === "motor_no_dma");
            expect(w).toBeDefined();
        });

        it("padDmaDefaults defaults to empty Map when dmaDump absent", () => {
            const r = analyzeResources({ resourceShow: [], timerShow: [], dmaShow: [] });
            expect(r.padDmaDefaults).toBeInstanceOf(Map);
            expect(r.padDmaDefaults.size).toBe(0);
        });
    });
});
