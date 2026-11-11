import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import MSP from "../../../../src/js/msp";
import MSPCodes from "../../../../src/js/msp/MSPCodes";
import { useFlightControllerStore } from "../../../../src/stores/fc";
import { useFailsafeData } from "../../../../src/composables/failsafe/useFailsafeData";

vi.mock("../../../../src/js/msp", () => ({ default: { promise: vi.fn() } }));

const LOAD_ORDER = [
    MSPCodes.MSP_RX_CONFIG,
    MSPCodes.MSP_FAILSAFE_CONFIG,
    MSPCodes.MSP_GPS_RESCUE,
    MSPCodes.MSP_RXFAIL_CONFIG,
    MSPCodes.MSP_FEATURE_CONFIG,
    MSPCodes.MSP_BOXNAMES,
    MSPCodes.MSP_BOXIDS,
    MSPCodes.MSP_RC,
    MSPCodes.MSP_RSSI_CONFIG,
    MSPCodes.MSP_MODE_RANGES,
];

const requested = () => vi.mocked(MSP.promise).mock.calls.map(([code]) => code);

describe("useFailsafeData", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        setActivePinia(createPinia());
        useFlightControllerStore().config.apiVersion = "1.41.0";
        vi.mocked(MSP.promise).mockResolvedValue(undefined);
    });

    it("loads in the order the tab depends on, including GPS Rescue from API 1.41", async () => {
        await useFailsafeData().loadFailsafeData();

        expect(requested()).toEqual(LOAD_ORDER);
    });

    it("skips GPS Rescue before API 1.41", async () => {
        useFlightControllerStore().config.apiVersion = "1.40.0";

        await useFailsafeData().loadFailsafeData();

        expect(requested()).toEqual(LOAD_ORDER.filter((code) => code !== MSPCodes.MSP_GPS_RESCUE));
    });

    it("stops at the first failed request", async () => {
        vi.mocked(MSP.promise).mockRejectedValueOnce(new Error("MSP timeout"));

        await expect(useFailsafeData().loadFailsafeData()).rejects.toThrow("MSP timeout");
        expect(MSP.promise).toHaveBeenCalledOnce();
    });
});
