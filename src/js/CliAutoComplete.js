import GUI from "./gui";
import CONFIGURATOR from "./data_storage";
import FC from "./fc";
import { EventBus } from "../components/eventBus";

/**
 * Encapsulates the AutoComplete cache-building logic.
 *
 * The dropdown UI is handled by the Vue CliAutocompleteDropdown component
 * and the useCliAutocomplete composable.
 */
const CliAutoComplete = {
    configEnabled: false,
    builder: { state: "reset", numFails: 0 },
};

CliAutoComplete.isEnabled = function () {
    return (
        this.isBuilding() ||
        (this.configEnabled && FC.CONFIG.flightControllerIdentifier === "BTFL" && this.builder.state !== "fail")
    );
};

CliAutoComplete.isBuilding = function () {
    return this.builder.state !== "reset" && this.builder.state !== "done" && this.builder.state !== "fail";
};

CliAutoComplete.setEnabled = function (enable) {
    if (this.configEnabled !== enable) {
        this.configEnabled = enable;

        if (CONFIGURATOR.cliActive && CONFIGURATOR.cliValid) {
            // cli is already open
            if (this.isEnabled()) {
                this.builderStart();
            } else if (!this.isEnabled() && !this.isBuilding()) {
                this.cleanup();
            }
        }
    }
};

/**
 * Initialize CliAutoComplete.
 * @param {Function} sendLine      Function to send a line to CLI.
 * @param {Function} writeToOutput Function to write output to CLI.
 */
CliAutoComplete.initialize = function (sendLine, writeToOutput) {
    this.sendLine = sendLine;
    this.writeToOutput = writeToOutput;
    this.cleanup();
};

CliAutoComplete.cleanup = function () {
    this.builder.state = "reset";
    this.builder.numFails = 0;
};

CliAutoComplete._builderWatchdogTouch = function () {
    const self = this;

    this._builderWatchdogStop();

    GUI.timeout_add(
        "autocomplete_builder_watchdog",
        function () {
            if (self.builder.numFails) {
                self.builder.numFails++;
                self.builder.state = "fail";
                self.writeToOutput("Failed!<br># ");
                EventBus.$emit("autocomplete:build:stop");
            } else {
                // give it one more try
                self.builder.state = "reset";
                self.builderStart();
            }
        },
        3000,
    );
};

CliAutoComplete._builderWatchdogStop = function () {
    GUI.timeout_remove("autocomplete_builder_watchdog");
};

CliAutoComplete.builderStart = function () {
    if (this.builder.state === "reset") {
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
        this.builder.sentinel = `# ${Math.random()}`;
        this.builder.state = "init";
        this.writeToOutput("<br># Building AutoComplete Cache ... ");
        this.sendLine(this.builder.sentinel);
        this._builderWatchdogTouch();
        EventBus.$emit("autocomplete:build:start");
    }
};

CliAutoComplete.builderParseLine = function (line) {
    const cache = this.cache;
    const builder = this.builder;

    this._builderWatchdogTouch();

    if (line.indexOf(builder.sentinel) !== -1) {
        // got sentinel
        const command = builder.commandSequence.shift();

        if (command && this.configEnabled) {
            // next state
            builder.state = `parse-${command}`;
            this.sendLine(command);
            this.sendLine(builder.sentinel);
        } else {
            // done
            this._builderWatchdogStop();

            if (!this.configEnabled) {
                // disabled while we were building
                this.writeToOutput("Cancelled!<br># ");
                this.cleanup();
            } else {
                cache.settings.sort();
                cache.commands.sort();
                cache.feature.sort();
                cache.beeper.sort();
                cache.resources = Object.keys(cache.resourcesCount).sort();

                this.writeToOutput("Done!<br># ");
                builder.state = "done";
            }
            EventBus.$emit("autocomplete:build:stop");
        }
    } else {
        switch (builder.state) {
            case "parse-help":
                const matchHelp = line.match(/^(\w+)/);
                if (matchHelp) {
                    cache.commands.push(matchHelp[1]);
                }
                break;

            case "parse-dump":
                const matchDump = line.match(/^resource\s+(\w+)/i);
                if (matchDump) {
                    const r = matchDump[1].toUpperCase(); // should alread be upper, but to be sure, since we depend on that later
                    cache.resourcesCount[r] = (cache.resourcesCount[r] || 0) + 1;
                } else {
                    const matchFeatBeep = line.match(/^(feature|beeper)\s+-?(\w+)/i);
                    if (matchFeatBeep) {
                        cache[matchFeatBeep[1].toLowerCase()].push(matchFeatBeep[2]);
                    }
                }
                break;

            case "parse-get":
                const matchGet = line.match(/^(\w+)\s*=/);
                if (matchGet) {
                    // setting name
                    cache.settings.push(matchGet[1]);
                    builder.currentSetting = matchGet[1].toLowerCase();
                } else {
                    // Avoid catastrophic backtracking from two greedy `.*` groups.
                    // Match up to the first colon for the key, then the rest.
                    const matchGetSettings = line.match(/^([^:]+):\s*(.*)/);
                    if (matchGetSettings !== null && builder.currentSetting) {
                        if (matchGetSettings[1].match(/values/i)) {
                            // Allowed Values
                            cache.settingsAcceptedValues[builder.currentSetting] = matchGetSettings[2]
                                .split(/\s*,\s*/)
                                .sort();
                        } else if (matchGetSettings[1].match(/range|length/i)) {
                            // "Allowed range" or "Array length", store as string hint
                            cache.settingsAcceptedValues[builder.currentSetting] = matchGetSettings[0];
                        }
                    }
                }
                break;

            case "parse-mixer list":
                const matchMixer = line.match(/:(.+)/);
                if (matchMixer) {
                    cache.mixers = ["list"].concat(matchMixer[1].trim().split(/\s+/));
                }
                break;
        }
    }
};

export default CliAutoComplete;
