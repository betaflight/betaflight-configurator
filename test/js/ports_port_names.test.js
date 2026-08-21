import { describe, expect, it } from "vitest";
import {
    PORT_NONE,
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
        expect(getPortCliName(30)).toBe("SOFTSERIAL1");
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
