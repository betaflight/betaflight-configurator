// Parsers tested against real bench output from a SPEEDYBEEF405WING
// running wing-main firmware. If BF ever changes the output format,
// these tests break first — treat that as a signal to update the
// parsers, not to weaken the tests.

import { describe, it, expect } from "vitest";
import {
    parseResourceShow,
    parseTimerShow,
    parseDmaShow,
    parseTimerDump,
    parseTimerOptions,
} from "../../../src/js/utils/cliOneShot.js";

// Trimmed `resource show` output from bench.
const RESOURCE_SHOW_FIXTURE = `
Currently active IO resource assignments:
(reboot to update)
--------------------
A00: FREE
A04: GYRO_CS 1
A05: SPI_SCK 1
A08: LED_STRIP
A11: USB
B06: MOTOR 2
B07: MOTOR 1
C15: BEEPER
`;

// Trimmed `timer show` output from bench.
const TIMER_SHOW_FIXTURE = `
Currently active Timers:
-----------------------
TIM1:
    CH1 : LED_STRIP
TIM2: FREE
TIM3: FREE
TIM4:
    CH1 : MOTOR 2
    CH2 : MOTOR 1
TIM8: FREE
`;

// Trimmed `dma show` output from bench.
const DMA_SHOW_FIXTURE = `
Currently active DMA:
--------------------
DMA1 Stream 0: SPI_SDI 3
DMA1 Stream 1: FREE
DMA1 Stream 5: SPI_SDO 3
DMA1 Stream 6: TIMUP 4
DMA2 Stream 0: ADC 1
DMA2 Stream 6: LED_STRIP
`;

describe("parseResourceShow", () => {
    it("parses bench SPEEDYBEEF405WING output", () => {
        const parsed = parseResourceShow(RESOURCE_SHOW_FIXTURE);
        expect(parsed).toEqual([
            { pad: "A00", peripheral: "FREE", index: null },
            { pad: "A04", peripheral: "GYRO_CS", index: 1 },
            { pad: "A05", peripheral: "SPI_SCK", index: 1 },
            { pad: "A08", peripheral: "LED_STRIP", index: null },
            { pad: "A11", peripheral: "USB", index: null },
            { pad: "B06", peripheral: "MOTOR", index: 2 },
            { pad: "B07", peripheral: "MOTOR", index: 1 },
            { pad: "C15", peripheral: "BEEPER", index: null },
        ]);
    });

    it("skips header/divider lines", () => {
        const parsed = parseResourceShow(RESOURCE_SHOW_FIXTURE);
        // None of the decorative lines should produce an entry.
        expect(parsed.find((r) => r.pad === "DAS")).toBeUndefined();
        expect(parsed.length).toBe(8);
    });

    it("accepts a pre-split array", () => {
        const arr = RESOURCE_SHOW_FIXTURE.split("\n");
        expect(parseResourceShow(arr)).toEqual(parseResourceShow(RESOURCE_SHOW_FIXTURE));
    });

    it("parses dump-style 'resource NAME N PAD' format (some BF forks emit this from resource show)", () => {
        // Observed on FURYF4OSD and several community forks — resource show
        // output mirrors the dump/diff layout instead of the classic PAD:BODY
        // layout. NONE entries (released slots) must be skipped.
        const input = [
            "resource BEEPER 1 A08",
            "resource MOTOR 1 A03",
            "resource MOTOR 2 B00",
            "resource MOTOR 5 NONE",
            "resource LED_STRIP 1 A00",
            "resource SERIAL_TX 3 B10",
        ].join("\n");
        const parsed = parseResourceShow(input);
        expect(parsed).toEqual([
            { pad: "A08", peripheral: "BEEPER", index: 1 },
            { pad: "A03", peripheral: "MOTOR", index: 1 },
            { pad: "B00", peripheral: "MOTOR", index: 2 },
            // MOTOR 5 NONE — skipped (empty binding)
            { pad: "A00", peripheral: "LED_STRIP", index: 1 },
            { pad: "B10", peripheral: "SERIAL_TX", index: 3 },
        ]);
    });
});

describe("parseTimerShow", () => {
    it("parses bench output with FREE + active timers", () => {
        const parsed = parseTimerShow(TIMER_SHOW_FIXTURE);
        expect(parsed).toEqual([
            { timer: 1, channel: 1, complementary: false, peripheral: "LED_STRIP", index: null },
            { timer: 2, channel: null, peripheral: "FREE", index: null },
            { timer: 3, channel: null, peripheral: "FREE", index: null },
            { timer: 4, channel: 1, complementary: false, peripheral: "MOTOR", index: 2 },
            { timer: 4, channel: 2, complementary: false, peripheral: "MOTOR", index: 1 },
            { timer: 8, channel: null, peripheral: "FREE", index: null },
        ]);
    });

    it("handles complementary (CHnN) channels", () => {
        const fixture = `
TIM8:
    CH2N : MOTOR 3
`;
        const parsed = parseTimerShow(fixture);
        expect(parsed).toEqual([{ timer: 8, channel: 2, complementary: true, peripheral: "MOTOR", index: 3 }]);
    });
});

describe("parseDmaShow", () => {
    it("parses controller/stream/peripheral/index from bench output", () => {
        const parsed = parseDmaShow(DMA_SHOW_FIXTURE);
        expect(parsed).toEqual([
            { controller: 1, stream: 0, peripheral: "SPI_SDI", index: 3 },
            { controller: 1, stream: 1, peripheral: "FREE", index: null },
            { controller: 1, stream: 5, peripheral: "SPI_SDO", index: 3 },
            { controller: 1, stream: 6, peripheral: "TIMUP", index: 4 },
            { controller: 2, stream: 0, peripheral: "ADC", index: 1 },
            { controller: 2, stream: 6, peripheral: "LED_STRIP", index: null },
        ]);
    });

    it("surfaces the TIMUP burst allocation that bidir DSHOT uses", () => {
        const parsed = parseDmaShow(DMA_SHOW_FIXTURE);
        const timup = parsed.find((e) => e.peripheral === "TIMUP");
        // TIMUP 4 on DMA1 Stream 6 is the bidir-DSHOT burst trigger
        // for both motors on TIM4 (SPEEDYBEEF405WING default). If this
        // regresses, per-motor allocation is happening instead, which
        // changes the Hardware panel recommendation logic.
        expect(timup).toEqual({ controller: 1, stream: 6, peripheral: "TIMUP", index: 4 });
    });
});

describe("parseTimerDump", () => {
    const TIMER_DUMP_FIXTURE = `
timer B07 AF2
# pin B07: TIM4 CH2 (AF2)
timer B06 AF2
# pin B06: TIM4 CH1 (AF2)
timer B00 AF2
# pin B00: TIM3 CH3 (AF2)
timer A08 AF1
# pin A08: TIM1 CH1 (AF1)
`;

    it("extracts pad + AF + TIM/CH from dump + comment pairs", () => {
        const parsed = parseTimerDump(TIMER_DUMP_FIXTURE);
        expect(parsed).toEqual([
            { pad: "B07", af: 2, timer: 4, channel: 2 },
            { pad: "B06", af: 2, timer: 4, channel: 1 },
            { pad: "B00", af: 2, timer: 3, channel: 3 },
            { pad: "A08", af: 1, timer: 1, channel: 1 },
        ]);
    });

    it("tolerates missing comment lines (timer/channel become null)", () => {
        const parsed = parseTimerDump("timer B07 AF2\n");
        expect(parsed).toEqual([{ pad: "B07", af: 2, timer: null, channel: null }]);
    });

    it("tolerates complementary channel suffix (CH2N)", () => {
        const fixture = "timer B14 AF3\n# pin B14: TIM8 CH2N (AF3)\n";
        const parsed = parseTimerDump(fixture);
        expect(parsed).toEqual([{ pad: "B14", af: 3, timer: 8, channel: 2 }]);
    });
});

// `timer <pin> list` lists every available (timer, channel, AF) for a
// pin per the firmware's DEF_TIM table. Output format from cli.c
// cliTimer() "list" branch — see firmware src/main/cli/cli.c:7244.
const TIMER_LIST_FIXTURE_F405_B07 = `
# AF1: TIM4 CH2
# AF2: TIM4 CH2
# AF3: TIM8 CH2N
`;

const TIMER_LIST_FIXTURE_H743_PE9 = `
# AF1: TIM1 CH1
# AF3: TIM1 CH1
`;

describe("parseTimerOptions", () => {
    it("returns [] on empty/null input", () => {
        expect(parseTimerOptions("")).toEqual([]);
        expect(parseTimerOptions([])).toEqual([]);
    });

    it("ignores non-AF lines", () => {
        const noisy = `
Some random text
# This is a comment but not an AF line
PIN NOT USED ON BOARD.
`;
        expect(parseTimerOptions(noisy)).toEqual([]);
    });

    it("parses each AF line into {af, timer, channel, complementary}", () => {
        const out = parseTimerOptions(TIMER_LIST_FIXTURE_F405_B07);
        expect(out).toEqual([
            { af: 1, timer: 4, channel: 2, complementary: false },
            { af: 2, timer: 4, channel: 2, complementary: false },
            { af: 3, timer: 8, channel: 2, complementary: true },
        ]);
    });

    it("flags complementary channels (CHnN suffix)", () => {
        const out = parseTimerOptions("# AF3: TIM1 CH1N");
        expect(out[0].complementary).toBe(true);
    });

    it("accepts both string and array input", () => {
        const lines = TIMER_LIST_FIXTURE_H743_PE9.trim().split(/\r?\n/);
        expect(parseTimerOptions(lines)).toHaveLength(2);
        expect(parseTimerOptions(TIMER_LIST_FIXTURE_H743_PE9)).toHaveLength(2);
    });
});
