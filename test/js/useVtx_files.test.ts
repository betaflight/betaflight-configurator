import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, type EffectScope } from "vue";
import FC from "../../src/js/fc";
import MSP from "../../src/js/msp";
import { gui_log } from "../../src/js/gui_log";

vi.mock("../../src/js/msp/MSPHelper", () => ({
    __esModule: true,
    mspHelper: { crunch: vi.fn(() => false) },
}));
vi.mock("../../src/js/localization", () => ({ __esModule: true, i18n: { getMessage: (k: string) => k } }));
vi.mock("../../src/js/gui_log", () => ({ __esModule: true, gui_log: vi.fn() }));
vi.mock("../../src/js/Analytics", () => ({
    __esModule: true,
    tracking: { sendSaveAndChangeEvents: vi.fn(), EVENT_CATEGORIES: { FLIGHT_CONTROLLER: "fc" } },
}));
vi.mock("../../src/composables/useReboot", () => ({
    __esModule: true,
    useReboot: () => ({ saveToEeprom: vi.fn(async () => {}), saveAndReboot: vi.fn(), reboot: vi.fn() }),
}));

const { fileSystem } = vi.hoisted(() => ({
    fileSystem: {
        pickSaveFile: vi.fn(),
        pickOpenFile: vi.fn(),
        writeFile: vi.fn(),
        readFile: vi.fn(),
    },
}));
vi.mock("../../src/js/FileSystem", () => ({ __esModule: true, default: fileSystem }));

import { useVtx } from "../../src/composables/useVtx";

const abort = () => Object.assign(new Error("The user aborted a request."), { name: "AbortError" });

// Let the picker's promise chain run to completion.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("useVtx file export and import", () => {
    let scope: EffectScope;
    let vtx: ReturnType<typeof useVtx>;

    beforeEach(async () => {
        FC.resetState();
        vi.spyOn(MSP, "promise").mockResolvedValue(undefined);
        vi.mocked(gui_log).mockClear();
        for (const fn of Object.values(fileSystem)) {
            fn.mockReset();
        }
        fileSystem.writeFile.mockResolvedValue(undefined);

        scope = effectScope();
        vtx = scope.run(() => useVtx())!;
        await vtx.loadVtxConfig();
    });

    afterEach(() => {
        scope.stop();
        vi.restoreAllMocks();
    });

    it("exports a one-band table to Lua", async () => {
        vtx.vtxConfig.vtx_table_bands = 1;
        vtx.vtxConfig.vtx_table_channels = 8;
        vtx.bandList.push({
            vtxtable_band_number: 1,
            vtxtable_band_name: "RACEBAND",
            vtxtable_band_letter: "R",
            vtxtable_band_is_factory_band: false,
            vtxtable_band_frequencies: [5658, 5695, 5732, 5769, 5806, 5843, 5880, 5917],
        });
        fileSystem.pickSaveFile.mockResolvedValue({ name: "table.lua" });

        vtx.saveLuaFile();
        await settle();

        expect(fileSystem.writeFile).toHaveBeenCalledTimes(1);
        expect(fileSystem.writeFile.mock.calls[0][1]).toContain("frequenciesPerBand = 8,");
        expect(gui_log).not.toHaveBeenCalledWith("vtxSavedLuaFileKo");
    });

    it("does nothing when a picker is cancelled, whether it resolves null or rejects with AbortError", async () => {
        for (const cancel of [() => Promise.resolve(null), () => Promise.reject(abort())]) {
            fileSystem.pickSaveFile.mockImplementation(cancel);
            fileSystem.pickOpenFile.mockImplementation(cancel);

            vtx.saveJsonFile();
            vtx.saveLuaFile();
            await vtx.loadJsonFile();
            await settle();
        }

        expect(fileSystem.writeFile).not.toHaveBeenCalled();
        expect(fileSystem.readFile).not.toHaveBeenCalled();
        expect(gui_log).not.toHaveBeenCalled();
    });

    it("reports a save that fails while writing", async () => {
        fileSystem.pickSaveFile.mockResolvedValue({ name: "vtx.json" });
        fileSystem.writeFile.mockRejectedValue(new Error("disk full"));

        vtx.saveJsonFile();
        await settle();

        expect(gui_log).toHaveBeenCalledWith("vtxSavedFileKo");
    });
});
