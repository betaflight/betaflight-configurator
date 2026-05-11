/**
 * NOTAM adapter for the FAA External NOTAM API.
 *
 * Coverage:  USA
 * Auth:      API key required (free registration at https://api.faa.gov)
 *            Enter your key as "client_id:client_secret" in the settings.
 * CORS:      Not verified for PWA/web builds — works in Tauri and Capacitor (native fetch).
 *            If CORS is blocked in the browser, a network error is thrown.
 * Endpoint:  https://external-api.faa.gov/notamapi/v1/notams
 * Docs:      https://api.faa.gov/
 */

import { classifyFromQcode, parseNotamDate } from "./index.js";

const BASE_URL = "https://external-api.faa.gov/notamapi/v1/notams";

/**
 * Extract a NotamItem from the FAA API's nested properties structure.
 * @param {object} properties
 * @returns {object} NotamItem
 */
export function extractNotam(properties) {
    const core = properties?.coreNOTAMData?.notam ?? {};
    const translations = properties?.coreNOTAMData?.notamTranslation ?? [];

    const icaoText = translations.find((t) => t.type === "ICAO")?.simpleText ?? "";
    const localText = translations.find((t) => t.type === "LOCAL_FORMAT")?.simpleText ?? "";
    const body = icaoText || localText || core.text || core.icaoMessage || "";

    const qcode = core.selectionCode ?? core.qCode ?? "";
    const type = classifyFromQcode(qcode);

    const endRaw = core.effectiveEnd ?? null;
    const isPermanent = endRaw !== null && /PERM/i.test(String(endRaw));

    return {
        id: String(core.number ?? core.id ?? "Unknown").trim(),
        type,
        location: String(core.location ?? core.affectedFIR ?? "").trim(),
        startTime: parseNotamDate(core.effectiveStart ?? null),
        endTime: isPermanent ? null : parseNotamDate(endRaw),
        isPermanent,
        lowerAlt: core.minimumFL != null ? String(core.minimumFL) : null,
        upperAlt: core.maximumFL != null ? String(core.maximumFL) : null,
        body: String(body).trim(),
        rawText: icaoText || null,
        source: "faa",
    };
}

/**
 * Fetch NOTAMs from the FAA External NOTAM API.
 * @param {number} lat
 * @param {number} lon
 * @param {number} radiusNm  search radius in nautical miles
 * @param {string} apiKey    in format "client_id:client_secret"
 * @returns {Promise<object[]>} array of NotamItem
 */
export async function fetchFromFaa(lat, lon, radiusNm, apiKey) {
    if (typeof apiKey !== "string" || !apiKey.trim()) {
        throw new Error("FAA API key must be in format client_id:client_secret");
    }
    const sep = apiKey.indexOf(":");
    if (sep <= 0 || sep === apiKey.length - 1) {
        throw new Error("FAA API key must be in format client_id:client_secret");
    }
    const clientId = apiKey.slice(0, sep).trim();
    const clientSecret = apiKey.slice(sep + 1).trim();
    if (!clientId || !clientSecret) {
        throw new Error("FAA API key must be in format client_id:client_secret");
    }

    const params = new URLSearchParams({
        latitudeDeg: lat.toFixed(4),
        longitudeDeg: lon.toFixed(4),
        radius: Math.max(1, Math.round(radiusNm)),
        pageNum: 1,
        pageSize: 100,
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);
    let response;
    try {
        response = await fetch(`${BASE_URL}?${params}`, {
            signal: controller.signal,
            headers: {
                client_id: clientId,
                client_secret: clientSecret,
            },
        });
    } catch (err) {
        if (err.name === "AbortError") {
            throw new Error("FAA NOTAM API request timed out");
        }
        if (err instanceof TypeError) {
            throw new Error(
                "FAA NOTAM API request failed (network error or CORS block). Check connectivity, or use Tauri desktop or Android.",
            );
        }
        throw err;
    } finally {
        clearTimeout(timeoutId);
    }
    if (!response.ok) {
        throw new Error(`FAA NOTAM API error: ${response.status}`);
    }
    const data = await response.json();
    const items = data?.items ?? [];
    return items.map((item) => extractNotam(item?.properties ?? {}));
}
