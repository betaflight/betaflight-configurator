import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { generateFilename } from "../../../src/js/utils/generate_filename";
import { useFlightControllerStore } from "../../../src/stores/fc";

describe("generateFilename", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 0, 2, 3, 4, 5));
        const fcStore = useFlightControllerStore();
        fcStore.config.apiVersion = "1.46.0";
        fcStore.config.flightControllerIdentifier = "BTFL";
        fcStore.config.boardName = "";
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("zero-pads single-digit date and time fields", () => {
        useFlightControllerStore().config.craftName = "";

        expect(generateFilename("BLACKBOX_LOG", "bbl")).toBe("BTFL_BLACKBOX_LOG_20260102_030405.bbl");
    });

    it("replaces every run of whitespace in the craft name, not just the first space", () => {
        useFlightControllerStore().config.craftName = " my  fast\tquad ";

        expect(generateFilename("BACKUP", "txt")).toBe("BTFL_BACKUP_MY_FAST_QUAD_20260102_030405.txt");
    });
});
