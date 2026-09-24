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

    // Only a checkbox has ever written this preference, so a non-boolean means corrupt storage.
    // It is read for truthiness rather than `=== true`, which resolves a corrupt value towards
    // honouring the opt-out: spending data the user asked not to spend is the worse failure, and
    // an unexpected offline state is visible and recoverable by toggling the switch.
    it.each([
        ["a truthy string", "false"],
        ["a truthy number", 1],
        ["a non-empty object", { on: true }],
    ])("treats %s as metered rather than ignoring the opt-out", (_label, raw) => {
        setOnline(true);
        storeMetered(raw);

        expect(ispConnected()).toBe(false);
    });

    it.each([
        ["an explicit false", false],
        ["a zero", 0],
        ["an empty string", ""],
    ])("treats %s as unmetered", (_label, raw) => {
        setOnline(true);
        storeMetered(raw);

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
