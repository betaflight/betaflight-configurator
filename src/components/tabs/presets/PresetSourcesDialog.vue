<template>
    <UModal
        :open="open"
        :ui="{ overlay: 'z-3000', content: 'w-[600px] max-w-[calc(100vw-2rem)] h-[520px] z-3001' }"
        @update:open="onOpenChange"
    >
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

<script setup>
import { ref, watch } from "vue";
import UiBox from "@/components/elements/UiBox.vue";
import PresetSourceCard from "./PresetSourceCard.vue";

const props = defineProps({
    open: {
        type: Boolean,
        default: false,
    },
    sources: {
        type: Array,
        default: () => [],
    },
    activeSourceIds: {
        type: Array,
        default: () => [],
    },
});

const emit = defineEmits([
    "close",
    "add-source",
    "save-source",
    "delete-source",
    "activate-source",
    "deactivate-source",
]);

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

function onOpenChange(value) {
    if (!value && props.open) {
        emit("close");
    }
}

function handleAddSource() {
    emit("add-source");
}
</script>
