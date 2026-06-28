/**
 * Normalized transport ("link") event contract.
 *
 * Every transport historically dispatches its own ad-hoc event names
 * (`connect`/`disconnect`/`receive`/`addedDevice`/`removedDevice`) and the FSM /
 * connection layer then has to branch on `protocolType` to interpret them. The
 * LinkEvent contract is the single normalized vocabulary every transport maps
 * onto, so the connection owner can subscribe once and never branch per
 * transport:
 *
 *   - OPEN          a link to a device became usable (transport-level connect)
 *   - CLOSED        the link was closed on purpose (user/intentional disconnect)
 *   - LOST          the link dropped unexpectedly (cable pulled, device reboot)
 *   - DATA          bytes arrived from the device
 *   - DEVICE_ARRIVED a device appeared in the system device list
 *   - DEVICE_LEFT   a device disappeared from the system device list
 *
 * CLOSED vs LOST is the distinction the reconnect orchestrator needs: a LOST
 * link is a reconnect candidate; a CLOSED link is not. Legacy `disconnect`
 * collapses both, which is why the orchestration code could never tell a user
 * Disconnect from a device reboot without side-channels.
 *
 * Transports opt in by setting `supportsLinkEvents = true` and emitting these
 * names alongside (not instead of) the legacy ones — `serial.js` forwards both
 * so existing listeners keep working until the legacy names are removed (S9).
 */
export const LinkEvent = Object.freeze({
    OPEN: "open",
    CLOSED: "closed",
    LOST: "lost",
    DATA: "data",
    DEVICE_ARRIVED: "deviceArrived",
    DEVICE_LEFT: "deviceLeft",
});

/** All LinkEvent names, for iteration (e.g. event forwarding). */
export const LINK_EVENTS = Object.freeze(Object.values(LinkEvent));
