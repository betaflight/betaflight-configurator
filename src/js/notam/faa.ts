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

import { classifyFromQcode, parseNotamDate, type NotamItem } from "./index";

const BASE_URL = "https://external-api.faa.gov/notamapi/v1/notams";

/** The fields read from a feature's `coreNOTAMData.notam`; all optional in the API. */
interface FaaCoreNotam {
    number?: string | number;
    id?: string | number;
    location?: string;
    affectedFIR?: string;
    text?: string;
    icaoMessage?: string;
    selectionCode?: string;
    qCode?: string;
    effectiveStart?: string | null;
    effectiveEnd?: string | null;
    minimumFL?: string | number | null;
    maximumFL?: string | number | null;
}

export interface FaaNotamProperties {
    coreNOTAMData?: {
        notam?: FaaCoreNotam;
        notamTranslation?: { type?: string; simpleText?: string }[];
    };
}

/**
 * Extract a NotamItem from the FAA API's nested properties structure.
 */
export function extractNotam(properties: FaaNotamProperties | null | undefined): NotamItem {
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
 * @param radiusNm  search radius in nautical miles
 * @param apiKey    in format "client_id:client_secret"
 */
export async function fetchFromFaa(lat: number, lon: number, radiusNm: number, apiKey: unknown): Promise<NotamItem[]> {
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
        radius: String(Math.max(1, Math.round(radiusNm))),
        pageNum: "1",
        pageSize: "100",
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
        if (err instanceof Error && err.name === "AbortError") {
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
    const items: ({ properties?: FaaNotamProperties } | null)[] = data?.items ?? [];
    return items.map((item) => extractNotam(item?.properties ?? {}));
}
