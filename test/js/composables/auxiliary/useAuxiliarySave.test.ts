import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";
import { mspHelper } from "../../../../src/js/msp/MSPHelper";
import { useFlightControllerStore } from "../../../../src/stores/fc";
import { useAuxiliarySave } from "../../../../src/composables/auxiliary/useAuxiliarySave";
import type { Mode } from "../../../../src/js/utils/modeRanges";

const saveToEeprom = vi.fn();

vi.mock("../../../../src/js/msp/MSPHelper", () => ({ mspHelper: { sendModeRanges: vi.fn() } }));
vi.mock("../../../../src/composables/useReboot", () => ({ useReboot: () => ({ saveToEeprom }) }));
vi.mock("../../../../src/js/gui_log", () => ({ gui_log: vi.fn() }));
vi.mock("../../../../src/js/localization", () => ({ i18n: { getMessage: (key: string) => key } }));

const ARM: Mode = { id: 0, entries: [{ kind: "range", auxChannelIndex: 1, modeLogic: 0, sliderRange: [1700, 2100] }] };

describe("useAuxiliarySave", () => {
    let fcStore: ReturnType<typeof useFlightControllerStore>;
    let takeSnapshot: ReturnType<typeof vi.fn<() => string>>;
    let markClean: ReturnType<typeof vi.fn<(snapshot?: string) => void>>;

    beforeEach(() => {
        // reset, not clear: a failure stubbed in one test must not leak into the next
        vi.resetAllMocks();
        setActivePinia(createPinia());
        fcStore = useFlightControllerStore();
        takeSnapshot = vi.fn(() => "snapshot-before-send");
        markClean = vi.fn();
    });

    const save = (modes: Mode[], required = 0) =>
        useAuxiliarySave(modes, ref(required), { takeSnapshot, markClean }).saveModes();

    it("puts the payload in the store before sending, then persists and moves the baseline", async () => {
        vi.mocked(mspHelper.sendModeRanges).mockImplementation(async () => {
            expect(fcStore.modeRanges).toEqual([{ id: 0, auxChannelIndex: 1, range: { start: 1700, end: 2100 } }]);
            expect(fcStore.modeRangesExtra).toEqual([{ id: 0, modeLogic: 0, linkedTo: 0 }]);
            expect(saveToEeprom).not.toHaveBeenCalled();
        });

        await save([ARM]);

        expect(mspHelper.sendModeRanges).toHaveBeenCalledOnce();
        expect(saveToEeprom).toHaveBeenCalledOnce();
        expect(markClean).toHaveBeenCalledExactlyOnceWith("snapshot-before-send");
    });

    it("takes the dirty snapshot before the write, so an edit made in flight stays dirty", async () => {
        vi.mocked(mspHelper.sendModeRanges).mockImplementation(async () => {
            takeSnapshot.mockReturnValue("edited-while-saving");
        });

        await save([ARM]);

        expect(markClean).toHaveBeenCalledExactlyOnceWith("snapshot-before-send");
    });

    it("pads the payload to the slot count the FC reported", async () => {
        await save([ARM], 3);

        expect(fcStore.modeRanges).toHaveLength(3);
        expect(fcStore.modeRangesExtra).toHaveLength(3);
        expect(fcStore.modeRanges[2]).toEqual({ id: 0, auxChannelIndex: 0, range: { start: 900, end: 900 } });
    });

    it("leaves the baseline alone and skips EEPROM when the send fails", async () => {
        vi.mocked(mspHelper.sendModeRanges).mockRejectedValue(new Error("MSP timeout"));
        vi.spyOn(console, "error").mockImplementation(() => {});
        const { saveModes, isSaving } = useAuxiliarySave([ARM], ref(0), { takeSnapshot, markClean });

        await saveModes();

        expect(saveToEeprom).not.toHaveBeenCalled();
        expect(markClean).not.toHaveBeenCalled();
        expect(isSaving.value).toBe(false);
    });

    it("leaves the baseline alone when the EEPROM write fails", async () => {
        saveToEeprom.mockRejectedValueOnce(new Error("EEPROM"));
        vi.spyOn(console, "error").mockImplementation(() => {});

        await save([ARM]);

        expect(markClean).not.toHaveBeenCalled();
    });
});
