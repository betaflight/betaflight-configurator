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

import { ref, nextTick, type Ref } from "vue";
import semver from "semver";
import { useFlightControllerStore } from "@/stores/fc";
import CliAutoComplete from "../js/CliAutoComplete";
import { escapeHtml } from "../js/utils/common";

/** What CliAutoComplete learns from the FC's `help`, `dump`, `get` and `mixer list` output. */
interface CliAutoCompleteCache {
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

/** One dropdown entry: the text to insert, and the same text with the typed term highlighted. */
export interface CliAutocompleteItem {
    text: string;
    html: string;
}

/**
 * Completes one shape of command line. `match` captures the line so far, and `replace` returns a
 * pattern whose $1..$9 are filled from those captures, or null to leave the input alone.
 */
interface Strategy {
    match: RegExp;
    /** The capture group holding the word being completed. */
    index: number;
    /** When present, the strategy only applies to lines it accepts. */
    context?: (text: string) => boolean;
    search: (term: string, match: RegExpExecArray) => string[];
    template: (value: string, term: string) => string;
    replace: (value: string) => string | null;
}

export interface CliAutocomplete {
    visible: Ref<boolean>;
    items: Ref<CliAutocompleteItem[]>;
    activeIndex: Ref<number>;
    sendOnEnter: Ref<boolean>;
    forceOpen: Ref<boolean>;
    caretLeft: Ref<number>;
    connect: (
        getter: () => string,
        setter: (value: string) => void,
        elGetter?: () => HTMLTextAreaElement | null,
    ) => void;
    initStrategies: () => void;
    update: (inputText: string, cursorPos?: number) => void;
    selectItem: (index: number) => void;
    openForced: (inputText: string) => void;
    navigateUp: () => void;
    navigateDown: () => void;
    hide: () => void;
    isOpen: () => boolean;
}

function highlightAnywhere(value: string, term: string): string {
    if (!term) {
        return escapeHtml(value);
    }
    value = escapeHtml(value);
    term = escapeHtml(term);
    const idx = value.toLowerCase().indexOf(term.toLowerCase());
    if (idx === -1) {
        return value;
    }
    return `${value.slice(0, idx)}<b>${value.slice(idx, idx + term.length)}</b>${value.slice(idx + term.length)}`;
}

function highlightPrefix(value: string, term: string): string {
    if (!term) {
        return escapeHtml(value);
    }
    value = escapeHtml(value);
    term = escapeHtml(term);
    if (!value.toLowerCase().startsWith(term.toLowerCase())) {
        return value;
    }
    return `<b>${value.slice(0, term.length)}</b>${value.slice(term.length)}`;
}

/**
 * @param minChars the term length that opens the list unprompted, or false for never
 */
function searchArray(
    term: string,
    array: string[],
    minChars: number | false,
    matchPrefix: boolean,
    forceOpen: boolean,
    isOpen: boolean,
): string[] {
    const res: string[] = [];
    if ((minChars !== false && term.length >= minChars) || forceOpen || isOpen) {
        const lowerTerm = term.toLowerCase();
        for (const item of array) {
            const v = item.toLowerCase();
            if (matchPrefix ? v.startsWith(lowerTerm) : v.includes(lowerTerm)) {
                res.push(item);
            }
        }
    }
    return res;
}

/**
 * Apply a replacement pattern using regex match groups.
 * Pattern tokens like $1, $2, $3 are replaced with the corresponding capture groups.
 */
function applyReplacement(pattern: string, match: RegExpExecArray): string {
    // Only replace $1..$9 (capture groups). Do not treat $0 as the full match;
    // leave any accidental "$0" sequences unchanged.
    return pattern.replaceAll(/\$([1-9])/g, (_, n: string) => match[Number(n)] ?? "");
}

/**
 * Check if cursor is at end of text (not in middle of a word).
 */
function isAtWordEnd(text: string, cursorPos: number): boolean {
    return cursorPos >= text.length || /\s/.test(text[cursorPos]);
}

export function useCliAutocomplete(): CliAutocomplete {
    const fcStore = useFlightControllerStore();
    const visible = ref(false);
    const items = ref<CliAutocompleteItem[]>([]);
    const activeIndex = ref(0);
    const forceOpen = ref(false);
    const sendOnEnter = ref(false);
    const caretLeft = ref(0);

    // Internal state
    let strategies: Strategy[] = [];
    let matchedStrategy: Strategy | null = null;
    let matchedGroups: RegExpExecArray | null = null;
    let openLaterRequested = false;
    let inputSetter: ((value: string) => void) | null = null;
    let inputGetter: (() => string) | null = null;
    let textareaGetter: (() => HTMLTextAreaElement | null) | null = null;

    /**
     * Wire the composable to the textarea's v-model.
     * @param getter  - returns current input value
     * @param setter  - sets the input value
     * @param elGetter - returns the textarea DOM element
     */
    function connect(
        getter: () => string,
        setter: (value: string) => void,
        elGetter?: () => HTMLTextAreaElement | null,
    ) {
        inputGetter = getter;
        inputSetter = setter;
        textareaGetter = elGetter || null;
    }

    /**
     * Calculate the pixel x-offset of the caret in the textarea
     * using a hidden mirror div with the same font/padding styles.
     */
    function updateCaretPosition() {
        const textarea = textareaGetter?.();
        if (!textarea) {
            return;
        }

        const mirror = document.createElement("span");
        const style = globalThis.getComputedStyle(textarea);
        mirror.style.font = style.getPropertyValue("font");
        mirror.style.letterSpacing = style.getPropertyValue("letter-spacing");
        mirror.style.whiteSpace = "pre";
        mirror.style.position = "absolute";
        mirror.style.visibility = "hidden";
        mirror.textContent = textarea.value.slice(0, textarea.selectionStart);
        document.body.appendChild(mirror);
        caretLeft.value = mirror.offsetWidth + Number.parseFloat(style.getPropertyValue("padding-left") || "0");
        mirror.remove();
    }

    /**
     * Build strategy definitions from the autocomplete cache.
     * Called once after CliAutoComplete finishes building.
     */
    function initStrategies() {
        // CliAutoComplete is unchecked JS that creates its cache when a build starts.
        const cache = (CliAutoComplete as { cache?: CliAutoCompleteCache }).cache;
        if (!cache) {
            return;
        }

        // diff command arguments
        const diffArgs1 = ["all", "hardware", "master", "profile", "rates"];
        const diffArgs2 = ["bare", "defaults"];

        const settingValueStrategy: Strategy & { isSettingValueArray: boolean; savedValue: string } = {
            // "set <setting> = <value>"
            match: /^(\s*set\s+(\w+))\s*=\s*(\S.*)?$/i,
            index: 3,
            isSettingValueArray: false,
            savedValue: "",
            search(term, match) {
                const settingName = match[2].toLowerCase();
                this.isSettingValueArray = false;
                this.savedValue = match[3];
                sendOnEnter.value = !!term;

                if (settingName in cache.settingsAcceptedValues) {
                    const val = cache.settingsAcceptedValues[settingName];
                    if (Array.isArray(val)) {
                        this.isSettingValueArray = true;
                        sendOnEnter.value = true;
                        return searchArray(term, val, 0, false, forceOpen.value, visible.value);
                    }
                    // Numeric range hint - show as tooltip
                    return [val];
                }
                return [];
            },
            template: highlightAnywhere,
            replace(value) {
                if (!this.isSettingValueArray) {
                    value = this.savedValue;
                }
                return `$1 = ${value}`;
            },
        };

        const resourceIndexStrategy: Strategy & { savedTerm: string } = {
            // "resource <name> <index>" (only for multi-index resources)
            match: /^(\s*resource\s+(\w+)\s+)(\d*)$/i,
            index: 3,
            savedTerm: "",
            context(text) {
                const m = /^\s*resource\s+(\w+)\s/i.exec(text);
                return !!m && (cache.resourcesCount[m[1].toUpperCase()] || 0) > 1;
            },
            search(term, match) {
                sendOnEnter.value = false;
                this.savedTerm = term;
                return [`<1-${cache.resourcesCount[match[2].toUpperCase()]}>`];
            },
            template: (value) => value,
            replace() {
                if (this.savedTerm) {
                    openLaterRequested = true;
                    return "$1$3 ";
                }
                return null;
            },
        };

        strategies = [
            {
                // "command"
                match: /^(\s*)(\w*)$/,
                index: 2,
                search(term) {
                    sendOnEnter.value = false;
                    return searchArray(term, cache.commands, false, true, forceOpen.value, visible.value);
                },
                template: highlightPrefix,
                replace: (value) => `$1${value} `,
            },
            {
                // "get <setting>"
                match: /^(\s*get\s+)(\w*)$/i,
                index: 2,
                search(term) {
                    sendOnEnter.value = true;
                    let arr = searchArray(term, cache.settings, 3, false, forceOpen.value, visible.value);
                    if (term.length > 0 && arr.length > 1) {
                        arr = [term, ...arr];
                    }
                    return arr;
                },
                template: highlightAnywhere,
                replace: (value) => `$1${value} `,
            },
            {
                // "set <setting>"
                match: /^(\s*set\s+)(\w*)$/i,
                index: 2,
                search(term) {
                    sendOnEnter.value = false;
                    return searchArray(term, cache.settings, 3, false, forceOpen.value, visible.value);
                },
                template: highlightAnywhere,
                replace: (value) => `$1${value} `,
            },
            {
                // "set <setting> " -> suggest "="
                match: /^(\s*set\s+\w+\s*)$/i,
                index: 1,
                search() {
                    sendOnEnter.value = false;
                    return ["="];
                },
                template: highlightAnywhere,
                replace(value) {
                    openLaterRequested = true;
                    return `$1${value} `;
                },
            },
            settingValueStrategy,
            {
                // "resource <name>"
                match: /^(\s*resource\s+)(\w*)$/i,
                index: 2,
                search(term) {
                    sendOnEnter.value = false;
                    let arr = cache.resources;
                    if (semver.gte(fcStore.CONFIG.flightControllerVersion, "4.0.0")) {
                        arr = ["show", ...arr];
                    } else {
                        arr = ["list", ...arr];
                    }
                    return searchArray(term, arr, 1, false, forceOpen.value, visible.value);
                },
                template: highlightAnywhere,
                replace(value) {
                    if (value in cache.resourcesCount) {
                        openLaterRequested = true;
                    } else if (value === "list" || value === "show") {
                        openLaterRequested = true;
                        sendOnEnter.value = true;
                    }
                    return `$1${value} `;
                },
            },
            resourceIndexStrategy,
            {
                // "resource <name> [<index>] <pin|none>"
                match: /^(\s*resource\s+\w+\s+(\d+\s+)?)(\w*)$/i,
                index: 3,
                context(text) {
                    const m = /^\s*resource\s+(\w+)\s+(\d+\s)?/i.exec(text);
                    if (m) {
                        const count = cache.resourcesCount[m[1].toUpperCase()] || 0;
                        return !!count && (!!m[2] || count === 1);
                    }
                    return false;
                },
                search(term) {
                    sendOnEnter.value = !!term;
                    if (term) {
                        return "none".startsWith(term.toLowerCase()) ? ["none"] : ["<pin>"];
                    }
                    return ["<pin>", "none"];
                },
                template(value, term) {
                    return value === "none" ? highlightPrefix(value, term) : value;
                },
                replace(value) {
                    if (value === "none") {
                        sendOnEnter.value = true;
                        return "$1none ";
                    }
                    return null;
                },
            },
            {
                // "feature|beeper [-]<name>"
                match: /^(\s*(feature|beeper)\s+(-?))(\w*)$/i,
                index: 4,
                search(term, match) {
                    sendOnEnter.value = !!term;
                    let arr = cache[match[2].toLowerCase() as "feature" | "beeper"];
                    if (!match[3]) {
                        arr = ["-", "list", ...arr];
                    }
                    return searchArray(term, arr, 1, false, forceOpen.value, visible.value);
                },
                template: highlightAnywhere,
                replace(value) {
                    if (value === "-") {
                        openLaterRequested = true;
                        return "$1-";
                    }
                    return `$1${value} `;
                },
            },
            {
                // "mixer <name>"
                match: /^(\s*mixer\s+)(\w*)$/i,
                index: 2,
                search(term) {
                    sendOnEnter.value = true;
                    return searchArray(term, cache.mixers, 1, false, forceOpen.value, visible.value);
                },
                template: highlightAnywhere,
                replace: (value) => `$1${value} `,
            },
            {
                // "resource show all"
                match: /^(\s*resource\s+show\s+)(\w*)$/i,
                index: 2,
                search(term) {
                    sendOnEnter.value = true;
                    return searchArray(term, ["all"], 1, true, forceOpen.value, visible.value);
                },
                template: highlightPrefix,
                replace: (value) => `$1${value} `,
            },
            {
                // "diff <arg1>"
                match: /^(\s*diff\s+)(\w*)$/i,
                index: 2,
                search(term) {
                    sendOnEnter.value = true;
                    return searchArray(term, diffArgs1, 1, true, forceOpen.value, visible.value);
                },
                template: highlightPrefix,
                replace: (value) => `$1${value} `,
            },
            {
                // "diff <arg1> <arg2>"
                match: /^(\s*diff\s+\w+\s+)(\w*)$/i,
                index: 2,
                search(term) {
                    sendOnEnter.value = true;
                    return searchArray(term, diffArgs2, 1, true, forceOpen.value, visible.value);
                },
                template: highlightPrefix,
                replace: (value) => `$1${value} `,
            },
        ];
    }

    /**
     * Evaluate strategies against the current input and populate the dropdown.
     */
    function update(inputText: string, cursorPos?: number) {
        if (!CliAutoComplete.isEnabled() || CliAutoComplete.isBuilding()) {
            hide();
            return;
        }

        // Lazy init: if cache is ready but strategies haven't been built yet
        // (e.g. build:stop event was missed), initialize them now
        if (!strategies.length) {
            initStrategies();
            if (!strategies.length) {
                hide();
                return;
            }
        }

        cursorPos ??= inputText.length;

        // Only autocomplete if cursor is at end of word
        if (!isAtWordEnd(inputText, cursorPos)) {
            hide();
            return;
        }

        for (const strategy of strategies) {
            // Check context if strategy has one
            if (strategy.context && !strategy.context(inputText)) {
                continue;
            }

            const match = strategy.match.exec(inputText);
            if (!match) {
                continue;
            }

            const term = match[strategy.index] || "";
            const results = strategy.search(term, match);

            if (results.length > 0) {
                matchedStrategy = strategy;
                matchedGroups = match;
                items.value = results.map((value) => ({
                    text: value,
                    html: strategy.template(value, term),
                }));
                activeIndex.value = 0;
                updateCaretPosition();
                visible.value = true;
                return;
            }
        }

        hide();
    }

    /**
     * Select an item from the dropdown and apply the replacement.
     */
    function selectItem(index: number) {
        if (!matchedStrategy || !matchedGroups || index < 0 || index >= items.value.length) {
            return;
        }

        const value = items.value[index].text;
        openLaterRequested = false;

        const replacementPattern = matchedStrategy.replace(value);
        if (replacementPattern === null || replacementPattern === undefined) {
            hide();
            return;
        }

        const newValue = applyReplacement(replacementPattern, matchedGroups);

        if (inputSetter) {
            inputSetter(newValue);
        }

        hide();

        if (openLaterRequested) {
            nextTick(() => {
                forceOpen.value = true;
                update(inputGetter ? inputGetter() : newValue);
                forceOpen.value = false;
            });
        }
    }

    /**
     * Force-open the dropdown (triggered by Tab).
     * If there's exactly one match, auto-select it.
     */
    function openForced(inputText: string) {
        forceOpen.value = true;
        update(inputText);
        forceOpen.value = false;

        if (items.value.length === 1) {
            selectItem(0);
        }
    }

    function navigateUp() {
        if (activeIndex.value > 0) {
            activeIndex.value--;
        }
    }

    function navigateDown() {
        if (activeIndex.value < items.value.length - 1) {
            activeIndex.value++;
        }
    }

    function hide() {
        visible.value = false;
        items.value = [];
        matchedStrategy = null;
        matchedGroups = null;
    }

    function isOpen() {
        return visible.value;
    }

    return {
        visible,
        items,
        activeIndex,
        sendOnEnter,
        forceOpen,
        caretLeft,
        connect,
        initStrategies,
        update,
        selectItem,
        openForced,
        navigateUp,
        navigateDown,
        hide,
        isOpen,
    };
}
