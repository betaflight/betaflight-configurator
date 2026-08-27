import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { effectScope } from "vue";
import FC from "../../src/js/fc";
import { useDronecanDevice } from "../../src/composables/useDronecanDevice";

const { cliSend } = vi.hoisted(() => ({ cliSend: vi.fn() }));
vi.mock("../../src/composables/useMspCliSession", async (importOriginal) => ({
    ...(await importOriginal()),
    send: cliSend,
}));

describe("useDronecanDevice", () => {
    let scope;
    let bus;

    function withFirmware(version = "4.6.0") {
        FC.CONFIG.flightControllerVersion = version;

        scope?.stop();
        scope = effectScope();
        scope.run(() => {
            bus = useDronecanDevice();
        });
    }

    beforeEach(() => {
        FC.resetState();
        cliSend.mockReset();
        withFirmware();
    });

    afterEach(() => {
        scope?.stop();
        scope = undefined;
    });

    it("reports unsupported on a build without the setting", async () => {
        cliSend.mockResolvedValue(["###ERROR IN get: INVALID NAME###"]);

        await bus.load();

        expect(bus.supported.value).toBe(false);
        expect(bus.deviceOptions.value).toEqual([]);
        expect(bus.changed.value).toBe(false);
    });

    it("takes the bus count from the range the same reply carries", async () => {
        cliSend.mockResolvedValue(["dronecan_device = 1", "Allowed range: 1 - 3"]);

        await bus.load();

        expect(bus.supported.value).toBe(true);
        expect(bus.selectedDevice.value).toBe(1);
        expect(bus.deviceOptions.value).toEqual([
            { value: 1, label: "CAN1" },
            { value: 2, label: "CAN2" },
            { value: 3, label: "CAN3" },
        ]);
    });

    it("falls back to the stored value when the reply carries no range", async () => {
        cliSend.mockResolvedValue(["dronecan_device = 2"]);

        await bus.load();

        expect(bus.deviceOptions.value.map((option) => option.label)).toEqual(["CAN1", "CAN2"]);
    });

    it("does nothing on firmware too old for the MSP CLI", async () => {
        withFirmware("4.5.0");

        await bus.load();

        expect(cliSend).not.toHaveBeenCalled();
        expect(bus.supported.value).toBe(false);
    });

    it("writes the selected bus and settles the dirty state", async () => {
        cliSend.mockResolvedValue(["dronecan_device = 1", "Allowed range: 1 - 3"]);
        await bus.load();

        bus.selectedDevice.value = 2;
        expect(bus.changed.value).toBe(true);

        cliSend.mockResolvedValue([]);
        await bus.write();

        expect(cliSend).toHaveBeenCalledWith("set dronecan_device = 2");
        expect(bus.changed.value).toBe(false);
    });

    it("writes nothing when the selection has not moved", async () => {
        cliSend.mockResolvedValue(["dronecan_device = 1", "Allowed range: 1 - 3"]);
        await bus.load();

        cliSend.mockClear();
        await bus.write();

        expect(cliSend).not.toHaveBeenCalled();
    });

    it("keeps the change pending when the firmware refuses the set", async () => {
        cliSend.mockResolvedValue(["dronecan_device = 1", "Allowed range: 1 - 3"]);
        await bus.load();
        bus.selectedDevice.value = 3;

        cliSend.mockResolvedValue(["###ERROR IN set: INVALID VALUE###"]);

        await expect(bus.write()).rejects.toThrow(/ERROR/);
        expect(bus.changed.value).toBe(true);
    });
});
