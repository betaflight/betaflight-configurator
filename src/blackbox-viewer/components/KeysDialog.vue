<template>
    <UModal v-model:open="open" :ui="{ content: 'sm:max-w-[95vw] lg:max-w-[1800px]' }">
        <template #header>
            <div class="flex items-center gap-2">
                <UIcon name="i-lucide-keyboard" class="size-5 text-primary" />
                <h4 class="font-semibold">Keyboard Shortcuts</h4>
            </div>
        </template>

        <template #body>
            <div class="keys-grid">
                <div v-for="(col, ci) in layout" :key="ci" class="keys-col">
                    <div v-for="(card, ki) in col" :key="ki" class="keys-card">
                        <div class="keys-card-header">
                            <UIcon :name="card.icon" class="size-3.5 text-primary" />
                            <span>{{ card.title }}</span>
                        </div>
                        <UTable :data="card.data" :columns="columns" :ui="tableUi">
                            <template #keys-cell="{ row }">
                                <span class="whitespace-nowrap">
                                    <kbd v-for="(k, i) in row.original.keys" :key="i" class="keys-kbd">{{ k }}</kbd>
                                </span>
                            </template>
                        </UTable>
                        <p v-if="card.hint" class="keys-hint">{{ card.hint }}</p>
                    </div>
                </div>
            </div>
        </template>

        <template #footer>
            <UButton variant="soft" color="neutral" label="Close" size="sm" @click="open = false" />
        </template>
    </UModal>
</template>

<script setup>
const open = defineModel("open", { type: Boolean, default: false });

const columns = [
    { accessorKey: "keys", header: "Keys" },
    { accessorKey: "action", header: "Action" },
];

const tableUi = {
    thead: "sr-only",
    base: "w-full",
    td: "py-0.5 text-xs",
    tr: "",
};

const layout = [
    [
        {
            icon: "i-lucide-move",
            title: "Navigation",
            data: [
                { keys: ["←", "→"], action: "Move through log by 100ms" },
                { keys: ["Alt", "←", "→"], action: "Move by exactly one frame" },
                { keys: ["PgUp", "PgDn"], action: "Move through log fast" },
                { keys: ["Home", "End"], action: "Jump to start / end of log" },
                { keys: ["Shift", "←", "→"], action: "Zoom in / out" },
                { keys: ["Shift", "Alt", "←", "→"], action: "Zoom in / out faster" },
                { keys: ["Space"], action: "Play / Pause" },
            ],
        },
        {
            icon: "i-lucide-activity",
            title: "Spectrum Analyser",
            data: [
                { keys: ["A"], action: "Toggle analyser display" },
                { keys: ["Shift"], action: "Show frequency under mouse" },
            ],
        },
    ],
    [
        {
            icon: "i-lucide-zap",
            title: "Quick Modes",
            data: [
                { keys: ["Z"], action: "QuickZoom — max zoom and back" },
                { keys: ["S"], action: "QuickSmooth — smoothing to zero" },
                { keys: ["X"], action: "QuickExpo — expo to linear" },
                { keys: ["G"], action: "QuickGrid — hide all grids" },
                { keys: ["T"], action: "Toggle field values table" },
                { keys: ["C"], action: "Toggle configuration dump" },
            ],
        },
        {
            icon: "i-lucide-sliders-horizontal",
            title: "Field Adjustments",
            hint: "Hover over a field in the legend, then use modifier + scroll wheel",
            data: [
                { keys: ["Ctrl", "Scroll"], action: "Adjust smoothing" },
                { keys: ["Shift", "Scroll"], action: "Adjust zoom" },
                { keys: ["Alt", "Scroll"], action: "Adjust expo" },
            ],
        },
    ],
    [
        {
            icon: "i-lucide-crosshair",
            title: "Marking & Sync",
            data: [
                { keys: ["M"], action: "Toggle marker at current time" },
                { keys: ["Alt", "M"], action: "Smart Sync at marker position" },
                { keys: ["I"], action: "Set IN point" },
                { keys: ["O"], action: "Set OUT point" },
            ],
        },
        {
            icon: "i-lucide-bookmark",
            title: "Bookmarks",
            data: [
                { keys: ["Alt", "Shift", "1-9"], action: "Save bookmark" },
                { keys: ["Alt", "1-9"], action: "Recall bookmark" },
                { keys: ["Alt", "0"], action: "Clear all bookmarks" },
                { keys: ["Alt", "S"], action: "Save graph to PNG" },
            ],
        },
    ],
    [
        {
            icon: "i-lucide-layout-grid",
            title: "Workspaces",
            data: [
                { keys: ["0-9"], action: "Recall workspace" },
                { keys: ["Shift", "0-9"], action: "Save to workspace" },
                { keys: ["Shift", "S"], action: "Save to current workspace" },
                { keys: ["Shift", "W"], action: "Load default workspace" },
                { keys: ["Ctrl", "Z"], action: "Toggle last two configs" },
            ],
        },
    ],
];
</script>

<style scoped>
.keys-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 1rem;
    padding: 0.75rem;
}

@media (max-width: 900px) {
    .keys-grid {
        grid-template-columns: repeat(2, 1fr);
    }
}

.keys-col {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
}

.keys-card {
    border: 1px solid var(--ui-border);
    border-radius: 0.5rem;
    padding: 0.6rem 0.75rem;
    background: var(--ui-bg-elevated);
}

.keys-card-header {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-highlighted);
    margin-bottom: 0.5rem;
    padding-bottom: 0.35rem;
    border-bottom: 1px solid var(--ui-border);
}

.keys-kbd {
    display: inline-block;
    padding: 0.05rem 0.35rem;
    margin-right: 0.15rem;
    font-family: ui-monospace, SFMono-Regular, monospace;
    font-size: 0.65rem;
    line-height: 1.5;
    color: var(--text-primary);
    background: var(--ui-bg);
    border: 1px solid var(--ui-border);
    border-bottom-width: 2px;
    border-radius: 0.25rem;
}

.keys-hint {
    margin: 0.35rem 0 0;
    font-size: 0.62rem;
    color: var(--text-dimmed);
    font-style: italic;
}
</style>
