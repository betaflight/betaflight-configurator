// A shared connect link — `?connect=wss://host:port` — opens a manual network connection on
// load, so an ELRS Wi-Fi module, a SITL endpoint or a bench setup can be reached from a
// bookmark, chat message or QR code without anyone typing the address by hand.

// Only network transports travel in a link: ws:// and wss:// (a browser WebSocket) and tcp://
// (raw TCP, honored by the desktop/Android shells). A serial device path such as COM3 or
// /dev/ttyUSB0 names hardware on one machine and means nothing on the recipient's, so it is
// never accepted from a link — and neither is anything else, which keeps javascript:/data:
// and other surprises out of a value that ends up driving a connection.
const ALLOWED_SCHEMES = new Set(["ws:", "wss:", "tcp:"]);

// A generous cap: a real target is a short "wss://host:port", so this only guards against a
// hand-crafted link stuffing an unbounded string into the connect field.
const MAX_LENGTH = 253;

/**
 * The manual connection target named by a `?connect=` query parameter, if it is one the app
 * may open. Untrusted input — whatever a link contained — so anything that is not an allowed
 * network target is rejected rather than passed on.
 * @param search - a URL query string, e.g. window.location.search ("?connect=wss://…").
 * @returns the target to connect to (e.g. "wss://192.168.4.1:5761"), or null.
 */
export function parseConnectDeeplink(search: string): string | null {
    let value: string | null;

    try {
        value = new URLSearchParams(search).get("connect");
    } catch {
        return null;
    }

    const target = (value ?? "").trim();

    if (!target || target.length > MAX_LENGTH) {
        return null;
    }

    try {
        const url = new URL(target);
        // A host is required: "wss://" alone, or a schemeless value, is not a connectable target.
        // A fragment is meaningless to a connection and is a favored place to smuggle extra data
        // past a scheme/host check, so a target carrying one is rejected outright.
        if (ALLOWED_SCHEMES.has(url.protocol) && url.hostname && !url.hash) {
            return target;
        }
    } catch {
        // Not a URL at all
    }

    return null;
}
