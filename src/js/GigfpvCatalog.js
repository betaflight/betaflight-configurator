/**
 * Product-owned firmware catalogues.
 *
 * Keep these lists intentionally small.  A target must exist in the matching
 * GIGFPV firmware repository before it is offered for flashing.
 */
export const GIGFLIGHT_TARGETS = Object.freeze([
    Object.freeze({
        target: "GIGRACE",
        group: "supported",
        partnerApproved: true,
        manufacturer: "GIGFPV",
        mcu: "STM32H743VIH6",
        repository: "timmyfpv/GIGFLIGHT",
    }),
]);

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

export function findGigflightTarget(target) {
    return GIGFLIGHT_TARGETS.find((descriptor) => descriptor.target === target);
}

export function isGigflightTarget(target) {
    return Boolean(findGigflightTarget(target));
}
