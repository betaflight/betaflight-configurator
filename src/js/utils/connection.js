import { get as getConfig } from "../ConfigStorage";
import CONFIGURATOR from "../data_storage";

export function ispConnected() {

    if (!navigator.connection) {
        return navigator.onLine;
    }

    // navigator.connection is available
    const isMetered = getConfig('meteredConnection').meteredConnection;
    const connected = navigator.onLine;
    const type = navigator.connection.effectiveType;
    const downlink = navigator.connection.downlink;
    const rtt = navigator.connection.rtt;

    if (type === 'none' || !connected) {
        CONFIGURATOR.networkStatus = 'Offline';
        return false;
    } else if (isMetered) {
        CONFIGURATOR.networkStatus = 'Metered';
        return false;
    } else if (type === 'slow-2g' || type === '2g' || downlink < 0.115 || rtt > 1000) {
        CONFIGURATOR.networkStatus = 'Slow';
        return false;
    }

    CONFIGURATOR.networkStatus = 'Online';
    return true;
}

