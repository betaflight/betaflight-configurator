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
    const logHead = '[ISP] ';

    CONFIGURATOR.networkSpeed = downlink;

    if (isMetered) {
        console.log(`${logHead}Metered connection is enabled`);
        return false;
    }

    if (type === 'slow-2g' || type === '2g' || downlink < 0.115 || rtt > 1000) {
        console.log(`${logHead}Slow network detected`);
        return false;
    }

    if (connected) {
        return true;
    }
}

