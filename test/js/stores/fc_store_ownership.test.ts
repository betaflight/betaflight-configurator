import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useFlightControllerStore } from "../../../src/stores/fc";

describe("flightController store state", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it("is populated before the first resetState, so no domain reads as null", () => {
        const store = useFlightControllerStore();

        expect(store.filterConfig).not.toBeNull();
        expect(store.pids).toHaveLength(10);
        expect(store.pids[0]).toHaveLength(3);
        expect(store.vtxDeviceStatus).toBeNull();
    });

    it("resetState replaces domain objects and restores initial values", () => {
        const store = useFlightControllerStore();
        const before = store.config;
        store.config.apiVersion = "1.47.0";
        store.rcTuning.throttleLimitPercent = 50;

        store.resetState();

        expect(store.config).not.toBe(before);
        expect(store.config.apiVersion).toBe("0.0.0");
        expect(store.rcTuning.throttleLimitPercent).toBe(100);
    });

    it("resetState does not share nested arrays between resets", () => {
        const store = useFlightControllerStore();
        store.config.uid[0] = 99;
        store.pids[0][0] = 42;

        store.resetState();

        expect(store.config.uid).toEqual([0, 0, 0]);
        expect(store.pids[0][0]).toBeUndefined();
    });

    it("resetState keeps ledConfigValues, as the legacy reset did", () => {
        const store = useFlightControllerStore();
        const ledConfigValues = store.ledConfigValues;

        store.resetState();

        expect(store.ledConfigValues).toBe(ledConfigValues);
    });

    it("helpers read the store's config", () => {
        const store = useFlightControllerStore();
        store.config.targetCapabilities = 1 << store.TARGET_CAPABILITIES_FLAGS.HAS_FLASH_BOOTLOADER;

        expect(store.boardHasFlashBootloader()).toBe(true);
        expect(store.boardHasVcp()).toBe(false);
    });

    it("has no legacy SCREAMING parameter-group names left", () => {
        const store = useFlightControllerStore();

        expect("CONFIG" in store).toBe(false);
        expect("PIDS" in store).toBe(false);
        expect(store.config).toBeDefined();
    });

    it("calculateHardwareName writes into config", () => {
        const store = useFlightControllerStore();
        store.config.targetName = "STM32F405";
        store.config.boardName = "SPEEDYBEEF405";
        store.config.manufacturerId = "SPBE";

        store.calculateHardwareName();

        expect(store.config.hardwareName).toBe("SPBE/SPEEDYBEEF405(STM32F405)");
    });
});
