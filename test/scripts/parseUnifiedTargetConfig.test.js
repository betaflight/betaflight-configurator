import { describe, expect, it } from "vitest";
import { parseUnifiedTargetConfig } from "../../scripts/lib/parseUnifiedTargetConfig.mjs";

describe("parseUnifiedTargetConfig", () => {
    it("extracts board name, manufacturer, motors, and led strips from a typical config", () => {
        const config = `# Betaflight / STM32F7X2 (S7X2) 4.0.6
#mcu STM32F7X2
#define USE_GYRO

board_name AIKONF7
manufacturer_id AIKO

# resources
resource BEEPER 1 C15
resource MOTOR 1 C06
resource MOTOR 2 C07
resource MOTOR 3 C08
resource LED_STRIP 1 A15
resource SERIAL_TX 1 A09
`;
        const result = parseUnifiedTargetConfig(config);
        expect(result.boardName).toBe("AIKONF7");
        expect(result.manufacturerId).toBe("AIKO");
        expect(result.motors).toEqual([
            { index: 1, pad: "C06" },
            { index: 2, pad: "C07" },
            { index: 3, pad: "C08" },
        ]);
        expect(result.ledStrips).toEqual([{ pad: "A15" }]);
    });

    it("returns null manufacturerId when manufacturer_id line is absent", () => {
        const config = `board_name FOO
resource MOTOR 1 C06
`;
        const result = parseUnifiedTargetConfig(config);
        expect(result.boardName).toBe("FOO");
        expect(result.manufacturerId).toBeNull();
    });

    it("ignores non-MOTOR / non-LED_STRIP resources", () => {
        const config = `board_name TEST
resource BEEPER 1 B04
resource I2C_SCL 2 B10
resource SPI_MOSI 1 A07
resource ADC_BATT 1 C00
resource GYRO_CS 1 A04
`;
        const result = parseUnifiedTargetConfig(config);
        expect(result.motors).toEqual([]);
        expect(result.ledStrips).toEqual([]);
    });

    it("ignores timer, dma, feature, serial, and set blocks", () => {
        const config = `board_name TEST
resource MOTOR 1 B00
timer B00 AF2
# pin B00: TIM3 CH3 (AF2)
dma pin B00 0
# pin B00: DMA1 Stream 7 Channel 5
feature OSD
serial 0 64 115200 57600 0 115200
set dshot_burst = ON
`;
        const result = parseUnifiedTargetConfig(config);
        expect(result.boardName).toBe("TEST");
        expect(result.motors).toEqual([{ index: 1, pad: "B00" }]);
    });

    it("sorts motors by index regardless of declaration order", () => {
        // Some configs declare MOTOR 5 before MOTOR 3. Sort so downstream
        // consumers can index motors[i] and trust position == declared index.
        const config = `board_name TEST
resource MOTOR 5 B06
resource MOTOR 1 C06
resource MOTOR 3 B00
resource MOTOR 2 C07
`;
        const result = parseUnifiedTargetConfig(config);
        expect(result.motors.map((m) => m.index)).toEqual([1, 2, 3, 5]);
    });

    it("normalises pad and board names to uppercase", () => {
        const config = `board_name lowerboard
resource MOTOR 1 c06
resource LED_STRIP 1 a15
`;
        const result = parseUnifiedTargetConfig(config);
        expect(result.boardName).toBe("LOWERBOARD");
        expect(result.motors).toEqual([{ index: 1, pad: "C06" }]);
        expect(result.ledStrips).toEqual([{ pad: "A15" }]);
    });

    it("returns empty motors and ledStrips when no board_name found", () => {
        const config = `# orphan config
resource MOTOR 1 C06
`;
        const result = parseUnifiedTargetConfig(config);
        // Board name is null, but resources still parse (caller decides to drop).
        expect(result.boardName).toBeNull();
        expect(result.motors).toEqual([{ index: 1, pad: "C06" }]);
    });

    it("handles non-string input safely", () => {
        const empty = { boardName: null, manufacturerId: null, motors: [], ledStrips: [] };
        expect(parseUnifiedTargetConfig(null)).toEqual(empty);
        expect(parseUnifiedTargetConfig(undefined)).toEqual(empty);
        expect(parseUnifiedTargetConfig(42)).toEqual(empty);
    });

    it("ignores commented-out resource lines", () => {
        const config = `board_name TEST
# resource MOTOR 1 C06   <- this is a comment
resource MOTOR 2 C07
`;
        const result = parseUnifiedTargetConfig(config);
        expect(result.motors).toEqual([{ index: 2, pad: "C07" }]);
    });

    it("handles CRLF line endings", () => {
        const config = "board_name TEST\r\nresource MOTOR 1 C06\r\nresource LED_STRIP 1 A15\r\n";
        const result = parseUnifiedTargetConfig(config);
        expect(result.boardName).toBe("TEST");
        expect(result.motors).toEqual([{ index: 1, pad: "C06" }]);
        expect(result.ledStrips).toEqual([{ pad: "A15" }]);
    });
});
