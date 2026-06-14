<template>
    <div class="toolbar-panel log-workspace-panel">
        <h4>Workspace</h4>

        <UDropdownMenu :items="workspaceItems" class="w-full">
            <UButton
                variant="outline"
                color="neutral"
                size="xs"
                block
                class="justify-between font-mono"
                trailing-icon="i-lucide-chevron-down"
            >
                <span v-if="activeEntry" class="flex items-center gap-1 truncate">
                    <span class="opacity-50">{{ workspaceStore.activeWorkspace }}</span>
                    <span class="truncate">{{ activeEntry.title }}</span>
                </span>
                <span v-else class="opacity-50">No workspace</span>
            </UButton>

            <template #ws-trailing="{ item }">
                <UIcon v-if="item.wsActive" name="i-lucide-check" class="size-4 text-green-500" />
                <UButton
                    variant="ghost"
                    color="neutral"
                    size="xs"
                    icon="i-lucide-save"
                    aria-label="Save current graph setup to this workspace"
                    title="Save current graph setup to this workspace"
                    class="opacity-40 hover:opacity-100"
                    @click.stop.prevent="emit('save-workspace', item.wsId, item.wsTitle)"
                />
            </template>
        </UDropdownMenu>
    </div>
</template>

<script setup>
import { computed } from "vue";
import { useWorkspaceStore } from "../stores/workspace.js";

const emit = defineEmits(["switch-workspace", "save-workspace", "apply-default"]);

const workspaceStore = useWorkspaceStore();

const activeEntry = computed(() => {
    const configs = workspaceStore.workspaceGraphConfigs;
    return configs?.[workspaceStore.activeWorkspace] ?? null;
});

const workspaceItems = computed(() => {
    const configs = workspaceStore.workspaceGraphConfigs;
    const wsItems = [];

    for (let index = 1; index < 11; index++) {
        const id = index % 10;
        const entry = configs?.[id];
        const isActive = id === workspaceStore.activeWorkspace;

        wsItems.push({
            slot: "ws",
            label: entry ? `${id}  ${entry.title}` : `${id}  <empty>`,
            disabled: !entry,
            wsId: id,
            wsActive: isActive,
            wsTitle: entry?.title || "Unnamed",
            onSelect() {
                if (entry) {
                    emit("switch-workspace", id);
                }
            },
        });
    }

    const presetItems = [
        {
            label: "Preset: Ctzsnooze",
            icon: "i-lucide-layout-template",
            onSelect() {
                emit("apply-default", 1);
            },
        },
        {
            label: "Preset: SupaflyFPV",
            icon: "i-lucide-layout-template",
            onSelect() {
                emit("apply-default", 2);
            },
        },
    ];

    return [wsItems, presetItems];
});
</script>
