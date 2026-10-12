import { describe, expect, it, vi } from "vitest";

// CapacitorBle bails out in its constructor without the native plugin, so provide a stub.
vi.mock("@capacitor/core", () => ({
    Capacitor: { Plugins: { BetaflightBle: { addListener: vi.fn() } } },
}));
vi.mock("../../src/js/protocols/devices", () => ({ bluetoothDevices: [] }));

const { default: CapacitorBle } = await import("../../src/js/protocols/CapacitorBle.js");

describe("CapacitorBle.shouldBypassCrc", () => {
    function susceptible() {
        const ble = new CapacitorBle();
        ble.deviceDescription = { name: "CC2541", susceptibleToCrcCorruption: true };
        return ble;
    }

    it("bypasses a received 0xff checksum when the computed one differs", () => {
        expect(susceptible().shouldBypassCrc(0xff, 0x12)).toBe(true);
    });

    it("does not bypass when the computed checksum is 0xff too, or the received one is not 0xff", () => {
        const ble = susceptible();

        expect(ble.shouldBypassCrc(0xff, 0xff)).toBe(false);
        expect(ble.shouldBypassCrc(0x12, 0x34)).toBe(false);
    });

    it("never bypasses for a module that is not susceptible", () => {
        const ble = new CapacitorBle();
        ble.deviceDescription = { name: "HM-10" };

        expect(ble.shouldBypassCrc(0xff, 0x12)).toBe(false);
    });
});
