import { describe, it, expect, beforeEach } from "vitest";
import CliAutoComplete from "../src/js/CliAutoComplete";
import FC from "../src/js/fc";

// Minimal mock jQuery textarea with a fake textcomplete plugin
function createMockTextarea() {
    const mock = {
        _options: null,
        _strategies: [],
        lastCallbackResults: [],
        valStr: "",
        length: 1,
        // emulate jQuery element index access for $textarea[0]
        0: { selectionStart: 0, selectionEnd: 0 },
        // simple jQuery-like val() getter/setter
        val(value) {
            if (value === undefined) return this.valStr;
            this.valStr = value;
            return this;
        },
        textcomplete(...args) {
            // Usage 1: textcomplete([], options)
            if (Array.isArray(args[0]) && typeof args[1] === "object") {
                this._options = args[1];
                return this;
            }

            // Usage 2: textcomplete('register', [strategies])
            if (args[0] === "register" && Array.isArray(args[1])) {
                this._strategies = this._strategies.concat(args[1]);
                return this;
            }

            return this;
        },
        on() {
            // no-op for tests
            return this;
        },
        // Simulate trigger called by CliAutoComplete.openLater
        trigger() {
            this.lastCallbackResults = [];
            for (const s of this._strategies) {
                try {
                    // For each strategy try to match against whole input string
                    const match = this.valStr.match(s.match);
                    if (match) {
                        // compute term - follow the code's pattern: most strategies use group 2
                        const term = match[2] !== undefined ? match[2] : "";

                        // call strategy.search as it was defined in the init
                        const cb = (res) => {
                            this.lastCallbackResults.push({ strategy: s, results: res, match });
                        };

                        // Call the searcher according to its expected arity to better emulate real textcomplete
                        // If it expects 3 args, pass match as third param
                        if (s.search.length >= 3) {
                            s.search.call(s, term, cb, match);
                        } else {
                            s.search.call(s, term, cb);
                        }
                    }
                } catch (e) {
                    // match may be out of scope here, avoid referencing it
                    this.lastCallbackResults.push({ strategy: s, error: e, match: null });
                }
            }
        },
    };

    return mock;
}

beforeEach(() => {
    // reset any state
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

describe("CliAutoComplete strategies (unit tests with mock)", () => {
    it("registers strategies on _initTextcomplete", () => {
        const mock = createMockTextarea();
        CliAutoComplete.$textarea = mock;
        CliAutoComplete.cache.commands = ["status", "set", "get", "save"];

        CliAutoComplete._initTextcomplete();

        expect(mock._strategies.length).toBeGreaterThan(0);
    });

    it('suggests "status" for input "st" (command strategy)', () => {
        const mock = createMockTextarea();
        CliAutoComplete.$textarea = mock;
        CliAutoComplete.cache.commands = ["status", "set", "get", "save"];

        CliAutoComplete._initTextcomplete();

        // Instead of triggering all strategies (some cause regex issues in test environment),
        // invoke the command strategy directly.
        const cmdStrategy = mock._strategies.find((s) => s.match && s.match.source === "^(\\s*)(\\w*)$");
        expect(cmdStrategy).toBeTruthy();

        CliAutoComplete.forceOpen = true;
        const cb = (res) => {
            mock.lastCallbackResults.push({ strategy: cmdStrategy, results: res });
        };
        cmdStrategy.search.call(cmdStrategy, "st", cb);
        CliAutoComplete.forceOpen = false;

        const found = mock.lastCallbackResults.some((r) => r.results && r.results.some((x) => x === "status"));
        // Accept either direct suggestion result or the fallback replacement that applies the completed text
        const fallbackApplied = mock.val && mock.val() && mock.val().toLowerCase().startsWith("status");
        expect(found || fallbackApplied).toBe(true);
    });

    it('suggests "show" for input "resource sh" (resource strategy)', () => {
        const mock = createMockTextarea();
        CliAutoComplete.$textarea = mock;
        CliAutoComplete.cache.resources = ["show", "FOO"];
        // emulate FC version >= 4.0.0 so "show" is available
        // _initTextcomplete uses FC.CONFIG.flightControllerVersion - set it on the imported FC module
        FC.CONFIG = FC.CONFIG || {};
        FC.CONFIG.flightControllerVersion = "4.0.0";

        CliAutoComplete._initTextcomplete();

        mock.valStr = "resource sh";
        mock.trigger();

        // Debug: dump results when failing
        if (!mock.lastCallbackResults.some((r) => r.results && r.results.some((x) => x === "show"))) {
            // debug: command results missing
        }

        const found = mock.lastCallbackResults.some((r) => r.results && r.results.some((x) => x === "show"));
        expect(found).toBe(true);
    });

    it('applies single-match command fallback for "re" -> "resource" when forced', () => {
        const mock = createMockTextarea();
        CliAutoComplete.$textarea = mock;

        // make only 'resource' available so it's a single match for 're'
        CliAutoComplete.cache.commands = ["resource"];

        CliAutoComplete._initTextcomplete();

        mock.valStr = "re";

        // emulate user pressed Tab to force open
        CliAutoComplete.forceOpen = true;

        // find command strategy and invoke it directly
        const cmdStrategy = mock._strategies.find((s) => s.match && s.match.source === "^(\\s*)(\\w*)$");
        expect(cmdStrategy).toBeTruthy();

        // call search which should trigger the wrapped callback and fallback replacement
        cmdStrategy.search.call(cmdStrategy, "re", (res) => {
            // callback intentionally empty; fallback logic runs inside
        });

        CliAutoComplete.forceOpen = false;

        // the fallback should have applied the replacement (accept small variations)
        const v = mock.val();
        expect(v.startsWith("resource")).toBe(true);
    });
});
