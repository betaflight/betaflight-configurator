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

        expect(FC.CONFIG).toBe(store.CONFIG);
        expect(FC.CONFIG).toBe(store.config);
    });

    it("a write through FC is visible on the store, and the reverse", () => {
        const store = useFlightControllerStore();

        FC.CONFIG.craftName = "via-shim";
        expect(store.CONFIG.craftName).toBe("via-shim");

        store.FILTER_CONFIG.gyro_lowpass_hz = 321;
        expect(FC.FILTER_CONFIG.gyro_lowpass_hz).toBe(321);
    });

    it("replacing a whole domain through FC replaces it on the store and its camelCase alias", () => {
        const store = useFlightControllerStore();
        const replacement = { ...store.MIXER_CONFIG, mixer: 7 };

        FC.MIXER_CONFIG = replacement;

        expect(store.MIXER_CONFIG.mixer).toBe(7);
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
            () => store.RC_TUNING.throttle_MID,
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
        expect(FC.CONFIG).toBe(useFlightControllerStore().CONFIG);
    });
});

describe("flightController store state", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it("is populated before the first resetState, so no domain reads as null", () => {
        const store = useFlightControllerStore();

        expect(store.FILTER_CONFIG).not.toBeNull();
        expect(store.PIDS).toHaveLength(10);
        expect(store.PIDS[0]).toHaveLength(3);
        expect(store.VTX_DEVICE_STATUS).toBeNull();
    });

    it("resetState replaces domain objects and restores initial values", () => {
        const store = useFlightControllerStore();
        const before = store.CONFIG;
        store.CONFIG.apiVersion = "1.47.0";
        store.RC_TUNING.throttleLimitPercent = 50;

        store.resetState();

        expect(store.CONFIG).not.toBe(before);
        expect(store.CONFIG.apiVersion).toBe("0.0.0");
        expect(store.RC_TUNING.throttleLimitPercent).toBe(100);
    });

    it("resetState does not share nested arrays between resets", () => {
        const store = useFlightControllerStore();
        store.CONFIG.uid[0] = 99;
        store.PIDS[0][0] = 42;

        store.resetState();

        expect(store.CONFIG.uid).toEqual([0, 0, 0]);
        expect(store.PIDS[0][0]).toBeUndefined();
    });

    it("resetState keeps LED_CONFIG_VALUES, as the legacy reset did", () => {
        const store = useFlightControllerStore();
        const ledConfigValues = store.LED_CONFIG_VALUES;

        store.resetState();

        expect(store.LED_CONFIG_VALUES).toBe(ledConfigValues);
    });

    it("helpers read the store's CONFIG", () => {
        const store = useFlightControllerStore();
        store.CONFIG.targetCapabilities = 1 << store.TARGET_CAPABILITIES_FLAGS.HAS_FLASH_BOOTLOADER;

        expect(FC.boardHasFlashBootloader()).toBe(true);
        expect(FC.boardHasVcp()).toBe(false);
    });

    it("calculateHardwareName writes into CONFIG", () => {
        const store = useFlightControllerStore();
        store.CONFIG.targetName = "STM32F405";
        store.CONFIG.boardName = "SPEEDYBEEF405";
        store.CONFIG.manufacturerId = "SPBE";

        FC.calculateHardwareName();

        expect(store.CONFIG.hardwareName).toBe("SPBE/SPEEDYBEEF405(STM32F405)");
    });
});
