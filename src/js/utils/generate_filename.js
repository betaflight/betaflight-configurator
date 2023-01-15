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
    let filename = prefix;

    if (FC.CONFIG) {
        if (FC.CONFIG.flightControllerIdentifier) {
            filename = `${FC.CONFIG.flightControllerIdentifier}_${filename}`;
        }
        const craftName = semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)
            ? FC.CONFIG.craftName
            : FC.CONFIG.name;
        if (craftName.trim() !== "") {
            filename = `${filename}_${craftName.trim().replace(" ", "_")}`;
        }
    }

    const yyyymmdd = `${date.getFullYear()}${zeroPad(
        date.getMonth() + 1,
        2,
    )}${zeroPad(date.getDate(), 2)}`;
    const hhmmss = `${zeroPad(date.getHours(), 2)}${zeroPad(
        date.getMinutes(),
        2,
    )}${zeroPad(date.getSeconds(), 2)}`;
    filename = `${filename}_${yyyymmdd}_${hhmmss}`;

    return `${filename}.${suffix}`;
}
