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

<script setup>
import { ref, watch } from "vue";

// NOTE: `item.html` is rendered with `v-html`. It must remain trusted
// (highlighters only insert <b> tags). Do NOT change the HTML source
// generation without auditing for XSS risks.

const props = defineProps({
    items: { type: Array, default: () => [] },
    visible: { type: Boolean, default: false },
    activeIndex: { type: Number, default: 0 },
    caretLeft: { type: Number, default: 0 },
});

defineEmits(["select", "hover"]);

const dropdownRef = ref(null);

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

<style scoped>
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
}

.cli-autocomplete-dropdown::-webkit-scrollbar {
    width: 6px;
}

.cli-autocomplete-dropdown::-webkit-scrollbar-track {
    background: lightgrey;
    border-radius: 3px;
}

.cli-autocomplete-dropdown::-webkit-scrollbar-thumb {
    background: grey;
    border-radius: 3px;
}

.cli-autocomplete-dropdown li {
    padding: 2px 5px;
}

.cli-autocomplete-dropdown li.active {
    background-color: var(--surface-600);
}

.cli-autocomplete-dropdown a {
    font-family: monospace;
    cursor: pointer;
}

.cli-autocomplete-dropdown a :deep(b) {
    font-family: monospace;
    font-weight: bold;
}
</style>
