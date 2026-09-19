import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { effectScope } from "vue";
import { useDronecanDevice } from "../../src/composables/useDronecanDevice";

const { getSetting, getSettingInfo, setSetting } = vi.hoisted(() => ({
    getSetting: vi.fn(),
    getSettingInfo: vi.fn(),
    setSetting: vi.fn(),
}));

vi.mock("../../src/composables/useMspSetting", () => ({ getSetting, getSettingInfo, setSetting }));

describe("useDronecanDevice", () => {
    let scope;
    let bus;

    // The composable reads dronecan_device first, then its bounds, then dronecan_enabled.
    function withSettings({ device = "1", max = 3, enabled = "OFF" } = {}) {
        getSetting.mockImplementation(async (setting) =>
            setting === "dronecan_device" ? device : setting === "dronecan_enabled" ? enabled : null,
        );
        getSettingInfo.mockResolvedValue(max === null ? null : { type: "uint8", min: 1, max, values: null });
    }

    beforeEach(() => {
        getSetting.mockReset();
        getSettingInfo.mockReset();
        setSetting.mockReset();
        setSetting.mockResolvedValue("");

        scope?.stop();
        scope = effectScope();
        scope.run(() => {
            bus = useDronecanDevice();
        });
    });

    afterEach(() => {
        scope?.stop();
        scope = undefined;
    });

    describe("probing", () => {
        it("reports unsupported on a build without the stack", async () => {
            getSetting.mockResolvedValue(null);

            await bus.load();

            expect(bus.supported.value).toBe(false);
            expect(bus.deviceOptions.value).toEqual([]);
            expect(bus.changed.value).toBe(false);
            // Nothing else is worth asking for once the probe comes back empty.
            expect(getSettingInfo).not.toHaveBeenCalled();
        });

        it("takes the bus count from the setting's own bounds", async () => {
            withSettings({ device: "1", max: 3 });

            await bus.load();

            expect(bus.supported.value).toBe(true);
            expect(bus.selectedDevice.value).toBe(1);
            expect(bus.deviceOptions.value).toEqual([
                { value: 1, label: "CAN1" },
                { value: 2, label: "CAN2" },
                { value: 3, label: "CAN3" },
            ]);
        });

        it("falls back to the stored value when the bounds are unreadable", async () => {
            withSettings({ device: "2", max: null });

            await bus.load();

            expect(bus.deviceOptions.value.map((option) => option.label)).toEqual(["CAN1", "CAN2"]);
        });

        it("reads the enable flag, which is off by default", async () => {
            withSettings({ enabled: "OFF" });

            await bus.load();

            expect(bus.enabled.value).toBe(false);
        });

        it("reads the enable flag when the stack is already running", async () => {
            withSettings({ enabled: "ON" });

            await bus.load();

            expect(bus.enabled.value).toBe(true);
        });

        it("does nothing on a build without the stack", async () => {
            getSetting.mockResolvedValue(null);
            await bus.load();

            await bus.write({ enable: true });

            expect(setSetting).not.toHaveBeenCalled();
        });
    });

    // Selecting a DroneCAN device is itself the request to run the stack; there is no switch.
    describe("enabling", () => {
        it("turns the stack on when a DroneCAN device is selected", async () => {
            withSettings({ enabled: "OFF" });
            await bus.load();

            await bus.write({ enable: true });

            expect(setSetting).toHaveBeenCalledWith("dronecan_enabled", "ON");
            expect(bus.enabled.value).toBe(true);
        });

        it("does not rewrite the flag when the stack is already running", async () => {
            withSettings({ enabled: "ON" });
            await bus.load();

            await bus.write({ enable: true });

            expect(setSetting).not.toHaveBeenCalled();
        });

        // A tab only knows about its own device, so it must never conclude the bus is unwanted:
        // a compass, an airspeed sensor or ESC telemetry may still be using it.
        it("never turns the stack off", async () => {
            withSettings({ enabled: "ON" });
            await bus.load();

            await bus.write({ enable: false });

            expect(setSetting).not.toHaveBeenCalledWith("dronecan_enabled", "OFF");
            expect(bus.enabled.value).toBe(true);
        });

        it("leaves the stack alone when no DroneCAN device is selected", async () => {
            withSettings({ enabled: "OFF" });
            await bus.load();

            await bus.write({ enable: false });

            expect(setSetting).not.toHaveBeenCalled();
            expect(bus.enabled.value).toBe(false);
        });

        it("propagates a refused enable without marking it applied", async () => {
            withSettings({ enabled: "OFF" });
            await bus.load();

            setSetting.mockRejectedValue(new Error("The flight controller refused dronecan_enabled = ON"));

            await expect(bus.write({ enable: true })).rejects.toThrow(/refused/);
            expect(bus.enabled.value).toBe(false);
        });
    });

    describe("bus selection", () => {
        it("writes the selected bus and settles the dirty state", async () => {
            withSettings({ device: "1", max: 3 });
            await bus.load();

            bus.selectedDevice.value = 2;
            expect(bus.changed.value).toBe(true);

            await bus.write({ enable: false });

            expect(setSetting).toHaveBeenCalledWith("dronecan_device", 2);
            expect(bus.changed.value).toBe(false);
        });

        it("writes nothing when nothing moved", async () => {
            withSettings();
            await bus.load();

            setSetting.mockClear();
            await bus.write({ enable: false });

            expect(setSetting).not.toHaveBeenCalled();
        });

        it("rolls the bus back when the firmware refuses the set", async () => {
            withSettings({ device: "1", max: 3 });
            await bus.load();
            bus.selectedDevice.value = 3;

            setSetting.mockRejectedValue(new Error("The flight controller refused dronecan_device = 3"));

            await expect(bus.write({ enable: false })).rejects.toThrow(/refused/);
            expect(bus.selectedDevice.value).toBe(1);
            expect(bus.changed.value).toBe(false);
        });

        it("leaves the bus alone when enabling the stack failed first", async () => {
            withSettings({ device: "1", max: 3, enabled: "OFF" });
            await bus.load();
            bus.selectedDevice.value = 2;

            setSetting.mockRejectedValue(new Error("refused"));

            await expect(bus.write({ enable: true })).rejects.toThrow(/refused/);
            expect(setSetting).toHaveBeenCalledTimes(1);
            expect(bus.selectedDevice.value).toBe(2);
        });
    });

    // The enable reaches the running config the moment it is accepted, but only survives a reboot
    // once the caller persists it -- and the caller abandons the persist on this throw. If it were
    // left marked as applied, a retry would skip it while EEPROM still held the old value, and a
    // reboot would silently lose it.
    describe("partial failure", () => {
        it("keeps the enable pending when the bus write fails after it succeeded", async () => {
            withSettings({ device: "1", max: 3, enabled: "OFF" });
            await bus.load();
            bus.selectedDevice.value = 2;

            setSetting.mockResolvedValueOnce("ON").mockRejectedValueOnce(new Error("refused"));

            await expect(bus.write({ enable: true })).rejects.toThrow(/refused/);

            expect(bus.enabled.value).toBe(false); // so the next save re-applies it
            expect(bus.selectedDevice.value).toBe(1); // refused, so rolled back
        });

        it("re-applies the enable on a later save after a bus write failed", async () => {
            withSettings({ device: "1", max: 3, enabled: "OFF" });
            await bus.load();
            bus.selectedDevice.value = 2;

            setSetting.mockResolvedValueOnce("ON").mockRejectedValueOnce(new Error("refused"));
            await expect(bus.write({ enable: true })).rejects.toThrow(/refused/);

            setSetting.mockReset();
            setSetting.mockResolvedValue("");
            await bus.write({ enable: true });

            expect(setSetting).toHaveBeenCalledWith("dronecan_enabled", "ON");
            expect(bus.enabled.value).toBe(true);
        });
    });
});
