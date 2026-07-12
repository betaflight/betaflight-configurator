import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope } from "vue";
import FC from "../../src/js/fc";
import MSP from "../../src/js/msp";

vi.mock("../../src/js/msp/MSPHelper", () => ({
    __esModule: true,
    mspHelper: {
        writeConfiguration: vi.fn((reboot, callback) => callback && callback()),
        crunch: vi.fn(() => false),
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

import { useVtx } from "../../src/composables/useVtx";
import { mspHelper } from "../../src/js/msp/MSPHelper";

describe("useVtx", () => {
    let scope;
    let vtx;

    beforeEach(async () => {
        vi.useFakeTimers();
        FC.resetState();

        vi.spyOn(MSP, "send_message").mockImplementation((code, data, retries, cb) => {
            if (typeof cb === "function") {
                cb();
            }
        });

        scope = effectScope();
        scope.run(() => {
            vtx = useVtx();
        });

        // Bring the composable out of its initial "updating" state so saveVtx() is allowed to run.
        await vtx.loadVtxConfig();
    });

    afterEach(() => {
        scope.stop();
        vi.runAllTimers();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("clears both onSaveComplete timers on scope dispose, so no reload happens after unmount", async () => {
        vtx.saveVtx();

        expect(mspHelper.writeConfiguration).toHaveBeenCalledTimes(1);
        expect(vtx.saveButtonText.value).toBe("buttonSaving");

        const callsAfterSave = MSP.send_message.mock.calls.length;

        scope.stop();

        // Advance past both chained 1500ms timeouts (3000ms total).
        await vi.advanceTimersByTimeAsync(3100);

        // No further MSP traffic should have occurred — the reload (loadVtxConfig) never ran,
        // and the button text is stuck on "Saving" rather than being reset.
        expect(MSP.send_message.mock.calls).toHaveLength(callsAfterSave);
        expect(vtx.saveButtonText.value).toBe("buttonSaving");
    });

    it("without dispose, the pending timers still fire and reload vtx config (proves the test is not vacuous)", async () => {
        vtx.saveVtx();

        expect(vtx.saveButtonText.value).toBe("buttonSaving");
        const callsAfterSave = MSP.send_message.mock.calls.length;

        await vi.advanceTimersByTimeAsync(3100);

        // loadVtxConfig() sent at least one further MSP_VTX_CONFIG request, and the button reset.
        expect(MSP.send_message.mock.calls.length).toBeGreaterThan(callsAfterSave);
        expect(vtx.saveButtonText.value).toBe("");
    });
});
