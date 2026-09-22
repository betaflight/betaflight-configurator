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

import { get as getConfig } from "../ConfigStorage";

/**
 * Whether the app may reach the internet for optional work — build server queries, preset
 * downloads, sponsor tiles, IP geolocation.
 *
 * Two independent conditions: the browser has to report itself online, and the user must not have
 * ticked "Disable internet access (for metered or slow connections)". The preference is a plain
 * opt-out stored under `meteredConnection`; nothing queries the Network Information API, so an
 * unset preference reads as absent and therefore as unmetered.
 */
export function ispConnected(): boolean {
    const connected = navigator.onLine;
    const isMetered = getConfig("meteredConnection").meteredConnection;

    return connected && !isMetered;
}
