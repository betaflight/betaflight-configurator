import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useFlightControllerStore } from "../../../src/stores/fc";

const ALL_RX_BUILD_OPTIONS = [
    "USE_SERIALRX_TARGET_CUSTOM",
    "USE_SERIALRX_SPEKTRUM",
    "USE_SERIALRX_SBUS",
    "USE_SERIALRX_SUMD",
    "USE_SERIALRX_SUMH",
    "USE_SERIALRX_XBUS",
    "USE_SERIALRX_IBUS",
    "USE_SERIALRX_JETIEXBUS",
    "USE_SERIALRX_CRSF",
    "USE_SERIALRX_FPORT",
    "USE_SERIALRX_SRXL2",
    "USE_SERIALRX_GHST",
    "USE_SERIALRX_MAVLINK",
];

describe("flightController store getSupportedSerialRxTypes", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it("falls back to the API-version list when build options are unknown", () => {
        const store = useFlightControllerStore();
        store.CONFIG.apiVersion = "1.47.0";
        store.CONFIG.buildOptions = [];

        expect(store.getSupportedSerialRxTypes()).toEqual(store.getSerialRxTypes());
    });

    it("lists every provider, in presentation order, when every option is built", () => {
        const store = useFlightControllerStore();
        store.CONFIG.buildOptions = [...ALL_RX_BUILD_OPTIONS].reverse();

        expect(store.getSupportedSerialRxTypes()).toEqual([
            "NONE",
            "TARGET_CUSTOM",
            "SPEKTRUM1024",
            "SPEKTRUM2048",
            "SPEKTRUM2048/SRXL",
            "SBUS",
            "SUMD",
            "SUMH",
            "XBUS_MODE_B",
            "XBUS_MODE_B_RJ01",
            "IBUS",
            "JETIEXBUS",
            "CRSF",
            "FPORT",
            "SPEKTRUM SRXL2",
            "IRC GHOST",
            "MAVLINK",
        ]);
    });

    it("keeps only the providers whose option is built, plus NONE", () => {
        const store = useFlightControllerStore();
        store.CONFIG.buildOptions = ["USE_GPS", "USE_SERIALRX_CRSF", "USE_SERIALRX_SBUS"];

        expect(store.getSupportedSerialRxTypes()).toEqual(["NONE", "SBUS", "CRSF"]);
    });

    it("offers only NONE when no receiver option is built", () => {
        const store = useFlightControllerStore();
        store.CONFIG.buildOptions = ["USE_GPS"];

        expect(store.getSupportedSerialRxTypes()).toEqual(["NONE"]);
    });
});
