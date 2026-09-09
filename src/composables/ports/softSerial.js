import FC from "../../js/fc";
import { SOFT_SERIAL_IDENTIFIERS } from "./portNames";

/**
 * The board's soft serial ports the FC did not report.
 *
 * A soft serial port only reaches MSP once the SOFTSERIAL feature is enabled and
 * its pins are assigned, so a port list built from the FC's report alone cannot
 * offer one. The build still accepts an assignment naming it, which is what lets
 * a feature claim a soft serial port and only then have the feature turned on.
 *
 * @param {Array<{identifier: number}>} ports FC.SERIAL_CONFIG.ports
 * @returns {number[]} identifiers, empty when the build has no soft serial at all
 */
export function unreportedSoftSerialIdentifiers(ports) {
    if (!FC.boardHasSoftSerial()) {
        return [];
    }

    const reported = new Set((ports ?? []).map((port) => port.identifier));

    return SOFT_SERIAL_IDENTIFIERS.filter((identifier) => !reported.has(identifier));
}
