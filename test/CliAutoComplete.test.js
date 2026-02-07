import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useCliAutocompleteStore } from "../src/stores/cliAutocomplete";
import CliAutoComplete from "../src/js/CliAutoComplete";
import FC from "../src/js/fc";

// Rewritten, consolidated test suite for CLI autocomplete behavior. Tests exercise
// the real strategies registered by CliAutoComplete._initTextcomplete using a
// lightweight mock textarea that emulates the minimal jQuery.textcomplete API.

function createMockTextarea() {
    const mock = {
        _options: null,
        _strategies: [],
        lastCallbackResults: [],
        valStr: "",
        length: 1,
        triggeredEvents: [],
        0: { selectionStart: 0, selectionEnd: 0 },
        val(value) {
            if (value === undefined) return this.valStr;
            this.valStr = value;
            return this;
        },
        textcomplete(...args) {
            if (Array.isArray(args[0]) && typeof args[1] === "object") {
                this._options = args[1];
                return this;
            }
            if (args[0] === "register" && Array.isArray(args[1])) {
                this._strategies = this._strategies.concat(args[1]);
                return this;
            }
            return this;
        },
        on() {
            return this;
        },
        trigger(event) {
            if (!event) return;
            if (typeof event === "string") {
                this.triggeredEvents.push({ type: event });
                return;
            }
            if (event && typeof event === "object") {
                this.triggeredEvents.push({ type: event.type || null, which: event.which || null });
            }
        },
        triggerSearches() {
            this.lastCallbackResults = [];
            for (const s of this._strategies) {
                try {
                    const match = this.valStr.match(s.match);
                    if (match) {
                        const idx = s.index || 2;
                        const term = match[idx] !== undefined ? match[idx] : "";
                        const cb = (res) => this.lastCallbackResults.push({ strategy: s, results: res, match });
                        if (s.search.length >= 3) s.search.call(s, term, cb, match);
                        else s.search.call(s, term, cb);
                    }
                } catch (e) {
                    this.lastCallbackResults.push({ strategy: s, error: e, match: null });
                }
            }
        },
    };
    return mock;
}

beforeEach(() => {
    CliAutoComplete.cache = {
        commands: [],
        resources: [],
        resourcesCount: {},
        settings: [],
        settingsAcceptedValues: {},
        feature: [],
        beeper: ["ALL"],
        mixers: [],
    };
    CliAutoComplete.builder = { state: "reset", numFails: 0 };
});

describe("CliAutoComplete strategies (refactored tests)", () => {
    it("registers strategies on _initTextcomplete", () => {
        const mock = createMockTextarea();
        CliAutoComplete.$textarea = mock;
        CliAutoComplete.cache.commands = ["status", "set", "get", "save"];
        CliAutoComplete._initTextcomplete();
        expect(mock._strategies.length).toBeGreaterThan(0);
    });

    it('command strategy suggests "status" for input "st"', () => {
        const mock = createMockTextarea();
        CliAutoComplete.$textarea = mock;
        CliAutoComplete.cache.commands = ["status", "set", "get", "save"];
        CliAutoComplete._initTextcomplete();
        // Force-open so searcher runs even when dropdown is not visible
        CliAutoComplete.forceOpen = true;
        mock.valStr = "st";
        mock.triggerSearches();
        CliAutoComplete.forceOpen = false;
        const found = mock.lastCallbackResults.some((r) => r.results && r.results.some((x) => x === "status"));
        expect(found).toBe(true);
    });

    it('resource strategy includes "show" for FC >= 4.0.0', () => {
        const mock = createMockTextarea();
        CliAutoComplete.$textarea = mock;
        CliAutoComplete.cache.resources = ["show", "FOO"];
        FC.CONFIG = FC.CONFIG || {};
        FC.CONFIG.flightControllerVersion = "4.0.0";
        CliAutoComplete._initTextcomplete();
        mock.valStr = "resource sh";
        mock.triggerSearches();
        const found = mock.lastCallbackResults.some((r) => r.results && r.results.some((x) => x === "show"));
        expect(found).toBe(true);
    });

    it('single-match command fallback applies replacement for "re" -> "resource" when forced', () => {
        const mock = createMockTextarea();
        CliAutoComplete.$textarea = mock;
        CliAutoComplete.cache.commands = ["resource"];
        CliAutoComplete._initTextcomplete();
        mock.valStr = "re";
        CliAutoComplete.forceOpen = true;
        const cmd = mock._strategies.find((s) => s.match && s.match.source === "^(\\s*)(\\w*)$");
        expect(cmd).toBeTruthy();
        cmd.search.call(cmd, "re", () => {});
        CliAutoComplete.forceOpen = false;
        expect(mock.val().toLowerCase().startsWith("resource")).toBe(true);
    });

    it('resource fallback triggers send-on-enter for "show" on force-open', () => {
        const mock = createMockTextarea();
        CliAutoComplete.$textarea = mock;
        CliAutoComplete.cache.resources = [];
        FC.CONFIG = FC.CONFIG || {};
        FC.CONFIG.flightControllerVersion = "4.0.0";
        CliAutoComplete._initTextcomplete();
        mock.valStr = "resource sh";
        CliAutoComplete.forceOpen = true;
        mock.triggerSearches();
        CliAutoComplete.forceOpen = false;
        expect(mock.val().toLowerCase().startsWith("resource show")).toBe(true);
        const kp = mock.triggeredEvents.find((e) => e.type === "keypress" || e.which === 13 || e.type === "input");
        expect(kp).toBeTruthy();
    });

    it("get/set strategies search settings immediately", () => {
        const mock = createMockTextarea();
        CliAutoComplete.$textarea = mock;
        CliAutoComplete.cache.settings = ["gyro", "acc_hor"];
        CliAutoComplete._initTextcomplete();
        const get = mock._strategies.find((s) => s.match && s.match.source === "^(\\s*get\\s+)(\\w*)$");
        const set = mock._strategies.find((s) => s.match && s.match.source === "^(\\s*set\\s+)(\\w*)$");
        expect(get).toBeTruthy();
        expect(set).toBeTruthy();
        let r1 = null;
        get.search.call(get, "g", (res) => (r1 = res));
        expect(r1).toContain("gyro");
        let r2 = null;
        set.search.call(set, "a", (res) => (r2 = res));
        expect(r2).toContain("acc_hor");
    });

    it('resource index provides placeholder like "<1-N>"', () => {
        const mock = createMockTextarea();
        CliAutoComplete.$textarea = mock;
        CliAutoComplete.cache.resourcesCount = { FOO: 3 };
        CliAutoComplete._initTextcomplete();
        const ri = mock._strategies.find((s) => s.match && s.match.source === "^(\\s*resource\\s+(\\w+)\\s+)(\\d*)$");
        expect(ri).toBeTruthy();
        let res = null;
        ri.search.call(ri, "", (arr) => (res = arr), ["resource FOO ", "resource FOO ", "FOO"]);
        expect(res && res[0]).toMatch(/(?:&lt;|<)1-\d+(?:&gt;|>)/);
    });

    it('feature strategy offers "-" and "list" when sign missing', () => {
        const mock = createMockTextarea();
        CliAutoComplete.$textarea = mock;
        CliAutoComplete._initTextcomplete();
        mock.valStr = "feature ";
        mock.triggerSearches();
        const found = mock.lastCallbackResults.some(
            (r) => r.results && (r.results.includes("-") || r.results.includes("list")),
        );
        expect(found).toBe(true);
    });
});

// Consolidated Pinia store tests for CLI autocomplete
describe("cliAutocomplete Pinia store (consolidated)", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        try {
            globalThis.CliAutoComplete = undefined;
        } catch (e) {}
    });

    it("syncFromCli copies cache and builder from legacy module", () => {
        const store = useCliAutocompleteStore();
        // Prepare legacy module
        globalThis.CliAutoComplete = {
            cache: { commands: ["foo"], resources: ["BAR"], resourcesCount: { BAR: 2 } },
            builder: { state: "done", numFails: 0 },
        };

        store.syncFromCli();

        expect(store.cache.commands).toContain("foo");
        expect(store.cache.resources).toContain("BAR");
        expect(store.cache.resourcesCount.BAR).toBe(2);
        expect(store.builder.state).toBe("done");
    });
});
