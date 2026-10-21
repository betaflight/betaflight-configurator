<template>
    <ul v-show="visible" ref="dropdownRef" class="cli-autocomplete-dropdown" :style="{ left: caretLeft + 'px' }">
        <li
            v-for="(item, index) in items"
            :key="index"
            :class="{ active: index === activeIndex }"
            @click="$emit('select', index)"
            @mousemove="$emit('hover', index)"
        >
            <a v-html="item.html"></a>
        </li>
    </ul>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import type { PropType } from "vue";

interface AutocompleteItem {
    html: string;
}

// NOTE: `item.html` is rendered with `v-html`. It must remain trusted
// (highlighters only insert <b> tags). Do NOT change the HTML source
// generation without auditing for XSS risks.

const props = defineProps({
    items: { type: Array as PropType<AutocompleteItem[]>, default: () => [] },
    visible: { type: Boolean, default: false },
    activeIndex: { type: Number, default: 0 },
    caretLeft: { type: Number, default: 0 },
});

defineEmits(["select", "hover"]);

const dropdownRef = ref<HTMLUListElement | null>(null);

watch(
    () => props.activeIndex,
    () => {
        const activeEl = dropdownRef.value?.querySelector(".active");
        if (activeEl) {
            activeEl.scrollIntoView({ block: "nearest" });
        }
    },
    { flush: "post" },
);
</script>

<style lang="less">
.cli-autocomplete-dropdown {
    position: absolute;
    bottom: 100%;
    width: fit-content;
    border: 1px solid var(--surface-500);
    background-color: var(--surface-300);
    border-radius: 5px;
    max-height: 50vh;
    overflow: auto;
    list-style: none;
    padding: 0;
    margin: 0;
    z-index: 100;

    &::-webkit-scrollbar {
        width: 6px;
    }

    &::-webkit-scrollbar-track {
        background: lightgrey;
        border-radius: 3px;
    }

    &::-webkit-scrollbar-thumb {
        background: grey;
        border-radius: 3px;
    }

    li {
        padding: 2px 5px;
    }

    li.active {
        background-color: var(--surface-600);
    }

    a {
        font-family: monospace;
        cursor: pointer;
    }

    a b {
        font-family: monospace;
        font-weight: bold;
    }
}
</style>
