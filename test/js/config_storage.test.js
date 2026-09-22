import { beforeEach, describe, expect, it, vi } from "vitest";

import { clear, get, remove, set } from "../../src/js/ConfigStorage";

// Reads are driven off raw localStorage rather than set(), so a change to either side of the
// wrapping contract fails here instead of cancelling out.
const store = (key, value) => localStorage.setItem(key, value);
const wrapped = (key, value) => store(key, JSON.stringify({ [key]: value }));

beforeEach(() => {
    localStorage.clear();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("get with a single key", () => {
    it("returns the stored record", () => {
        wrapped("rememberLastTab", true);

        expect(get("rememberLastTab")).toEqual({ rememberLastTab: true });
    });

    it("returns the default when nothing is stored", () => {
        expect(get("cliAutoComplete", false)).toEqual({ cliAutoComplete: false });
    });

    it("keeps a stored falsy value instead of the default", () => {
        wrapped("cliAutoComplete", false);

        expect(get("cliAutoComplete", true)).toEqual({ cliAutoComplete: false });
    });

    it("returns an empty object when nothing is stored and there is no default", () => {
        expect(get("neverWritten")).toEqual({});
    });

    it.each([
        ["null", "null"],
        ["an array", "[1, 2]"],
        ["a bare string", '"just text"'],
        ["a number", "42"],
        ["unparseable text", "{not json"],
    ])("treats %s as absent and applies the default", (_label, raw) => {
        store("expertMode", raw);

        expect(get("expertMode", true)).toEqual({ expertMode: true });
    });
});

describe("get with an array of keys", () => {
    it("merges the records into one object", () => {
        wrapped("expertMode", true);
        wrapped("permanentExpertMode", false);

        expect(get(["expertMode", "permanentExpertMode"])).toEqual({
            expertMode: true,
            permanentExpertMode: false,
        });
    });

    it("skips keys with nothing stored", () => {
        wrapped("expertMode", true);

        expect(get(["expertMode", "neverWritten"])).toEqual({ expertMode: true });
    });

    it("skips malformed and non-record entries, keeping the rest", () => {
        wrapped("expertMode", true);
        store("brokenKey", "{not json");
        store("nullKey", "null");

        expect(get(["expertMode", "brokenKey", "nullKey"])).toEqual({ expertMode: true });
    });

    it("never applies a default", () => {
        expect(get(["neverWritten"])).toEqual({});
    });
});

describe("set", () => {
    it("stores each key under its own record", () => {
        set({ expertMode: true, cliAutoComplete: false });

        expect(localStorage.getItem("expertMode")).toBe('{"expertMode":true}');
        expect(get(["expertMode", "cliAutoComplete"])).toEqual({ expertMode: true, cliAutoComplete: false });
    });

    it("overwrites a previous value", () => {
        set({ expertMode: true });
        set({ expertMode: false });

        expect(get("expertMode")).toEqual({ expertMode: false });
    });
});

describe("remove and clear", () => {
    it("removes a single key", () => {
        set({ expertMode: true, cliAutoComplete: true });
        remove("expertMode");

        expect(get(["expertMode", "cliAutoComplete"])).toEqual({ cliAutoComplete: true });
    });

    it("clears everything", () => {
        set({ expertMode: true, cliAutoComplete: true });
        clear();

        expect(get(["expertMode", "cliAutoComplete"])).toEqual({});
    });
});
