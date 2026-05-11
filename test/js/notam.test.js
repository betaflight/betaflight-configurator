import { describe, expect, it } from "vitest";
import {
    classifyFromQcode,
    getNotamStatus,
    sortNotams,
    parseNotamDate,
    nmToKm,
    kmToNm,
} from "../../src/js/notam/index.js";
import { extractNotam } from "../../src/js/notam/faa.js";
import { normalise as normaliseOpenAip, formatAlt } from "../../src/js/notam/openaip.js";

describe("classifyFromQcode", () => {
    it("returns NOTAM for null or empty", () => {
        expect(classifyFromQcode(null)).toBe("NOTAM");
        expect(classifyFromQcode("")).toBe("NOTAM");
        expect(classifyFromQcode(undefined)).toBe("NOTAM");
    });

    it("classifies TFR Q-codes", () => {
        expect(classifyFromQcode("QRTCA")).toBe("TFR");
        expect(classifyFromQcode("QRTCL")).toBe("TFR");
        expect(classifyFromQcode("QRTCS")).toBe("TFR");
        expect(classifyFromQcode("KZLA/QRTCA/IV/NBO/A/000/999")).toBe("TFR");
    });

    it("classifies SUA Q-codes", () => {
        expect(classifyFromQcode("QRSAS")).toBe("SUA");
        expect(classifyFromQcode("QRSSA")).toBe("SUA");
    });

    it("classifies SNOWTAM", () => {
        expect(classifyFromQcode("QSNTW")).toBe("SNOWTAM");
        expect(classifyFromQcode("SNOWTAM")).toBe("SNOWTAM");
    });

    it("classifies ASHTAM", () => {
        expect(classifyFromQcode("QASHTW")).toBe("ASHTAM");
        expect(classifyFromQcode("ASHTAM")).toBe("ASHTAM");
    });

    it("returns NOTAM for unrecognised codes", () => {
        expect(classifyFromQcode("QMXLC")).toBe("NOTAM");
        expect(classifyFromQcode("QOBCE")).toBe("NOTAM");
    });
});

describe("parseNotamDate", () => {
    it("returns null for null or empty", () => {
        expect(parseNotamDate(null)).toBeNull();
        expect(parseNotamDate("")).toBeNull();
        expect(parseNotamDate(undefined)).toBeNull();
    });

    it("returns null for PERM", () => {
        expect(parseNotamDate("PERM")).toBeNull();
        expect(parseNotamDate("perm")).toBeNull();
    });

    it("parses ICAO YYMMDDHHMM format", () => {
        const d = parseNotamDate("2403151300");
        expect(d).toBeInstanceOf(Date);
        expect(d.getUTCFullYear()).toBe(2024);
        expect(d.getUTCMonth()).toBe(2); // March = 2 (zero-indexed)
        expect(d.getUTCDate()).toBe(15);
        expect(d.getUTCHours()).toBe(13);
        expect(d.getUTCMinutes()).toBe(0);
    });

    it("parses ISO 8601 format", () => {
        const d = parseNotamDate("2024-06-01T12:00:00Z");
        expect(d).toBeInstanceOf(Date);
        expect(d.getUTCFullYear()).toBe(2024);
        expect(d.getUTCMonth()).toBe(5); // June
        expect(d.getUTCDate()).toBe(1);
    });

    it("returns null for unparseable strings", () => {
        expect(parseNotamDate("not-a-date")).toBeNull();
    });
});

describe("getNotamStatus", () => {
    const past = new Date(Date.now() - 3_600_000);
    const future = new Date(Date.now() + 3_600_000);
    const farFuture = new Date(Date.now() + 7_200_000);

    it("returns active when now is between start and end", () => {
        expect(getNotamStatus({ startTime: past, endTime: future, isPermanent: false })).toBe("active");
    });

    it("returns future when start is in the future", () => {
        expect(getNotamStatus({ startTime: future, endTime: farFuture, isPermanent: false })).toBe("future");
    });

    it("returns expired when end is in the past", () => {
        const olderPast = new Date(Date.now() - 7_200_000);
        expect(getNotamStatus({ startTime: olderPast, endTime: past, isPermanent: false })).toBe("expired");
    });

    it("returns active for permanent NOTAMs with past start", () => {
        expect(getNotamStatus({ startTime: past, endTime: null, isPermanent: true })).toBe("active");
    });

    it("returns future for permanent NOTAMs with future start", () => {
        expect(getNotamStatus({ startTime: future, endTime: null, isPermanent: true })).toBe("future");
    });

    it("returns active when endTime is null and startTime is null", () => {
        expect(getNotamStatus({ startTime: null, endTime: null, isPermanent: false })).toBe("active");
    });
});

describe("sortNotams", () => {
    const past = new Date(Date.now() - 3_600_000);
    const future = new Date(Date.now() + 3_600_000);
    const farFuture = new Date(Date.now() + 7_200_000);
    const farPast = new Date(Date.now() - 7_200_000);

    const active = { id: "A", startTime: past, endTime: future, isPermanent: false };
    const futureItem = { id: "B", startTime: future, endTime: farFuture, isPermanent: false };
    const expired = { id: "C", startTime: farPast, endTime: past, isPermanent: false };

    it("orders active before future before expired", () => {
        const sorted = sortNotams([expired, futureItem, active]);
        expect(sorted[0].id).toBe("A");
        expect(sorted[1].id).toBe("B");
        expect(sorted[2].id).toBe("C");
    });

    it("does not mutate the original array", () => {
        const items = [expired, futureItem, active];
        sortNotams(items);
        expect(items[0].id).toBe("C");
    });
});

describe("unit conversions", () => {
    it("nmToKm converts correctly", () => {
        expect(nmToKm(1)).toBeCloseTo(1.852, 3);
        expect(nmToKm(25)).toBeCloseTo(46.3, 1);
    });

    it("kmToNm converts correctly", () => {
        expect(kmToNm(1.852)).toBeCloseTo(1, 3);
        expect(kmToNm(46.3)).toBeCloseTo(25, 1);
    });

    it("round-trips correctly", () => {
        expect(kmToNm(nmToKm(25))).toBeCloseTo(25, 5);
    });
});

describe("FAA extractNotam", () => {
    it("maps standard FAA response structure", () => {
        const props = {
            coreNOTAMData: {
                notam: {
                    number: "1/2345",
                    location: "KLAX",
                    selectionCode: "QOBCE",
                    effectiveStart: "2403151300",
                    effectiveEnd: "2404151300",
                    minimumFL: 0,
                    maximumFL: 50,
                },
                notamTranslation: [{ type: "ICAO", simpleText: "NOTAM body text" }],
            },
        };
        const item = extractNotam(props);
        expect(item.id).toBe("1/2345");
        expect(item.location).toBe("KLAX");
        expect(item.type).toBe("NOTAM");
        expect(item.body).toBe("NOTAM body text");
        expect(item.startTime).toBeInstanceOf(Date);
        expect(item.endTime).toBeInstanceOf(Date);
        expect(item.lowerAlt).toBe("0");
        expect(item.upperAlt).toBe("50");
        expect(item.rawText).toBe("NOTAM body text");
        expect(item.source).toBe("faa");
    });

    it("handles missing translations by falling back to core.text", () => {
        const props = {
            coreNOTAMData: {
                notam: { number: "2/0001", text: "core text fallback" },
                notamTranslation: [],
            },
        };
        expect(extractNotam(props).body).toBe("core text fallback");
    });

    it("handles PERM end date", () => {
        const props = {
            coreNOTAMData: {
                notam: { number: "3/0001", effectiveEnd: "PERM" },
                notamTranslation: [],
            },
        };
        const item = extractNotam(props);
        expect(item.isPermanent).toBe(true);
        expect(item.endTime).toBeNull();
    });

    it("handles null/missing properties gracefully", () => {
        const item = extractNotam({});
        expect(item.id).toBe("Unknown");
        expect(item.source).toBe("faa");
    });

    it("classifies TFR from selectionCode", () => {
        const props = {
            coreNOTAMData: {
                notam: { number: "T/001", selectionCode: "QRTCA" },
                notamTranslation: [],
            },
        };
        expect(extractNotam(props).type).toBe("TFR");
    });
});

describe("OpenAIP formatAlt", () => {
    it("formats flight level", () => {
        expect(formatAlt({ value: 100, unit: 6 })).toBe("FL100");
    });

    it("formats surface", () => {
        expect(formatAlt({ value: 0, unit: 1, referenceDatum: 2 })).toBe("SFC");
    });

    it("formats feet MSL", () => {
        expect(formatAlt({ value: 3000, unit: 1, referenceDatum: 1 })).toBe("3000ft MSL");
    });

    it("formats feet AGL", () => {
        expect(formatAlt({ value: 500, unit: 1, referenceDatum: 2 })).toBe("500ft AGL");
    });

    it("returns null for null input", () => {
        expect(formatAlt(null)).toBeNull();
    });
});

describe("OpenAIP normalise", () => {
    it("maps a restricted airspace feature to a NotamItem", () => {
        const raw = {
            _id: "abc123",
            type: 2,
            name: "Restricted Area R-99",
            country: "US",
            lowerLimit: { value: 0, unit: 1, referenceDatum: 2 },
            upperLimit: { value: 3000, unit: 1, referenceDatum: 1 },
        };
        const item = normaliseOpenAip(raw);
        expect(item.id).toBe("abc123");
        expect(item.type).toBe("SUA");
        expect(item.location).toBe("US — Restricted Area R-99");
        expect(item.isPermanent).toBe(true);
        expect(item.lowerAlt).toBe("SFC");
        expect(item.upperAlt).toBe("3000ft MSL");
        expect(item.source).toBe("openaip");
    });

    it("uses name as id when _id is absent", () => {
        const raw = { type: 3, name: "Danger Area D-7" };
        const item = normaliseOpenAip(raw);
        expect(item.id).toBe("Danger Area D-7");
    });

    it("returns null start and end times (permanent airspace)", () => {
        const item = normaliseOpenAip({ type: 4, name: "P-1" });
        expect(item.startTime).toBeNull();
        expect(item.endTime).toBeNull();
    });
});
