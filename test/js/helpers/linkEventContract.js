import { expect } from "vitest";

// ---------------------------------------------------------------------------
// Shared reconnect-token contract assertions.
//
// Every transport (WebSerial/WebBluetooth/Tauri*/Capacitor*/Websocket/Virtual)
// exposes the same token surface: getReconnectToken() (null when disconnected, a
// frozen identity when connected) and resolveReconnectTarget() (re-derives the
// live target for a matching token, null for an unknown id / wrong transport /
// null token).
//
// Per-transport SETUP differs wildly (mocked SerialPort vs navigator.bluetooth
// vs @tauri-apps invoke/listen vs Capacitor plugins vs a stubbed global
// WebSocket), so these helpers deliberately do NOT own the setup. Each test
// builds + connects its own instance, then calls these to collapse the repeated
// expect() bodies. Coverage is preserved 1:1.
// ---------------------------------------------------------------------------

/** A not-connected transport yields a null token. */
export function expectNullTokenWhenDisconnected(instance) {
    expect(instance.getReconnectToken()).toBeNull();
}

/** A connected transport freezes exactly `expectedToken`. */
export function expectTokenShape(instance, expectedToken) {
    expect(instance.getReconnectToken()).toEqual(expectedToken);
}

/**
 * resolveReconnectTarget() contract. `token` must resolve to `resolvesTo`;
 * the optional `unknownToken` (gone/unknown id) and `wrongTransportToken` must
 * resolve to null; `resolve(null)` is checked unless `expectNullToken` is false.
 */
export function expectResolveContract(
    instance,
    { token, resolvesTo, unknownToken, wrongTransportToken, expectNullToken = true },
) {
    expect(instance.resolveReconnectTarget(token)).toBe(resolvesTo);
    if (unknownToken !== undefined) {
        expect(instance.resolveReconnectTarget(unknownToken)).toBeNull();
    }
    if (wrongTransportToken !== undefined) {
        expect(instance.resolveReconnectTarget(wrongTransportToken)).toBeNull();
    }
    if (expectNullToken) {
        expect(instance.resolveReconnectTarget(null)).toBeNull();
    }
}
