<template>
    <div
        v-show="graphStore.hasConfigOverlay"
        class="fixed top-[135px] left-[15px] right-[15px] bottom-[80px] flex flex-col bg-default border border-default rounded-lg shadow-lg overflow-hidden"
    >
        <div class="flex items-center gap-3 px-4 py-2 border-b border-default shrink-0">
            <h4 class="flex-1 font-semibold truncate">{{ graphStore.configFileName }}</h4>
            <UInput v-model="filter" icon="i-lucide-search" placeholder="Filter..." size="xs" class="w-48" />
            <UButton
                variant="outline"
                color="neutral"
                icon="i-lucide-x"
                label="Close"
                size="xs"
                @click="graphStore.hasConfigOverlay = false"
            />
        </div>

        <div class="overflow-y-auto flex-1 p-4 font-mono text-xs">
            <div
                v-for="(line, i) in filteredLines"
                :key="i"
                class="py-0.5 border-b border-default"
                :class="line.empty ? 'h-3' : ''"
            >
                <span v-if="line.before != null" v-html="highlightHtml(line)"></span>
                <template v-else>{{ line.text }}</template>
            </div>
            <p v-if="filteredLines.length === 0" class="text-dimmed py-4 text-center">No matching lines</p>
        </div>
    </div>
</template>

<script setup>
import { ref, computed } from "vue";
import { useGraphStore } from "../stores/graph.js";

const graphStore = useGraphStore();
const filter = ref("");

function escapeHtml(str) {
    return str.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function highlightHtml(line) {
    return `${escapeHtml(line.before)}<b class="text-highlighted">${escapeHtml(line.match)}</b>${escapeHtml(line.after)}`;
}

const filteredLines = computed(() => {
    const lines = graphStore.configLines;
    if (!lines.length) {
        return [];
    }

    if (!filter.value) {
        return lines.map((text) => ({
            text,
            empty: text.length === 0,
        }));
    }

    let regex;
    try {
        regex = new RegExp(`(.*)(${filter.value})(.*)`, "i");
    } catch {
        return [];
    }

    const result = [];
    for (const text of lines) {
        const m = text.match(regex);
        if (m) {
            result.push({ before: m[1], match: m[2], after: m[3] });
        }
    }
    return result;
});
</script>
