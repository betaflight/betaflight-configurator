export const GIGFLIGHT_REPOSITORY = "timmyfpv/GIGFLIGHT";
export const GIGFLIGHT_CONFIG_REPOSITORY = "timmyfpv/gigflight-config";

export const GIGLRS_TARGETS = Object.freeze([
    Object.freeze({
        vendor: "giglrs",
        target: "aio",
        productName: "GIGLRS 2.4GHz AIO RX",
        luaName: "GIGLRS AIO RX",
        firmware: "Unified_ESP32C3_2400_RX",
        platform: "esp32-c3",
        uploadMethods: Object.freeze(["uart", "wifi", "betaflight"]),
        repository: "timmyfpv/giglrs",
        targetsRepository: "timmyfpv/giglrs-targets",
    }),
]);
