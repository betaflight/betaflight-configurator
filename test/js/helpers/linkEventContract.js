import { expect, vi } from "vitest";

// ---------------------------------------------------------------------------
// Shared LinkEvent + reconnect-token contract assertions.
//
// Every transport (WebSerial/WebBluetooth/Tauri*/Capacitor*/Websocket/Virtual)
// exposes the same surface: a `supportsLinkEvents` flag, getReconnectToken()
// (null when disconnected, a frozen identity when connected),
// resolveReconnectTarget() (re-derives the live target for a matching token,
// null for an unknown id / wrong transport / null token) and the CLOSED-vs-LOST
// event distinction.
//
// Per-transport SETUP and event-driving differ wildly (mocked SerialPort vs
// navigator.bluetooth vs @tauri-apps invoke/listen vs Capacitor plugins vs a
// stubbed global WebSocket), so these helpers deliberately do NOT own the setup.
// Each test builds + connects its own instance, then calls these to collapse the
// repeated expect() bodies. Coverage is preserved 1:1.
// ---------------------------------------------------------------------------

/** `supportsLinkEvents` must be exactly true. */
export function expectSupportsLinkEvents(instance) {
    expect(instance.supportsLinkEvents).toBe(true);
}

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

/** Run `act` (the intentional teardown) and assert ONLY `closed` fired. */
export async function expectClosedOnIntentionalDisconnect(instance, act) {
    const events = trackCloseEvents(instance);
    await act();
    expect(events).toEqual(["closed"]);
}

/** Run `act` (the external drop) and assert `lost` fired and `closed` did not. */
export async function expectLostOnUnsolicitedDrop(instance, act) {
    const events = trackCloseEvents(instance);
    await act();
    await vi.waitFor(() => expect(events).toContain("lost"));
    expect(events).not.toContain("closed");
}

function trackCloseEvents(instance) {
    const events = [];
    instance.addEventListener("closed", () => events.push("closed"));
    instance.addEventListener("lost", () => events.push("lost"));
    return events;
}
