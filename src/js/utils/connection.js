import { get as getConfig } from "../ConfigStorage";

export function ispConnected() {
    const connected = navigator.onLine;
    const isMetered = getConfig('meteredConnection').meteredConnection;

    if (!navigator.connection) {
        return connected && !isMetered;
    }

    if (isMetered || navigator.connection.effectiveType === 'none' || !connected) {
        return false;
    }

    return true;
}

