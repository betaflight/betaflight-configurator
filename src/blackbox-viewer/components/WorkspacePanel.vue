<template>
    <div class="toolbar-panel log-workspace-panel">
        <h4>Workspace</h4>

        <UDropdownMenu v-model:open="menuOpen" :items="workspaceItems" class="w-full">
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
                    v-if="!item.disabled"
                    variant="ghost"
                    color="neutral"
                    size="xs"
                    icon="i-lucide-pencil"
                    aria-label="Rename this workspace"
                    title="Rename this workspace"
                    class="opacity-40 hover:opacity-100"
                    @click.stop.prevent="openRename(item.wsId, item.wsTitle)"
                />
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

        <UModal v-model:open="renameOpen" :ui="{ content: 'sm:max-w-sm' }">
            <template #header>
                <h4 class="font-semibold">Rename workspace {{ renameId }}</h4>
            </template>

            <template #body>
                <UInput
                    v-model="renameTitle"
                    autofocus
                    placeholder="Workspace name"
                    class="w-full"
                    @keyup.enter="commitRename"
                />
            </template>

            <template #footer>
                <div class="flex justify-end gap-2 w-full">
                    <UButton variant="outline" color="neutral" label="Cancel" @click="renameOpen = false" />
                    <UButton color="primary" label="Rename" :disabled="!renameTitle.trim()" @click="commitRename" />
                </div>
            </template>
        </UModal>
    </div>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { useWorkspaceStore } from "../stores/workspace.js";

const emit = defineEmits(["switch-workspace", "save-workspace", "rename-workspace", "apply-default"]);

const workspaceStore = useWorkspaceStore();

const menuOpen = ref(false);

// Shift+W raises showDefaultMenu (keyboard_handler.js). Open the menu — which is where
// the default workspace presets live — and lower the flag again so a later press re-opens.
watch(
    () => workspaceStore.showDefaultMenu,
    (show) => {
        if (show) {
            menuOpen.value = true;
            workspaceStore.showDefaultMenu = false;
        }
    },
);

const renameOpen = ref(false);
const renameId = ref(null);
const renameTitle = ref("");

function openRename(id, title) {
    renameId.value = id;
    // Offer an empty field rather than making the user clear the "Unnamed" placeholder.
    renameTitle.value = title === "Unnamed" ? "" : title;
    renameOpen.value = true;
}

function commitRename() {
    const title = renameTitle.value.trim();
    if (!title) {
        return;
    }
    emit("rename-workspace", renameId.value, title);
    renameOpen.value = false;
}

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
