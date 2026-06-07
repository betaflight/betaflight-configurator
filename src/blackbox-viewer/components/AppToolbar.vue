<template>
    <!-- Single top bar: open file + current log name on the left; exports + settings on the right -->
    <div class="toolbar-bar">
        <div class="toolbar-group toolbar-group--start">
            <LogFileInput size="xs" label="Open log file" @files-selected="$emit('files-selected', $event)" />
            <span v-if="appStore.logFilename" class="toolbar-filename" :title="appStore.logFilename">
                {{ appStore.logFilename }}
            </span>
        </div>

        <div class="toolbar-group">
            <template v-if="logStore.hasLog">
                <UButton
                    variant="ghost"
                    color="neutral"
                    label="CSV"
                    icon="i-lucide-file-spreadsheet"
                    size="xs"
                    @click="$emit('export-csv')"
                />
                <UButton
                    variant="ghost"
                    color="neutral"
                    label="GPX"
                    icon="i-lucide-map-pin"
                    size="xs"
                    @click="$emit('export-gpx')"
                />
                <USeparator orientation="vertical" class="h-4" />
            </template>
            <UButton
                variant="ghost"
                color="neutral"
                icon="i-lucide-settings"
                size="xs"
                title="User Settings"
                @click="$emit('open-settings')"
            />
            <UButton
                variant="ghost"
                color="neutral"
                icon="i-lucide-keyboard"
                size="xs"
                title="Keyboard Shortcuts"
                @click="$emit('open-keys')"
            />
        </div>
    </div>
</template>

<script setup>
import { useLogStore } from "../stores/log.js";
import { useAppStore } from "../stores/app.js";
import LogFileInput from "./LogFileInput.vue";

defineEmits(["files-selected", "export-csv", "export-gpx", "open-settings", "open-keys"]);

const logStore = useLogStore();
const appStore = useAppStore();
</script>

<style scoped>
.toolbar-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.3rem 0.75rem;
    background: var(--surface-100);
    border-bottom: 1px solid var(--surface-300);
}

.toolbar-group {
    display: flex;
    align-items: center;
    gap: 0.4rem;
}

.toolbar-group--start {
    min-width: 0;
}

.toolbar-filename {
    font-size: 0.75rem;
    color: var(--text-secondary);
    max-width: 360px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
</style>
