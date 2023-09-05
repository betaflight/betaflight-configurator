import semver from "semver";
import FC from "../fc";
import { API_VERSION_1_45 } from "../data_storage";

function zeroPad(value, width) {
    let valuePadded = String(value);

    while (valuePadded.length < width) {
        valuePadded = `0${value}`;
    }

    return valuePadded;
}

export function generateFilename(prefix, suffix) {
    const date = new Date();
    const yyyymmdd = `${date.getFullYear()}${zeroPad(date.getMonth() + 1, 2)}${zeroPad(date.getDate(), 2)}`;
    const hhmmss = `${zeroPad(date.getHours(), 2)}${zeroPad(date.getMinutes(), 2)}${zeroPad(date.getSeconds(), 2)}`;

    let filename = `${FC.CONFIG.flightControllerIdentifier || 'UNKNOWN'}_${prefix}_${yyyymmdd}_${hhmmss}`;

    if (FC.CONFIG) {
        const craftName = semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45) ? FC.CONFIG.craftName : FC.CONFIG.name;
        const boardName = FC.CONFIG.boardName || craftName.trim().replace(" ", "_");

        filename = `${filename}_${boardName}`;
    }

    return `${filename}.${suffix}`;
}
