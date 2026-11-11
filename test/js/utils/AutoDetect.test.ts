import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const { guiLog } = vi.hoisted(() => ({ guiLog: vi.fn() }));
vi.mock("../../../src/js/gui_log", () => ({ gui_log: guiLog }));
vi.mock("../../../src/js/localization", () => ({ i18n: { getMessage: (key: string) => key } }));

import AutoDetect from "../../../src/js/utils/AutoDetect";
import { useFlightControllerStore } from "../../../src/stores/fc";

/** Run onFinishClose with this detection callback; cleanup (the serial disconnect) is stubbed. */
async function finishWith(onBoardDetected: (boardName: string) => boolean | Promise<boolean>) {
    Object.assign(AutoDetect, { _onBoardDetected: onBoardDetected });
    await AutoDetect.onFinishClose();
}

describe("AutoDetect.onFinishClose", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        useFlightControllerStore().config.boardName = "NOSUCHBOARD";
        vi.spyOn(AutoDetect, "cleanup").mockResolvedValue();
        guiLog.mockClear();
        AutoDetect.targetAvailable = false;
    });

    it("reports not available when the async callback resolves false", async () => {
        await finishWith(async () => false);

        expect(AutoDetect.targetAvailable).toBe(false);
        expect(guiLog).toHaveBeenCalledWith("firmwareFlasherBoardVerficationTargetNotAvailable");
    });

    it("reports success when the async callback resolves true", async () => {
        await finishWith(async () => true);

        expect(AutoDetect.targetAvailable).toBe(true);
        expect(guiLog).toHaveBeenCalledWith("firmwareFlasherBoardVerificationSuccess");
    });

    it("treats a rejecting callback as not found and still cleans up", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        await finishWith(() => Promise.reject(new Error("boom")));

        expect(AutoDetect.targetAvailable).toBe(false);
        expect(AutoDetect.cleanup).toHaveBeenCalledOnce();
    });

    it("settles the callback before cleanup, which triggers onClosed reading targetAvailable", async () => {
        let availableAtCleanup: boolean | undefined;
        vi.mocked(AutoDetect.cleanup).mockImplementation(async () => {
            availableAtCleanup = AutoDetect.targetAvailable;
        });

        await finishWith(async () => true);

        expect(availableAtCleanup).toBe(true);
    });
});
