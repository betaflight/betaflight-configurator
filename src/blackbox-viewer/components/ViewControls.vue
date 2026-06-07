<template>
    <!-- View panel -->
    <div class="toolbar-panel log-view-panel">
        <h4>View</h4>
        <div class="flex items-center gap-0.5">
            <UButton
                variant="ghost"
                color="neutral"
                icon="i-lucide-home"
                size="xs"
                aria-label="View graph"
                title="View graph"
                @click="$emit('view-config')"
            />
            <UButton
                variant="ghost"
                :color="headerActive ? 'primary' : 'neutral'"
                icon="i-lucide-info"
                size="xs"
                :aria-label="headerActive ? 'Hide log header' : 'Show log header'"
                :aria-pressed="headerActive"
                title="Log header (H)"
                @click="$emit('toggle-header')"
            />
            <UButton
                variant="ghost"
                :color="tableActive ? 'primary' : 'neutral'"
                icon="i-lucide-table"
                size="xs"
                :aria-label="tableActive ? 'Hide table' : 'Show table'"
                :aria-pressed="tableActive"
                title="Table (T)"
                @click="$emit('toggle-table')"
            />
        </div>
    </div>
    <!-- Overlay panel -->
    <div class="toolbar-panel log-overlay-panel">
        <h4>Overlay</h4>
        <div class="flex items-center gap-0.5">
            <UButton
                variant="ghost"
                :color="videoActive ? 'primary' : 'neutral'"
                icon="i-lucide-film"
                size="xs"
                :aria-label="videoActive ? 'Hide video' : 'Show video'"
                :aria-pressed="videoActive"
                title="Video"
                @click="$emit('toggle-video')"
            />
            <UButton
                variant="ghost"
                :color="craftActive ? 'primary' : 'neutral'"
                icon="i-lucide-plane"
                size="xs"
                :aria-label="craftActive ? 'Hide craft' : 'Show craft'"
                :aria-pressed="craftActive"
                title="Craft"
                @click="$emit('toggle-craft')"
            />
            <UButton
                variant="ghost"
                :color="sticksActive ? 'primary' : 'neutral'"
                icon="i-lucide-gamepad-2"
                size="xs"
                :aria-label="sticksActive ? 'Hide sticks' : 'Show sticks'"
                :aria-pressed="sticksActive"
                title="Sticks"
                @click="$emit('toggle-sticks')"
            />
            <UButton
                variant="ghost"
                :color="analyserActive ? 'primary' : 'neutral'"
                icon="i-lucide-bar-chart-3"
                size="xs"
                :aria-label="analyserActive ? 'Hide analyser' : 'Show analyser'"
                :aria-pressed="analyserActive"
                title="Analyser (A)"
                @click="$emit('toggle-analyser')"
            />
            <UButton
                variant="ghost"
                :color="mapActive ? 'primary' : 'neutral'"
                icon="i-lucide-map-pin"
                size="xs"
                :aria-label="mapActive ? 'Hide map' : 'Show map'"
                :aria-pressed="mapActive"
                title="Map"
                @click="$emit('toggle-map')"
            />
        </div>
    </div>
</template>

<script setup>
defineProps({
    headerActive: { type: Boolean, default: false },
    tableActive: { type: Boolean, default: false },
    videoActive: { type: Boolean, default: false },
    craftActive: { type: Boolean, default: false },
    sticksActive: { type: Boolean, default: false },
    analyserActive: { type: Boolean, default: false },
    mapActive: { type: Boolean, default: false },
});

defineEmits([
    "view-config",
    "toggle-header",
    "toggle-table",
    "toggle-video",
    "toggle-craft",
    "toggle-sticks",
    "toggle-analyser",
    "toggle-map",
]);
</script>
