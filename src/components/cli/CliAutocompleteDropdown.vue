<template>
    <ul v-show="visible" ref="dropdownRef" class="cli-autocomplete-dropdown">
        <li
            v-for="(item, index) in items"
            :key="index"
            :class="{ active: index === activeIndex }"
            @click="$emit('select', index)"
            @mousemove="$emit('hover', index)"
            v-html="item.html"
        ></li>
    </ul>
</template>

<script setup>
import { ref, watch } from "vue";

const props = defineProps({
    items: { type: Array, default: () => [] },
    visible: { type: Boolean, default: false },
    activeIndex: { type: Number, default: 0 },
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
    left: 0;
    right: 0;
    border: 1px solid var(--surface-500);
    background-color: var(--surface-300);
    border-radius: 5px;
    max-height: 50vh;
    overflow: auto;
    list-style: none;
    padding: 0;
    margin: 0 0 4px 0;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    z-index: 100;
}

.cli-autocomplete-dropdown::-webkit-scrollbar {
    width: 6px;
}

.cli-autocomplete-dropdown::-webkit-scrollbar-track {
    background: var(--surface-400);
    border-radius: 3px;
}

.cli-autocomplete-dropdown::-webkit-scrollbar-thumb {
    background: var(--surface-600);
    border-radius: 3px;
}

.cli-autocomplete-dropdown li {
    padding: 2px 5px;
    color: var(--text);
    font-family: monospace;
    cursor: pointer;
}

.cli-autocomplete-dropdown li.active {
    background-color: var(--surface-600);
    color: var(--text);
}

.cli-autocomplete-dropdown li :deep(b) {
    font-family: monospace;
    font-weight: bold;
    color: var(--text);
}
</style>
