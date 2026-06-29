/**
 * Shared reconnect-token contract for the serial transports.
 *
 * A reconnect token is the frozen identity of the connected device, captured at
 * reboot time so the reconnect aims at the SAME physical device even if the port
 * list churns mid-reboot. Every transport produced near-identical
 * getReconnectToken()/resolveReconnectTarget() copies; these helpers collapse the
 * three recurring shapes:
 *
 *   - address-stable (TCP): the endpoint address survives a reboot unchanged;
 *   - path-lookup (USB/BLE serial): re-find the current device by its stable path;
 *   - trivial (virtual): nothing to re-enumerate.
 *
 * TauriSerial keeps a bespoke resolve because a CDC device re-enumerates to a new
 * OS path, so it matches on serial-number / VID:PID instead of the frozen path.
 *
 * @typedef {{transportType: string, opaqueId: *, baud: number, isVirtual: boolean}} ReconnectToken
 */

/**
 * Build a frozen reconnect token, or null when the transport is not connected.
 * @returns {ReconnectToken|null}
 */
export function makeReconnectToken({ connected, transportType, opaqueId, baud = 0, isVirtual = false }) {
    if (!connected || opaqueId == null) {
        return null;
    }
    return { transportType, opaqueId, baud, isVirtual };
}

/**
 * Resolve a token whose opaqueId IS a stable address (TCP endpoints, virtual).
 * @returns {*|null} the address, or null if the token is for another transport.
 */
export function resolveStableAddress(token, transportType) {
    if (!token || token.transportType !== transportType) {
        return null;
    }
    return token.opaqueId ?? null;
}

/**
 * Resolve a token by re-finding the current device whose `path` equals the frozen
 * opaqueId (USB/BLE serial, where path identity is stable across re-enumeration).
 * @returns {string|null} the current path, or null if the device is gone.
 */
export function resolveByPath(token, transportType, ports) {
    if (!token || token.transportType !== transportType) {
        return null;
    }
    const match = ports.find((device) => device.path === token.opaqueId);
    return match ? match.path : null;
}
