import { describe, expect, it } from "vitest";
import {
    PORT_NONE,
    findPortIdentifierByCliName,
    formatPortSetCommand,
    getPortCliName,
    getPortDisplayName,
} from "../../src/composables/ports/portNames";

describe("port names", () => {
    it("calls the USB port VCP for the firmware and USB VCP for the user", () => {
        expect(getPortCliName(20)).toBe("VCP");
        expect(getPortDisplayName(20)).toBe("USB VCP");
    });

    it("resolves both UART identifier blocks to the same names", () => {
        expect(getPortCliName(2)).toBe("UART3");
        expect(getPortCliName(53)).toBe("UART3");
        expect(getPortCliName(50)).toBe("UART0");
        expect(getPortCliName(65)).toBe("UART15");
    });

    it("names the soft and PIO ports", () => {
        // The firmware CLI knows soft serial as SOFT1/SOFT2; only the display name spells it out.
        expect(getPortCliName(30)).toBe("SOFT1");
        expect(getPortDisplayName(30)).toBe("SOFTSERIAL1");
        expect(getPortCliName(40)).toBe("LPUART1");
        expect(getPortCliName(79)).toBe("PIOUART9");
    });

    it("reports an unknown identifier as unmappable but still shows the user something", () => {
        expect(getPortCliName(99)).toBeNull();
        expect(getPortDisplayName(99)).toBe("UART (99)");
    });

    // The firmware resolves this setting by name, so a display string ("USB VCP") leaking into the
    // CLI table would be sent verbatim and refused by the board.
    it("keeps every CLI name free of the spaces a display name would carry", () => {
        for (let identifier = -1; identifier <= 100; identifier++) {
            const name = getPortCliName(identifier);
            if (name !== null) {
                expect(name).toMatch(/^[A-Z0-9]+$/);
            }
        }
    });

    it("builds the assignment command from the CLI name", () => {
        expect(formatPortSetCommand("rx_uart", 2)).toBe("set rx_uart = UART3");
        expect(formatPortSetCommand("gps_uart", 53)).toBe("set gps_uart = UART3");
        expect(formatPortSetCommand("rx_uart", 20)).toBe("set rx_uart = VCP");
    });

    it("clears an assignment with NONE", () => {
        expect(formatPortSetCommand("rx_uart", PORT_NONE)).toBe("set rx_uart = NONE");
    });

    it("refuses to fall back to the raw identifier, which the firmware would reject", () => {
        expect(() => formatPortSetCommand("rx_uart", 99)).toThrow(/99/);
    });
});

describe("findPortIdentifierByCliName", () => {
    // UART3 is identifier 2 in the legacy block and 53 in the current one; only the ports the FC
    // reported say which block this board populates.
    const legacy = [{ identifier: 2 }, { identifier: 20 }];
    const current = [{ identifier: 53 }, { identifier: 20 }];

    it("resolves an ambiguous UART name against the board's own ports", () => {
        expect(findPortIdentifierByCliName(legacy, "UART3")).toBe(2);
        expect(findPortIdentifierByCliName(current, "UART3")).toBe(53);
    });

    it("reads NONE and an empty reply as unassigned", () => {
        expect(findPortIdentifierByCliName(current, "NONE")).toBe(PORT_NONE);
        expect(findPortIdentifierByCliName(current, null)).toBe(PORT_NONE);
        expect(findPortIdentifierByCliName(current, "")).toBe(PORT_NONE);
    });

    it("is case and whitespace insensitive, as the CLI is", () => {
        expect(findPortIdentifierByCliName(current, " uart3 ")).toBe(53);
    });

    it("resolves an unambiguous name the board did not report", () => {
        expect(findPortIdentifierByCliName([], "VCP")).toBe(20);
        expect(findPortIdentifierByCliName([], "SOFT2")).toBe(31);
    });

    it("reads an unreported ambiguous name as unassigned rather than guessing a block", () => {
        expect(findPortIdentifierByCliName([], "UART3")).toBe(PORT_NONE);
    });

    it("round trips every name it can build a command from", () => {
        for (const identifier of [2, 20, 31, 40, 53, 65, 70]) {
            const name = getPortCliName(identifier);
            expect(findPortIdentifierByCliName([{ identifier }], name)).toBe(identifier);
        }
    });
});
