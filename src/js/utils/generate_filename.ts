/*
 * This file is part of Betaflight.
 *
 * Betaflight is free software. You can redistribute this software
 * and/or modify this software under the terms of the GNU General
 * Public License as published by the Free Software Foundation,
 * either version 3 of the License, or (at your option) any later
 * version.
 *
 * Betaflight is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this software.
 *
 * If not, see <http://www.gnu.org/licenses/>.
 */

import semver from "semver";
import { API_VERSION_1_45 } from "../data_storage";
import { useFlightControllerStore } from "../../stores/fc";

function zeroPad(value: number, width: number): string {
    return String(value).padStart(width, "0");
}

export function generateFilename(prefix: string, suffix: string): string {
    const fcStore = useFlightControllerStore();
    const date = new Date();
    const yyyymmdd = `${date.getFullYear()}${zeroPad(date.getMonth() + 1, 2)}${zeroPad(date.getDate(), 2)}`;
    const hhmmss = `${zeroPad(date.getHours(), 2)}${zeroPad(date.getMinutes(), 2)}${zeroPad(date.getSeconds(), 2)}`;
    const craftName = semver.gte(fcStore.config.apiVersion, API_VERSION_1_45)
        ? fcStore.config.craftName
        : fcStore.config.name;
    let filename = `${fcStore.config.flightControllerIdentifier || "UNKNOWN"}_${prefix}`;

    if (craftName.length) {
        filename += `_${craftName.trim().replaceAll(/\s+/g, "_").toUpperCase()}`;
    }

    filename += `_${yyyymmdd}_${hhmmss}`;

    if (fcStore.config.boardName) {
        filename += `_${fcStore.config.boardName}`;
    }

    return `${filename}.${suffix}`;
}
