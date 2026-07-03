<template>
    <div class="status-bar">
        <div class="flex items-center gap-3">
            <span v-if="appStore.statusVersion" class="status-item">{{ appStore.statusVersion }}</span>
            <span v-if="appStore.statusCells" class="status-item">{{ appStore.statusCells }}</span>
            <span v-if="appStore.statusLooptime" class="status-item">{{ appStore.statusLooptime }}</span>
            <span v-if="appStore.statusLograte" class="status-item">{{ appStore.statusLograte }}</span>
            <span v-if="appStore.statusLograteWarning" class="status-item status-lograte-warning">{{
                appStore.statusLograteWarning
            }}</span>
            <span v-if="appStore.statusFlightMode" class="status-item status-flight-mode">{{
                appStore.statusFlightMode
            }}</span>
        </div>
        <div class="flex items-center gap-2">
            <span v-if="appStore.statusMarkerOffset" class="font-mono text-[10px]">{{
                appStore.statusMarkerOffset
            }}</span>

            <!-- Bookmarks -->
            <template v-for="n in 9" :key="n">
                <UButton
                    v-if="workspaceStore.bookmarkTimes[n - 1] !== undefined"
                    variant="soft"
                    color="primary"
                    size="2xs"
                    :label="String(n)"
                    class="font-mono"
                    @click="$emit('goto-bookmark', n - 1)"
                />
            </template>

            <span v-if="appStore.statusViewerVersion" class="text-[10px] opacity-50">{{
                appStore.statusViewerVersion
            }}</span>
        </div>
    </div>
</template>

<script setup>
import { useAppStore } from "../stores/app.js";
import { useWorkspaceStore } from "../stores/workspace.js";

defineEmits(["goto-bookmark"]);

const appStore = useAppStore();
const workspaceStore = useWorkspaceStore();
</script>

<style scoped>
.status-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 0.75rem;
    height: 1.5rem;
    font-size: 0.65rem;
    color: var(--text-secondary);
    background: var(--surface-200, hsl(0, 0%, 92%));
    border-top: 1px solid var(--border-color, #ccc);
}

:root.dark .status-bar {
    background: var(--surface-100, hsl(0, 0%, 8%));
    border-top-color: var(--surface-800, hsl(0, 0%, 25%));
}

.status-item {
    white-space: nowrap;
}

.status-flight-mode {
    color: var(--color-primary-600, #e69400);
    font-weight: 600;
}

.status-lograte-warning {
    color: var(--error-500);
    font-weight: 600;
}
</style>
