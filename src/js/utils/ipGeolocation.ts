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

import { get as getConfig, set as setConfig } from "../ConfigStorage";
import { i18n } from "../localization";
import { ispConnected } from "./connection";

export const IP_GEOLOCATION_CONSENT_KEY = "preflight_ip_geolocation_consent";
const IP_GEOLOCATION_URL = "https://ipapi.co/json/";
const IP_GEOLOCATION_TIMEOUT_MS = 10000;

/** Consent is opt-in, so only a stored literal `true` counts; anything else reads as no. */
export function hasIpGeolocationConsent(): boolean {
    return getConfig(IP_GEOLOCATION_CONSENT_KEY)[IP_GEOLOCATION_CONSENT_KEY] === true;
}

export interface IpCoordinates {
    lat: number;
    lon: number;
}

/**
 * Approximate coordinates from the device's IP address via a third-party service, or null.
 * Nothing is sent without the user's consent: when none is stored, `promptConsent` decides
 * whether to ask, and a yes is remembered. Honours the metered/offline preference.
 */
export async function ipCoordinates(promptConsent: boolean): Promise<IpCoordinates | null> {
    if (!ispConnected()) {
        return null;
    }
    if (!hasIpGeolocationConsent()) {
        if (!promptConsent) {
            return null;
        }
        const allowed = confirm(i18n.getMessage("preflightIpConsentMessage"));
        if (!allowed) {
            return null;
        }
        setConfig({ [IP_GEOLOCATION_CONSENT_KEY]: true });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), IP_GEOLOCATION_TIMEOUT_MS);
    try {
        const response = await fetch(IP_GEOLOCATION_URL, { signal: controller.signal });
        if (!response.ok) {
            return null;
        }
        const data = await response.json();
        const lat = Number.parseFloat(data.latitude);
        const lon = Number.parseFloat(data.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
            return null;
        }
        return { lat, lon };
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}
