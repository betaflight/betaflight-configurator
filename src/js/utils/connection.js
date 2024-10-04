import { get as getConfig } from "../ConfigStorage";

export function ispConnected() {
    const connected = navigator.onLine;
    const isMetered = getConfig('meteredConnection').meteredConnection;

    return connected && !isMetered;
}

