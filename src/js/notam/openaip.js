/**
 * Airspace adapter for OpenAIP.
 *
 * Coverage:  Global airspace data (CTRs, SUAs, restricted areas, etc.)
 * Auth:      API key required (free tier at https://www.openaip.net/)
 * CORS:      Not verified for PWA/web builds — works in Tauri and Capacitor (native fetch).
 *            If CORS is blocked in the browser, a network error is thrown.
 * Endpoint:  https://api.core.openaip.net/api/airspaces
 * Docs:      https://docs.openaip.net/
 *
 * OpenAIP returns permanent/semi-permanent airspace features (SUAs, restricted areas).
 * These are mapped to NotamItem objects with type "SUA".
 */

import { nmToKm } from "./index.js";

const BASE_URL = "https://api.core.openaip.net/api/airspaces";

// OpenAIP airspace type codes that correspond to SUAs / restricted areas.
// https://docs.openaip.net/#tag/Airspaces/operation/getAirspace
const SUA_TYPES = new Set([
    2, // Restricted
    3, // Danger
    4, // Prohibited
    5, // CTR
    10, // TMA
    14, // MOA (Military Operations Area)
    28, // Warning
]);

const TYPE_LABELS = {
    2: "Restricted",
    3: "Danger",
    4: "Prohibited",
    5: "CTR",
    10: "TMA",
    14: "MOA",
    28: "Warning",
};

/**
 * Format an OpenAIP altitude object into a readable string.
 * @param {object | null} alt
 * @returns {string | null}
 */
export function formatAlt(alt) {
    if (!alt) return null;
    const unit = alt.unit === 6 ? "FL" : alt.unit === 1 ? "ft" : alt.unit === 2 ? "m" : "";
    const ref = alt.referenceDatum === 1 ? " MSL" : alt.referenceDatum === 2 ? " AGL" : "";
    if (unit === "FL") return `FL${alt.value}`;
    if (alt.value === 0 && alt.referenceDatum === 2) return "SFC";
    return `${alt.value}${unit}${ref}`;
}

/**
 * Normalise a single OpenAIP airspace feature into a NotamItem.
 * @param {object} raw
 * @returns {object} NotamItem
 */
export function normalise(raw) {
    const typeLabel = TYPE_LABELS[raw.type] ?? "Airspace";
    const name = raw.name ?? "Unknown";
    const country = raw.country ?? "";
    const id = raw._id ?? raw.id ?? name;

    return {
        id: String(id).slice(0, 20),
        type: "SUA",
        location: country ? `${country} — ${name}` : name,
        startTime: null,
        endTime: null,
        isPermanent: true,
        lowerAlt: formatAlt(raw.lowerLimit),
        upperAlt: formatAlt(raw.upperLimit),
        body: `${typeLabel}: ${name}`,
        rawText: null,
        source: "openaip",
    };
}

/**
 * Fetch airspace data from OpenAIP for a given location.
 * @param {number} lat
 * @param {number} lon
 * @param {number} radiusNm  search radius in nautical miles (converted to km for API)
 * @param {string} apiKey
 * @returns {Promise<object[]>} array of NotamItem
 */
export async function fetchFromOpenAip(lat, lon, radiusNm, apiKey) {
    if (!apiKey || !apiKey.trim()) {
        throw new Error("OpenAIP API key is required");
    }

    const radiusKm = nmToKm(radiusNm);

    // OpenAIP accepts a geometry parameter as GeoJSON or simple lat/lon + distance.
    // We use the pos (lat,lon) + dist (km) query pattern.
    const params = new URLSearchParams({
        pos: `${lat.toFixed(4)},${lon.toFixed(4)}`,
        dist: Math.max(1, Math.round(radiusKm)),
        limit: 100,
    });

    let response;
    try {
        response = await fetch(`${BASE_URL}?${params}`, {
            headers: {
                "x-openaip-api-key": apiKey.trim(),
            },
        });
    } catch (err) {
        if (err instanceof TypeError) {
            throw new Error("OpenAIP API is not available in browser/PWA builds (CORS). Use Tauri desktop or Android.");
        }
        throw err;
    }
    if (!response.ok) {
        throw new Error(`OpenAIP API error: ${response.status}`);
    }
    const data = await response.json();
    const items = data?.items ?? (Array.isArray(data) ? data : []);

    return items.filter((item) => SUA_TYPES.has(item.type)).map(normalise);
}
