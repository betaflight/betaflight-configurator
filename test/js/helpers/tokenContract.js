import { expect } from "vitest";

// ---------------------------------------------------------------------------
// Per-transport token-SHAPE assertions.
//
// Each transport must populate getReconnectToken() from its own live connect
// state (transportType/opaqueId/baud), and that wiring is transport-specific, so
// these helpers collapse only the repeated expect() bodies — the SETUP (mocked
// SerialPort vs navigator.bluetooth vs @tauri-apps invoke/listen vs Capacitor
// plugins vs a stubbed global WebSocket) stays in each test.
//
// The resolveReconnectTarget() contract is shared logic (reconnect_token.js) and
// is tested once in reconnect_token.test.js — not re-proven per transport.
// ---------------------------------------------------------------------------

/** A not-connected transport yields a null token. */
export function expectNullTokenWhenDisconnected(instance) {
    expect(instance.getReconnectToken()).toBeNull();
}

/** A connected transport freezes exactly `expectedToken`. */
export function expectTokenShape(instance, expectedToken) {
    expect(instance.getReconnectToken()).toEqual(expectedToken);
}
