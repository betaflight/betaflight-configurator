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

import CONFIGURATOR from "./data_storage";
import { EventBus } from "../components/eventBus";
import { useFlightControllerStore } from "../stores/fc";
import { addTimeout, removeTimeout } from "./timers";

const BUILDER_TIMEOUT_MS = 3000;

// The builder gives up while the FC still owes it the tail of a dump/get response, so output stays
// suppressed until the last sentinel we sent comes back, or this cap expires on a link gone quiet.
const DRAIN_TIMEOUT_MS = 2 * BUILDER_TIMEOUT_MS;

/** What the builder learns from the FC's `help`, `dump`, `get` and `mixer list` output. */
export interface CliAutoCompleteCache {
    commands: string[];
    resources: string[];
    resourcesCount: Record<string, number>;
    settings: string[];
    /** The accepted names of a lookup setting, or the "Allowed range: …" line of a numeric one. */
    settingsAcceptedValues: Record<string, string[] | string>;
    feature: string[];
    beeper: string[];
    mixers: string[];
}

// Array.prototype.sort()'s default order (UTF-16 code units), spelled out.
function byCodeUnit(a: string, b: string): number {
    if (a < b) {
        return -1;
    }
    return a > b ? 1 : 0;
}

/** `reset`, `init`, `parse-<command>`, `done` or `fail`. */
export interface CliAutoCompleteBuilder {
    state: string;
    numFails: number;
    draining?: boolean;
    /** Set when a build starts. */
    sentinel?: string;
    commandSequence?: string[];
    currentSetting?: string | null;
}

/**
 * Split an "Allowed values" list on commas, dropping the whitespace around each comma: the same
 * result as splitting on the regex `\s*,\s*`, without that regex's backtracking.
 */
function splitAcceptedValues(list: string): string[] {
    const parts = list.split(",");
    return parts.map((part, i) => {
        let value = part;
        if (i > 0) {
            value = value.trimStart();
        }
        if (i < parts.length - 1) {
            value = value.trimEnd();
        }
        return value;
    });
}

export interface CliAutoCompleteApi {
    configEnabled: boolean;
    builder: CliAutoCompleteBuilder;
    /** Created when a build starts. */
    cache?: CliAutoCompleteCache;
    sendLine?: (line: string) => void;
    writeToOutput?: (text: string) => void;
    isIdle?: () => boolean;
    isEnabled(): boolean;
    isBuilding(): boolean;
    isSuppressingOutput(): boolean;
    parseSuppressedLine(line: string): void;
    setEnabled(enable: boolean): void;
    initialize(sendLine: (line: string) => void, writeToOutput: (text: string) => void, isIdle?: () => boolean): void;
    cleanup(): void;
    _drainStart(): void;
    _drainParseLine(line: string): void;
    _drainStop(): void;
    _builderWatchdogTouch(): void;
    _builderWatchdogStop(): void;
    builderStart(): void;
    builderParseLine(line: string): void;
    _builderOnSentinel(): void;
    _builderParseDumpLine(line: string): void;
    _builderParseGetLine(line: string): void;
}

/**
 * Encapsulates the AutoComplete cache-building logic.
 *
 * The dropdown UI is handled by the Vue CliAutocompleteDropdown component
 * and the useCliAutocomplete composable.
 */
const CliAutoComplete: CliAutoCompleteApi = {
    configEnabled: false,
    builder: { state: "reset", numFails: 0, draining: false },

    isEnabled() {
        return (
            this.isBuilding() ||
            (this.configEnabled &&
                useFlightControllerStore().config.flightControllerIdentifier === "BTFL" &&
                this.builder.state !== "fail")
        );
    },

    isBuilding() {
        return this.builder.state !== "reset" && this.builder.state !== "done" && this.builder.state !== "fail";
    },

    isSuppressingOutput() {
        return this.isBuilding() || !!this.builder.draining;
    },

    parseSuppressedLine(line) {
        if (this.builder.draining) {
            this._drainParseLine(line);
        } else {
            this.builderParseLine(line);
        }
    },

    setEnabled(enable) {
        if (this.configEnabled !== enable) {
            this.configEnabled = enable;

            if (CONFIGURATOR.cliActive && CONFIGURATOR.cliValid) {
                // cli is already open
                if (this.isEnabled()) {
                    this.builderStart();
                } else if (!this.isBuilding()) {
                    this.cleanup();
                }
            }
        }
    },

    /**
     * Initialize CliAutoComplete.
     * @param sendLine      Function to send a line to CLI.
     * @param writeToOutput Function to write output to CLI.
     * @param isIdle        True when no command response is in flight; gates build start.
     */
    initialize(sendLine, writeToOutput, isIdle) {
        this.sendLine = sendLine;
        this.writeToOutput = writeToOutput;
        this.isIdle = isIdle;
        this.cleanup();
    },

    cleanup() {
        this._builderWatchdogStop();
        this._drainStop();
        removeTimeout("autocomplete_builder_defer");
        this.builder.state = "reset";
        this.builder.numFails = 0;
    },

    _drainStart() {
        this.builder.draining = true;
        addTimeout("autocomplete_builder_drain", () => this._drainStop(), DRAIN_TIMEOUT_MS);
    },

    _drainParseLine(line) {
        if (line.includes(this.builder.sentinel!)) {
            this._drainStop();
        }
    },

    _drainStop() {
        removeTimeout("autocomplete_builder_drain");
        this.builder.draining = false;
    },

    _builderWatchdogTouch() {
        this._builderWatchdogStop();

        addTimeout(
            "autocomplete_builder_watchdog",
            () => {
                if (this.builder.numFails) {
                    this.builder.numFails++;
                    this.builder.state = "fail";
                    this._drainStart();
                    this.writeToOutput!("Failed!<br># ");
                    EventBus.$emit("autocomplete:build:stop");
                } else {
                    // give it one more try
                    this.builder.numFails++;
                    this.builder.state = "reset";
                    this.builderStart();
                }
            },
            BUILDER_TIMEOUT_MS,
        );
    },

    _builderWatchdogStop() {
        removeTimeout("autocomplete_builder_watchdog");
    },

    builderStart() {
        if (this.builder.state !== "reset") {
            return;
        }

        if (this.isIdle && !this.isIdle()) {
            // defer: starting now could swallow an in-flight command's response (isBuilding() suppresses all output)
            addTimeout("autocomplete_builder_defer", () => this.builderStart(), 250);
            return;
        }

        this.cache = {
            commands: [],
            resources: [],
            resourcesCount: {},
            settings: [],
            settingsAcceptedValues: {},
            feature: [],
            beeper: ["ALL"],
            mixers: [],
        };
        this.builder.commandSequence = ["help", "dump", "get", "mixer list"];
        this.builder.currentSetting = null;
        this.builder.sentinel = `# ${Math.random()}`; // NOSONAR: a marker to spot the end of our own output, not a secret
        this.builder.state = "init";
        this.writeToOutput!("<br># Building AutoComplete Cache ... ");
        this.sendLine!(this.builder.sentinel);
        this._builderWatchdogTouch();
        EventBus.$emit("autocomplete:build:start");
    },

    builderParseLine(line) {
        this._builderWatchdogTouch();

        if (line.includes(this.builder.sentinel!)) {
            this._builderOnSentinel();
            return;
        }

        const cache = this.cache!;
        switch (this.builder.state) {
            case "parse-help": {
                const matchHelp = /^(\w+)/.exec(line);
                if (matchHelp) {
                    cache.commands.push(matchHelp[1]);
                }
                break;
            }

            case "parse-dump":
                this._builderParseDumpLine(line);
                break;

            case "parse-get":
                this._builderParseGetLine(line);
                break;

            case "parse-mixer list": {
                const matchMixer = /:(.+)/.exec(line);
                if (matchMixer) {
                    cache.mixers = ["list"].concat(matchMixer[1].trim().split(/\s+/));
                }
                break;
            }
        }
    },

    /** The sentinel ends the current command's output: send the next command, or finish. */
    _builderOnSentinel() {
        const cache = this.cache!;
        const builder = this.builder;
        // got sentinel
        const command = builder.commandSequence!.shift();

        if (command && this.configEnabled) {
            // next state
            builder.state = `parse-${command}`;
            this.sendLine!(command);
            this.sendLine!(builder.sentinel!);
        } else {
            // done
            this._builderWatchdogStop();

            if (this.configEnabled) {
                const byLocale = (a: string, b: string) =>
                    a.localeCompare(b, globalThis.navigator.language, { ignorePunctuation: true });
                cache.settings.sort(byLocale);
                cache.commands.sort(byLocale);
                cache.feature.sort(byLocale);
                cache.beeper.sort(byLocale);
                cache.resources = Object.keys(cache.resourcesCount).sort(byLocale);

                this.writeToOutput!("Done!<br># ");
                builder.state = "done";
            } else {
                // disabled while we were building
                this.writeToOutput!("Cancelled!<br># ");
                this.cleanup();
            }
            EventBus.$emit("autocomplete:build:stop");
        }
    },

    _builderParseDumpLine(line) {
        const cache = this.cache!;
        const matchDump = /^resource\s+(\w+)/i.exec(line);
        if (matchDump) {
            const r = matchDump[1].toUpperCase(); // should alread be upper, but to be sure, since we depend on that later
            cache.resourcesCount[r] = (cache.resourcesCount[r] || 0) + 1;
        } else {
            const matchFeatBeep = /^(feature|beeper)\s+-?(\w+)/i.exec(line);
            if (matchFeatBeep) {
                cache[matchFeatBeep[1].toLowerCase() as "feature" | "beeper"].push(matchFeatBeep[2]);
            }
        }
    },

    _builderParseGetLine(line) {
        const cache = this.cache!;
        const builder = this.builder;
        const matchGet = /^(\w+)\s*=/.exec(line);
        if (matchGet) {
            // setting name
            cache.settings.push(matchGet[1]);
            builder.currentSetting = matchGet[1].toLowerCase();
        } else {
            // Avoid catastrophic backtracking from two greedy `.*` groups.
            // Match up to the first colon for the key, then the rest; the value's leading
            // whitespace is trimmed separately so the pattern cannot backtrack.
            const matchGetSettings = /^([^:]+):(.*)/.exec(line);
            if (matchGetSettings !== null && builder.currentSetting) {
                if (/values/i.test(matchGetSettings[1])) {
                    // Allowed Values
                    cache.settingsAcceptedValues[builder.currentSetting] = splitAcceptedValues(
                        matchGetSettings[2].trimStart(),
                    ).sort(byCodeUnit);
                } else if (/range|length/i.test(matchGetSettings[1])) {
                    // "Allowed range" or "Array length", store as string hint
                    cache.settingsAcceptedValues[builder.currentSetting] = matchGetSettings[0];
                }
            }
        }
    },
};

export default CliAutoComplete;
