import { get as getConfig } from "../ConfigStorage";
import CONFIGURATOR from "../data_storage";

export function ispConnected() {
    const connected = navigator.onLine;
    const isMetered = getConfig('meteredConnection').meteredConnection;

    // navigator.connection is not available
    if (!navigator.connection) {
        return connected && !isMetered;
    }

    // navigator.connection is available
    const type = navigator.connection.effectiveType;
    const downlink = navigator.connection.downlink;
    const rtt = navigator.connection.rtt;

    if (isMetered || type === 'none' || !connected) {
        CONFIGURATOR.networkStatus = 'Offline';
        return false;
    } else if (type === 'slow-2g' || type === '2g' || downlink < 0.115 || rtt > 1000) {
        CONFIGURATOR.networkStatus = 'Slow';
        return true;
    }

    CONFIGURATOR.networkStatus = 'Online';
    return true;
}

