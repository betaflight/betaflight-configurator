<template>
    <div class="cli-autocomplete" v-if="visible">
        <ul class="cli-textcomplete-dropdown">
            <li
                v-for="(item, idx) in suggestions"
                :key="idx"
                :class="{ active: idx === selectedIndex }"
                @mousedown.prevent="applySuggestion(idx)"
            >
                <a v-html="highlight(item, term)" href="#" @click.prevent></a>
            </li>
        </ul>
    </div>
</template>

<script>
import { defineComponent, reactive, onBeforeUnmount, nextTick, watch } from "vue";
import { useCliAutocompleteStore } from "../../stores/cliAutocomplete";
import { useFlightControllerStore } from "../../stores/fc";

export default defineComponent({
    name: "CliAutocomplete",
    props: {
        textareaRef: {
            type: Object,
            required: false,
            default: null,
            validator: (v) => v === null || typeof v === "object",
        },
    },
    // Use Pinia store for cache and FC config instead of receiving them as props
    emits: ["apply", "send"],
    setup(props, { emit }) {
        const state = reactive({
            suggestions: [],
            visible: false,
            selectedIndex: 0,
            term: "",
            sendOnEnter: false,
            forceOpen: false,
        });

        // Pinia stores
        const store = useCliAutocompleteStore();
        const fcStore = useFlightControllerStore();

        // Ensure store has the latest cache from legacy module (if any)
        try {
            store.syncFromCli();
        } catch (e) {}

        // Simple highlighter
        function highlight(value, term) {
            if (!term) return value;
            const re = new RegExp(`(${term.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")})`, "ig");
            return value.replace(re, "<b>$1</b>");
        }

        // Ported strategy definitions (limited but compatible)
        const strategies = [
            {
                id: "command",
                match: /^\s*(\w*)$/,
                search(term, cb) {
                    state.sendOnEnter = false;
                    const arr = store.cache?.commands || [];
                    cb(filterMatches(arr, term, true));
                },
                replace(value, match) {
                    return `$1${value} `;
                },
            },
            {
                id: "get",
                match: /^(\s*get\s+)(\w*)$/i,
                search(term, cb) {
                    state.sendOnEnter = true;
                    const arr = store.cache?.settings || [];
                    cb(filterMatches(arr, term, false));
                },
            },
            {
                id: "set",
                match: /^(\s*set\s+)(\w*)$/i,
                search(term, cb) {
                    state.sendOnEnter = false;
                    const arr = store.cache?.settings || [];
                    cb(filterMatches(arr, term, false));
                },
            },
            {
                id: "setEquals",
                match: /^(\s*set\s+\w*\s*)$/i,
                search(term, cb) {
                    state.sendOnEnter = false;
                    cb(["="]);
                },
                replace(value, match) {
                    nextTick(() => openLater(props.textareaRef));
                    return `$1${value} `;
                },
            },
            {
                id: "resource",
                match: /^(\s*resource\s+)(\w*)$/i,
                search(term, cb) {
                    state.sendOnEnter = false;
                    let arr = store.cache?.resources || [];
                    const v =
                        (fcStore.config && fcStore.config.apiVersion) ||
                        (fcStore.config && fcStore.config.flightControllerVersion) ||
                        "0.0.0";
                    const is4p = (function () {
                        try {
                            return String(v).split(".")[0] >= 4;
                        } catch (e) {
                            return false;
                        }
                    })();
                    arr = (is4p ? ["show"] : ["list"]).concat(arr);
                    cb(filterMatches(arr, term, false));
                },
                replace(value, match) {
                    nextTick(() => openLater(props.textareaRef));
                    return `$1${value} `;
                },
            },
            {
                id: "resourceIndex",
                match: /^(\s*resource\s+(\w+)\s+)(\d*)$/i,
                search(term, cb, match) {
                    const count = store.cache?.resourcesCount?.[match[2].toUpperCase()] || 0;
                    cb([`<1-${count}>`]);
                },
                replace() {
                    nextTick(() => openLater(props.textareaRef));
                    return "$1$3 ";
                },
            },
            {
                id: "resourcePin",
                match: /^(\s*resource\s+\w+\s+(\d*\s+)?)(\w*)$/i,
                search(term, cb) {
                    state.sendOnEnter = !!term;
                    if (term) {
                        if ("none".startsWith(term)) cb(["none"]);
                        else cb(["<pin>"]);
                    } else cb(["<pin>", "none"]);
                },
                replace(value) {
                    if (value === "none") {
                        state.sendOnEnter = true;
                        return "$1none ";
                    }
                    return undefined;
                },
            },
            {
                id: "feature",
                match: /^(\s*(feature|beeper)\s+(-?))(\w*)$/i,
                search(term, cb, match) {
                    state.sendOnEnter = !!term;
                    let arr = store.cache?.[match[2].toLowerCase()] || [];
                    if (!match[3]) arr = ["-", "list"].concat(arr);
                    cb(filterMatches(arr, term, false));
                },
                replace(value) {
                    if (value === "-") {
                        nextTick(() => openLater(props.textareaRef, true));
                        return "$1-";
                    }
                    return `$1${value} `;
                },
            },
            {
                id: "mixer",
                match: /^(\s*mixer\s+)(\w*)$/i,
                search(term, cb) {
                    state.sendOnEnter = true;
                    const arr = store.cache?.mixers || [];
                    cb(filterMatches(arr, term, false));
                },
            },
            // other strategies (diff etc.) could be added similarly
        ];

        function filterMatches(arr, term, prefix) {
            if (!term) return arr.slice();
            const t = term.toLowerCase();
            return arr.filter((v) => (prefix ? v.toLowerCase().startsWith(t) : v.toLowerCase().indexOf(t) !== -1));
        }

        function openLater(ref, focus) {
            // small helper to keep UI consistent with original behaviour
            try {
                if (ref && ref.value) {
                    ref.value.focus();
                }
            } catch (e) {}
        }

        function tryOpen(force = false) {
            const el = props.textareaRef.value;
            if (!el) return;
            const text = el.value || "";

            // find first matching strategy
            for (let s of strategies) {
                const m = s.match.exec(text);
                if (m) {
                    // compute term from captured group, by convention it's the last capturing group used as the input
                    let term = m[2] !== undefined ? m[2] : m[1] !== undefined ? m[1] : "";
                    // trim leading whitespace for some patterns
                    if (typeof term === "string") term = term.replace(/^\s+/, "");

                    state.term = term;
                    // call strategy.search (some expect match arg)
                    s.search(
                        term,
                        function (arr) {
                            state.suggestions = arr || [];
                            state.visible = state.suggestions.length > 0;
                            state.selectedIndex = 0;

                            // single-match fallback when force requested
                            if (force && state.suggestions.length === 1) {
                                applyReplacement(state.suggestions[0], s, m);
                            }
                        },
                        m,
                    );

                    return; // only first matching strategy runs
                }
            }

            // no matching strategy
            state.visible = false;
            state.suggestions = [];
        }

        function applyReplacement(value, strategy, match) {
            if (!strategy) return;
            const el = props.textareaRef && props.textareaRef.value;
            if (!el) return;

            // call replace() if defined to let it mutate sendOnEnter or do side-effects
            let template = null;
            if (typeof strategy.replace === "function") {
                template = strategy.replace.call(strategy, value, match);
            } else {
                template = `$1${value} `;
            }

            if (template === undefined) {
                // strategy elected to not replace (placeholder)
                return;
            }

            const currentVal = el.value;
            const m = (strategy.match && strategy.match.exec(currentVal)) || [];
            const replacement = template.replace(/\$(\d+)/g, function (_, n) {
                return m[parseInt(n, 10)] || "";
            });

            el.value = replacement;
            try {
                el.selectionStart = el.selectionEnd = replacement.length;
            } catch (e) {}

            // notify parent frameworks
            el.dispatchEvent(new Event("input", { bubbles: true }));

            state.visible = false;
            state.suggestions = [];

            emit("apply", { replacement: replacement, value });

            if (state.sendOnEnter) {
                // emit send so parent can execute
                emit("send");
            }
        }

        function applySuggestion(idx) {
            const val = state.suggestions[idx];
            // find current strategy to pass match
            const el = props.textareaRef.value;
            const text = el ? el.value : "";
            for (let s of strategies) {
                const m = s.match.exec(text);
                if (m) {
                    applyReplacement(val, s, m);
                    return;
                }
            }
        }

        function onKeyDown(e) {
            const el = props.textareaRef.value;
            if (!el) return;

            if (e.key === "Tab") {
                e.preventDefault();
                // force open
                tryOpen(true);
                return;
            }

            if (!state.visible) {
                // nothing to do special
                return;
            }

            if (e.key === "ArrowDown") {
                e.preventDefault();
                state.selectedIndex = (state.selectedIndex + 1) % state.suggestions.length;
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                state.selectedIndex = (state.selectedIndex - 1 + state.suggestions.length) % state.suggestions.length;
            } else if (e.key === "Enter") {
                e.preventDefault();
                const val = state.suggestions[state.selectedIndex];
                applySuggestion(state.selectedIndex);
            }
        }

        function onInput() {
            tryOpen(false);
        }

        // attach/detach handlers when the textarea element becomes available
        let _attachedEl = null;
        function attachListeners(el) {
            if (!el || _attachedEl === el) return;
            detachListeners();
            el.addEventListener("keydown", onKeyDown);
            el.addEventListener("input", onInput);
            el.addEventListener("keyup", onInput);
            _attachedEl = el;
        }

        function detachListeners() {
            if (!_attachedEl) return;
            try {
                _attachedEl.removeEventListener("keydown", onKeyDown);
                _attachedEl.removeEventListener("input", onInput);
                _attachedEl.removeEventListener("keyup", onInput);
            } catch (e) {}
            _attachedEl = null;
        }

        // If the prop already has a value, attach immediately; otherwise watch for it to become available
        watch(
            () => (props.textareaRef ? props.textareaRef.value : null),
            (newEl) => {
                if (newEl) attachListeners(newEl);
            },
            { immediate: true },
        );

        onBeforeUnmount(() => {
            detachListeners();
        });

        return {
            suggestions: state.suggestions,
            visible: state.visible,
            selectedIndex: state.selectedIndex,
            term: state.term,
            highlight,
            applySuggestion,
        };
    },
});
</script>

<style scoped>
.cli-textcomplete-dropdown {
    border: 1px solid var(--surface-500);
    background-color: var(--surface-300) !important;
    border-radius: 5px;
    max-height: 50%;
    overflow: auto;
    list-style: none;
    padding: 0;
    margin: 0;
    position: absolute;
    z-index: 1000;
}
.cli-textcomplete-dropdown li {
    padding: 2px 5px;
}
.cli-textcomplete-dropdown .active {
    background-color: var(--surface-600);
}
.cli-textcomplete-dropdown a {
    font-family: monospace;
    display: block;
    color: inherit;
    text-decoration: none;
}
.cli-textcomplete-dropdown a b {
    font-weight: 700;
}
</style>
