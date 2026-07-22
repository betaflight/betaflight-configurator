import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope } from "vue";
import FC from "../../src/js/fc";
import MSP from "../../src/js/msp";
import MSPCodes from "../../src/js/msp/MSPCodes";

vi.mock("../../src/js/msp/MSPHelper", () => ({
    __esModule: true,
    mspHelper: {
        crunch: vi.fn(() => false),
        setArmingEnabled: vi.fn(),
    },
}));

vi.mock("../../src/js/localization", () => ({
    __esModule: true,
    i18n: { getMessage: (k) => k },
}));

vi.mock("../../src/js/gui_log", () => ({
    __esModule: true,
    gui_log: vi.fn(),
}));

vi.mock("../../src/js/Analytics", () => ({
    __esModule: true,
    tracking: {
        sendSaveAndChangeEvents: vi.fn(),
        EVENT_CATEGORIES: { FLIGHT_CONTROLLER: "fc" },
    },
}));

// Persist is EEPROM-only; stub useReboot so the save path doesn't need Pinia/serial. The spy
// stands in for the shared saveToEeprom() (which the tab now uses instead of writeConfiguration).
const { saveToEepromMock } = vi.hoisted(() => ({ saveToEepromMock: vi.fn(async () => {}) }));
vi.mock("../../src/composables/useReboot", () => ({
    __esModule: true,
    useReboot: () => ({ saveToEeprom: saveToEepromMock, saveAndReboot: vi.fn(), reboot: vi.fn() }),
}));

import { useVtx } from "../../src/composables/useVtx";
import { tracking } from "../../src/js/Analytics";

describe("useVtx", () => {
    let scope;
    let vtx;

    beforeEach(async () => {
        FC.resetState();
        saveToEepromMock.mockClear();
        tracking.sendSaveAndChangeEvents.mockClear();

        // Error-aware MSP requests: the save/load chains now use MSP.promise everywhere.
        vi.spyOn(MSP, "promise").mockResolvedValue(undefined);

        scope = effectScope();
        scope.run(() => {
            vtx = useVtx();
        });

        // Bring the composable out of its initial "updating" state and take the dirty baseline.
        await vtx.loadVtxConfig();
        MSP.promise.mockClear();
    });

    afterEach(() => {
        scope.stop();
        vi.restoreAllMocks();
    });

    it("issues the exact set and order of MSP_SET_VTX* writes, then persists to EEPROM", async () => {
        vtx.vtxConfig.vtx_table_powerlevels = 2;
        vtx.vtxConfig.vtx_table_bands = 3;

        await vtx.saveVtx();

        const codes = MSP.promise.mock.calls.map((call) => call[0]);
        expect(codes).toEqual([
            MSPCodes.MSP_SET_VTX_CONFIG,
            MSPCodes.MSP_SET_VTXTABLE_POWERLEVEL,
            MSPCodes.MSP_SET_VTXTABLE_POWERLEVEL,
            MSPCodes.MSP_SET_VTXTABLE_BAND,
            MSPCodes.MSP_SET_VTXTABLE_BAND,
            MSPCodes.MSP_SET_VTXTABLE_BAND,
        ]);

        // EEPROM persist happens once, after all the SET_ writes.
        expect(saveToEepromMock).toHaveBeenCalledTimes(1);
    });

    it("records analytics and clears the pending-verify flag only after a successful persist", async () => {
        vtx.savePending.value = true;

        await vtx.saveVtx();

        expect(saveToEepromMock).toHaveBeenCalledTimes(1);
        expect(tracking.sendSaveAndChangeEvents).toHaveBeenCalledTimes(1);
        expect(tracking.sendSaveAndChangeEvents).toHaveBeenCalledWith("fc", expect.any(Object), "vtx");
        expect(vtx.savePending.value).toBe(false);
    });

    it("does not run analytics or clear pending-verify when an MSP write rejects", async () => {
        vtx.savePending.value = true;
        MSP.promise.mockRejectedValueOnce(new Error("boom"));

        await expect(vtx.saveVtx()).rejects.toThrow("boom");

        expect(saveToEepromMock).not.toHaveBeenCalled();
        expect(tracking.sendSaveAndChangeEvents).not.toHaveBeenCalled();
        expect(vtx.savePending.value).toBe(true);
    });
});
