import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ispConnected } from "../../../src/js/utils/connection";

// The preference is read straight out of localStorage rather than through ConfigStorage.set(),
// so a change to either side of the record-wrapping contract fails here instead of cancelling out.
const storeMetered = (value: unknown) =>
    localStorage.setItem("meteredConnection", JSON.stringify({ meteredConnection: value }));

const setOnline = (value: boolean) => vi.spyOn(navigator, "onLine", "get").mockReturnValue(value);

beforeEach(() => {
    localStorage.clear();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("ispConnected", () => {
    it("is true when the browser is online and the preference was never set", () => {
        setOnline(true);

        expect(ispConnected()).toBe(true);
    });

    it("is false when the browser is offline", () => {
        setOnline(false);

        expect(ispConnected()).toBe(false);
    });

    it("is false when the user has disabled internet access", () => {
        setOnline(true);
        storeMetered(true);

        expect(ispConnected()).toBe(false);
    });

    it("is false when offline even with internet access enabled", () => {
        setOnline(false);
        storeMetered(false);

        expect(ispConnected()).toBe(false);
    });

    it("is true when the preference is stored as false", () => {
        setOnline(true);
        storeMetered(false);

        expect(ispConnected()).toBe(true);
    });

    // A malformed record is treated as absent by ConfigStorage, which leaves the read `undefined`
    // rather than throwing — the app stays usable instead of losing internet access on bad data.
    it.each([
        ["a bare value rather than a record", '"true"'],
        ["unparseable text", "{not json"],
    ])("falls back to unmetered on %s", (_label, raw) => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        setOnline(true);
        localStorage.setItem("meteredConnection", raw);

        expect(ispConnected()).toBe(true);
    });
});
