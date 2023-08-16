import GUI from './gui';
import CONFIGURATOR from './data_storage';
import FC from './fc';
import semver from 'semver';
import { tracking } from './Analytics';
import $ from 'jquery';

/**
 * Encapsulates the AutoComplete logic
 *
 * Uses: https://github.com/yuku/jquery-textcomplete
 * Check out the docs at https://github.com/yuku/jquery-textcomplete/tree/v1/doc
 */
const CliAutoComplete = {
    configEnabled: false,
    builder: { state: 'reset', numFails: 0 },
};

CliAutoComplete.isEnabled = function() {
    return this.isBuilding() || (this.configEnabled && FC.CONFIG.flightControllerIdentifier === "BTFL" && this.builder.state !== 'fail');
};

CliAutoComplete.isBuilding = function() {
    return this.builder.state !== 'reset' && this.builder.state !== 'done' && this.builder.state !== 'fail';
};

CliAutoComplete.isOpen = function() {
    return $('.cli-textcomplete-dropdown').is(':visible');
};

/**
 * @param {boolean} force - Forces AutoComplete to be shown even if the matching strategy has less that minChars input
 */
CliAutoComplete.openLater = function(force) {
    const self = this;
    setTimeout(function() {
        self.forceOpen = !!force;
        self.$textarea.textcomplete('trigger');
        self.forceOpen = false;
    }, 0);
};

CliAutoComplete.setEnabled = function(enable) {
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

CliAutoComplete.initialize = function($textarea, sendLine, writeToOutput) {
    tracking.sendEvent(tracking.EVENT_CATEGORIES.APPLICATION, 'CliAutoComplete', this.configEnabled);

    this.$textarea = $textarea;
    this.forceOpen = false;
    this.sendLine = sendLine;
    this.writeToOutput = writeToOutput;
    this.cleanup();
};

CliAutoComplete.cleanup = function() {
    this.$textarea.textcomplete('destroy');
    this.builder.state = 'reset';
    this.builder.numFails = 0;
};

CliAutoComplete._builderWatchdogTouch = function() {
    const self = this;

    this._builderWatchdogStop();

    GUI.timeout_add('autocomplete_builder_watchdog', function() {
        if (self.builder.numFails) {
            self.builder.numFails++;
            self.builder.state = 'fail';
            self.writeToOutput('Failed!<br># ');
            $(self).trigger('build:stop');
        } else {
            // give it one more try
            self.builder.state = 'reset';
            self.builderStart();
        }
    }, 3000);
};

CliAutoComplete._builderWatchdogStop = function() {
    GUI.timeout_remove('autocomplete_builder_watchdog');
};

CliAutoComplete.builderStart = function() {
    if (this.builder.state === 'reset') {
        this.cache = {
            commands: [],
            resources: [],
            resourcesCount: {},
            settings: [],
            settingsAcceptedValues: {},
            feature: [],
            beeper: ['ALL'],
            mixers: [],
        };
        this.builder.commandSequence = ['help', 'dump', 'get', 'mixer list'];
        this.builder.currentSetting = null;
        this.builder.sentinel = `# ${Math.random()}`;
        this.builder.state = 'init';
        this.writeToOutput('<br># Building AutoComplete Cache ... ');
        this.sendLine(this.builder.sentinel);
        $(this).trigger('build:start');
    }
};

CliAutoComplete.builderParseLine = function(line) {
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
                this.writeToOutput('Cancelled!<br># ');
                this.cleanup();
            } else {
                cache.settings.sort();
                cache.commands.sort();
                cache.feature.sort();
                cache.beeper.sort();
                cache.resources = Object.keys(cache.resourcesCount).sort();

                this._initTextcomplete();
                this.writeToOutput('Done!<br># ');
                builder.state = 'done';
            }
            $(this).trigger('build:stop');
        }
    } else {
        switch (builder.state) {
            case 'parse-help':
                const matchHelp = line.match(/^(\w+)/);
                if (matchHelp) {
                    cache.commands.push(matchHelp[1]);
                }
                break;

            case 'parse-dump':
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

            case 'parse-get':
                const matchGet = line.match(/^(\w+)\s*=/);
                if (matchGet) {
                    // setting name
                    cache.settings.push(matchGet[1]);
                    builder.currentSetting = matchGet[1].toLowerCase();
                } else {
                    const matchGetSettings = line.match(/^(.*): (.*)/);
                    if (matchGetSettings !== null && builder.currentSetting) {
                        if (matchGetSettings[1].match(/values/i)) {
                            // Allowed Values
                            cache.settingsAcceptedValues[builder.currentSetting] = matchGetSettings[2].split(/\s*,\s*/).sort();
                        } else if (matchGetSettings[1].match(/range|length/i)){
                            // "Allowed range" or "Array length", store as string hint
                            cache.settingsAcceptedValues[builder.currentSetting] = matchGetSettings[0];
                        }
                    }
                }
                break;

            case 'parse-mixer list':
                const matchMixer = line.match(/:(.+)/);
                if (matchMixer) {
                    cache.mixers = ['list'].concat(matchMixer[1].trim().split(/\s+/));
                }
                break;
        }
    }
};

/**
 * Initializes textcomplete with all the autocomplete strategies
 */
CliAutoComplete._initTextcomplete = function() {
    let sendOnEnter = false;
    const self = this;
    const $textarea = this.$textarea;
    const cache = self.cache;

    let savedMouseoverItemHandler = null;

    // helper functions
    const highlighter = function(anywhere) {
        return function(value, term) {
            const anywherePrefix = anywhere ? '': '^';
            const termValue = value.replace(new RegExp(`${anywherePrefix}(${term})`, 'gi'), '<b>$1</b>');
            return term ? termValue : value;
        };
    };
    const highlighterAnywhere = highlighter(true);
    const highlighterPrefix = highlighter(false);

    const searcher = function(term, callback, array, minChars, matchPrefix) {
        const res = [];

        if ((minChars !== false && term.length >= minChars) || self.forceOpen || self.isOpen()) {
            term = term.toLowerCase();
            for (let i = 0; i < array.length; i++) {
                const v = array[i].toLowerCase();
                if (matchPrefix && v.startsWith(term) || !matchPrefix && v.indexOf(term) !== -1) {
                    res.push(array[i]);
                }
            }
        }

        callback(res);

        if (self.forceOpen && res.length === 1) {
            // hacky: if we came here because of Tab and there's only one match
            // trigger Tab again, so that textcomplete should immediately select the only result
            // instead of showing the menu
            $textarea.trigger($.Event('keydown', {keyCode:9}));
        }
    };

    const contexter = function(text) {
        const val = $textarea.val();
        if (val.length === text.length || val[text.length].match(/\s/)) {
            return true;
        }
        return false; // do not show autocomplete if in the middle of a word
    };

    const basicReplacer = function(value) {
        return `$1${value} `;
    };
    // end helper functions

    // init textcomplete
    $textarea.textcomplete([],
        {
            maxCount: 10000,
            debounce: 0,
            className: 'cli-textcomplete-dropdown',
            placement: 'top',
            onKeydown: function(e) {
                // some strategies may set sendOnEnter only at the replace stage, thus we call with timeout
                // since this handler [onKeydown] is triggered before replace()
                if (e.which === 13) {
                    setTimeout(function() {
                        if (sendOnEnter) {
                            // fake "enter" to run the textarea's handler
                            $textarea.trigger($.Event('keypress', {which:13}));
                        }
                    }, 0);
                }
            },
        },
    )
    .on('textComplete:show', function() {
        /**
         * The purpose of this code is to disable initially the `mouseover` menu item handler.
         * Normally, when the menu pops up, if the mouse cursor is in the same area,
         * the `mouseover` event triggers immediately and activates the item under
         * the cursor. This might be undesirable when using the keyboard.
         *
         * Here we save the original `mouseover` handler and remove it on popup show.
         * Then add `mousemove` handler. If the mouse moves we consider that mouse interaction
         * is desired so we reenable the `mouseover` handler
         */

        const textCompleteDropDownElement = $('.textcomplete-dropdown');

        if (!savedMouseoverItemHandler) {
            // save the original 'mouseover' handeler
            try {
                savedMouseoverItemHandler = $._data(textCompleteDropDownElement[0], 'events').mouseover[0].handler;
            } catch (error) {
                console.log(error);
            }

            if (savedMouseoverItemHandler) {
                textCompleteDropDownElement
                .off('mouseover') // initially disable it
                .off('mousemove') // avoid `mousemove` accumulation if previous show did not trigger `mousemove`
                .on('mousemove', '.textcomplete-item', function(e) {
                        // the mouse has moved so reenable `mouseover`
                    $(this).parent()
                    .off('mousemove')
                    .on('mouseover', '.textcomplete-item', savedMouseoverItemHandler);

                    // trigger the mouseover handler to select the item under the cursor
                    savedMouseoverItemHandler(e);
                });
            }
        }
    });

    // textcomplete autocomplete strategies

    // strategy builder helper
    const strategy = function(s) {
        return $.extend({
            template: highlighterAnywhere,
            replace: basicReplacer,
            context: contexter,
            index: 2,
        }, s);
    };

    $textarea.textcomplete('register', [
        strategy({ // "command"
            match: /^(\s*)(\w*)$/,
            search: function(term, callback) {
                sendOnEnter = false;
                searcher(term, callback, cache.commands, false, true);
            },
            template: highlighterPrefix,
        }),

        strategy({ // "get"
            match: /^(\s*get\s+)(\w*)$/i,
            search:  function(term, callback) {
                sendOnEnter = true;
                searcher(term, function(arr) {
                    if (term.length > 0 && arr.length > 1) {
                        // prepend the uncompleted term in the popup
                        arr = [term].concat(arr);
                    }
                    callback(arr);
                }, cache.settings, 3);
            },
        }),

        strategy({ // "set"
            match: /^(\s*set\s+)(\w*)$/i,
            search:  function(term, callback) {
                sendOnEnter = false;
                searcher(term, callback, cache.settings, 3);
            },
        }),

        strategy({ // "set ="
            match: /^(\s*set\s+\w*\s*)$/i,
            search:  function(term, callback) {
                sendOnEnter = false;
                searcher('', callback, ['='], false);
            },
            replace: function(value) {
                self.openLater();
                return basicReplacer(value);
            },
        }),

        strategy({ // "set with value"
            match: /^(\s*set\s+(\w+))\s*=\s*(.*)$/i,
            search: function(term, callback, match) {
                const arr = [];
                const settingName = match[2].toLowerCase();
                this.isSettingValueArray = false;
                this.value = match[3];
                sendOnEnter = !!term;

                if (settingName in cache.settingsAcceptedValues) {
                    const val = cache.settingsAcceptedValues[settingName];

                    if (Array.isArray(val)) {
                        // setting uses lookup strings
                        this.isSettingValueArray = true;
                        sendOnEnter = true;
                        searcher(term, callback, val, 0);
                        return;
                    }

                    // the settings uses a numeric value.
                    // Here we use a little trick - we use the autocomplete
                    // list as kind of a tooltip to display the Accepted Range hint
                    arr.push(val);
                }

                callback(arr);
            },
            replace: function (value) {
                if (!this.isSettingValueArray) {
                    // `value` is the tooltip text, so use the saved match
                    value = this.value;
                }

                return `$1 = ${value}`; // cosmetic - make sure we have spaces around the `=`
            },
            index: 3,
            isSettingValueArray: false,
        }),

        strategy({ // "resource"
            match: /^(\s*resource\s+)(\w*)$/i,
            search:  function(term, callback) {
                sendOnEnter = false;
                let arr = cache.resources;
                if (semver.gte(FC.CONFIG.flightControllerVersion, "4.0.0")) {
                    arr = ['show'].concat(arr);
                } else {
                    arr = ['list'].concat(arr);
                }
                searcher(term, callback, arr, 1);
            },
            replace: function(value) {
                if (value in cache.resourcesCount) {
                    self.openLater();
                } else if (value === 'list' || value === 'show') {
                    sendOnEnter = true;
                }
                return basicReplacer(value);
            },
        }),

        strategy({ // "resource index"
            match: /^(\s*resource\s+(\w+)\s+)(\d*)$/i,
            search:  function(term, callback, match) {
                sendOnEnter = false;
                this.savedTerm = term;
                callback([`&lt;1-${cache.resourcesCount[match[2].toUpperCase()]}&gt;`]);
            },
            replace: function() {
                if (this.savedTerm) {
                    self.openLater();
                    return '$1$3 ';
                }
                return undefined;
            },
            context: function(text) {
                const matchResource = text.match(/^\s*resource\s+(\w+)\s/i);
                // use this strategy only for resources with more than one index
                if (matchResource && (cache.resourcesCount[matchResource[1].toUpperCase()] || 0) > 1 ) {
                    return contexter(text);
                }
                return false;
            },
            index: 3,
            savedTerm: null,
        }),

        strategy({ // "resource pin"
            match: /^(\s*resource\s+\w+\s+(\d*\s+)?)(\w*)$/i,
            search:  function(term, callback) {
                sendOnEnter = !!term;
                if (term) {
                    if ('none'.startsWith(term)) {
                        callback(['none']);
                    } else {
                        callback(['&lt;pin&gt;']);
                    }
                } else {
                    callback(['&lt;pin&gt', 'none']);
                }
            },
            template: function(value, term) {
                if (value === 'none') {
                    return highlighterPrefix(value, term);
                }
                return value;
            },
            replace: function(value) {
                if (value === 'none') {
                    sendOnEnter = true;
                    return '$1none ';
                }
                return undefined;
            },
            context: function(text) {
                const m = text.match(/^\s*resource\s+(\w+)\s+(\d+\s)?/i);
                if (m) {
                    // show pin/none for resources having only one index (it's not needed at the commend line)
                    // OR having more than one index and the index is supplied at the command line
                    const count = cache.resourcesCount[m[1].toUpperCase()] || 0;
                    if (count && (m[2] || count === 1)) {
                        return contexter(text);
                    }
                }
                return false;
            },
            index: 3,
        }),

        strategy({ // "feature" and "beeper"
            match: /^(\s*(feature|beeper)\s+(-?))(\w*)$/i,
            search:  function(term, callback, match) {
                sendOnEnter = !!term;
                let arr = cache[match[2].toLowerCase()];
                if (!match[3]) {
                    arr = ['-', 'list'].concat(arr);
                }
                searcher(term, callback, arr, 1);
            },
            replace: function(value) {
                if (value === '-') {
                    self.openLater(true);
                    return '$1-';
                }
                return basicReplacer(value);
            },
            index: 4,
        }),

        strategy({ // "mixer"
            match: /^(\s*mixer\s+)(\w*)$/i,
            search:  function(term, callback) {
                sendOnEnter = true;
                searcher(term, callback, cache.mixers, 1);
            },
        }),
    ]);

    $textarea.textcomplete('register', [
        strategy({ // "resource show all", from BF 4.0.0 onwards
            match: /^(\s*resource\s+show\s+)(\w*)$/i,
            search:  function(term, callback) {
                sendOnEnter = true;
                searcher(term, callback, ['all'], 1, true);
            },
            template: highlighterPrefix,
        }),
    ]);

    // diff command
    const diffArgs1 = ["master", "profile", "rates", "all"];
    const diffArgs2 = [];

    // above 3.4.0
    diffArgs2.push("defaults");
    diffArgs1.push("hardware");
    diffArgs2.push("bare");

    diffArgs1.sort();
    diffArgs2.sort();

    $textarea.textcomplete('register', [
        strategy({ // "diff arg1"
            match: /^(\s*diff\s+)(\w*)$/i,
            search:  function(term, callback) {
                sendOnEnter = true;
                searcher(term, callback, diffArgs1, 1, true);
            },
            template: highlighterPrefix,
        }),

        strategy({ // "diff arg1 arg2"
            match: /^(\s*diff\s+\w+\s+)(\w*)$/i,
            search:  function(term, callback) {
                sendOnEnter = true;
                searcher(term, callback, diffArgs2, 1, true);
            },
            template: highlighterPrefix,
        }),
    ]);
};

window.CliAutoComplete = CliAutoComplete;
export default CliAutoComplete;
