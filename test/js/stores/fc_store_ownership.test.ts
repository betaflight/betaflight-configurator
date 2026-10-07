import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { nextTick, watch } from "vue";
import FC from "../../../src/js/fc";
import { useFlightControllerStore } from "../../../src/stores/fc";

describe("FC shim over the flightController store", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it("hands out the store's objects, not copies", () => {
        const store = useFlightControllerStore();

        expect(FC.CONFIG).toBe(store.config);
        expect(FC.CONFIG).toBe(store.config);
    });

    it("a write through FC is visible on the store, and the reverse", () => {
        const store = useFlightControllerStore();

        FC.CONFIG.craftName = "via-shim";
        expect(store.config.craftName).toBe("via-shim");

        store.filterConfig.gyro_lowpass_hz = 321;
        expect(FC.FILTER_CONFIG.gyro_lowpass_hz).toBe(321);
    });

    it("replacing a whole domain through FC replaces it on the store and its camelCase alias", () => {
        const store = useFlightControllerStore();
        const replacement = { ...store.mixerConfig, mixer: 7 };

        FC.MIXER_CONFIG = replacement;

        expect(store.mixerConfig.mixer).toBe(7);
        expect(store.mixerConfig.mixer).toBe(7);
    });

    it("writing the camelCase alias replaces the FC key", () => {
        const store = useFlightControllerStore();

        store.gpsConfig = { ...store.gpsConfig, provider: 2 };

        expect(FC.GPS_CONFIG.provider).toBe(2);
    });

    it("a watcher on the store fires for a write made through FC", async () => {
        const store = useFlightControllerStore();
        const seen: number[] = [];
        watch(
            () => store.rcTuning.throttle_MID,
            (value) => seen.push(value),
        );

        FC.RC_TUNING.throttle_MID = 0.42;
        await nextTick();

        expect(seen).toEqual([0.42]);
    });

    it("rejects assigning a key the store does not declare", () => {
        expect(() => {
            (FC as unknown as Record<string, unknown>).NOT_A_REAL_DOMAIN = {};
        }).toThrow(TypeError);
        expect("NOT_A_REAL_DOMAIN" in FC).toBe(false);
    });

    it("does not expose Pinia internals as FC keys", () => {
        expect("$id" in FC).toBe(false);
        expect("_p" in FC).toBe(false);
    });

    it("follows a newly activated Pinia instead of the one it first saw", () => {
        FC.CONFIG.craftName = "first";

        setActivePinia(createPinia());

        expect(FC.CONFIG.craftName).toBe("");
        expect(FC.CONFIG).toBe(useFlightControllerStore().config);
    });
});

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

    it("resetState keeps LED_CONFIG_VALUES, as the legacy reset did", () => {
        const store = useFlightControllerStore();
        const ledConfigValues = store.ledConfigValues;

        store.resetState();

        expect(store.ledConfigValues).toBe(ledConfigValues);
    });

    it("helpers read the store's CONFIG", () => {
        const store = useFlightControllerStore();
        store.config.targetCapabilities = 1 << store.TARGET_CAPABILITIES_FLAGS.HAS_FLASH_BOOTLOADER;

        expect(FC.boardHasFlashBootloader()).toBe(true);
        expect(FC.boardHasVcp()).toBe(false);
    });

    it("calculateHardwareName writes into CONFIG", () => {
        const store = useFlightControllerStore();
        store.config.targetName = "STM32F405";
        store.config.boardName = "SPEEDYBEEF405";
        store.config.manufacturerId = "SPBE";

        FC.calculateHardwareName();

        expect(store.config.hardwareName).toBe("SPBE/SPEEDYBEEF405(STM32F405)");
    });
});
