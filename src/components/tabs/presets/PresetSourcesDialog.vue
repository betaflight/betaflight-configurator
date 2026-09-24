<template>
    <UModal :open="open" :ui="{ content: 'w-[600px] max-w-[calc(100vw-2rem)] h-[520px]' }" @update:open="onOpenChange">
        <template #title>
            <span v-html="$t('presetsSourcesDialogTitle')"></span>
        </template>
        <template #body>
            <UiBox type="warning" highlight class="mb-3">
                <span v-html="$t('presets_sources_dialog_warning')"></span>
            </UiBox>
            <div>
                <PresetSourceCard
                    v-for="source in sources"
                    :key="source.id"
                    :source="source"
                    :selected="selectedSourceId === source.id"
                    :active="activeSourceIds.includes(source.id)"
                    @select="selectedSourceId = source.id"
                    @save="emit('save-source', source.id, $event)"
                    @delete="emit('delete-source', source.id)"
                    @activate="emit('activate-source', source.id)"
                    @deactivate="emit('deactivate-source', source.id)"
                />
            </div>
        </template>
        <template #footer>
            <div class="flex gap-2 justify-end w-full">
                <UButton :label="$t('presetsSourcesDialogAddNew')" variant="outline" @click="handleAddSource" />
                <UButton :label="$t('OK')" @click="emit('close')" />
            </div>
        </template>
    </UModal>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import type { PropType } from "vue";
import UiBox from "@/components/elements/UiBox.vue";
import PresetSourceCard from "./PresetSourceCard.vue";

interface PresetSource {
    id: string;
    [key: string]: unknown;
}

const props = defineProps({
    open: {
        type: Boolean,
        default: false,
    },
    sources: {
        type: Array as PropType<PresetSource[]>,
        default: () => [],
    },
    activeSourceIds: {
        type: Array as PropType<string[]>,
        default: () => [],
    },
});

// Typed rather than a string array: the array form carries no payload types, so a handler
// bound to one of these is checked against nothing. That is how a `sourceId: string` came to
// be annotated as a numeric index in PresetsTab and typechecked clean anyway.
const emit = defineEmits<{
    close: [];
    "add-source": [];
    "save-source": [sourceId: string, source: Record<string, unknown>];
    "delete-source": [sourceId: string];
    "activate-source": [sourceId: string];
    "deactivate-source": [sourceId: string];
}>();

const selectedSourceId = ref("");

watch(
    () => props.open,
    (isOpen) => {
        if (isOpen) {
            selectedSourceId.value = props.activeSourceIds[0] ?? props.sources[0]?.id ?? "";
        }
    },
    { immediate: true },
);

watch(
    () => props.sources.map((source) => source.id),
    (sourceIds, previousSourceIds = []) => {
        const addedSourceId = sourceIds.find((sourceId) => !previousSourceIds.includes(sourceId));

        if (addedSourceId) {
            selectedSourceId.value = addedSourceId;
        } else if (!sourceIds.includes(selectedSourceId.value)) {
            selectedSourceId.value = sourceIds[0] ?? "";
        }
    },
);

function onOpenChange(value: boolean) {
    if (!value && props.open) {
        emit("close");
    }
}

function handleAddSource() {
    emit("add-source");
}
</script>
