<template>
    <dialog ref="dialogRef" class="w-[600px] h-[520px] p-3" @close="emit('close')" @cancel.prevent="emit('close')">
        <div class="flex flex-col h-full">
            <div
                class="pb-1 border-b border-(--ui-primary) mb-3 text-2xl font-bold"
                v-html="$t('presetsSourcesDialogTitle')"
            ></div>
            <div class="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
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
            </div>

            <div class="content_toolbar mt-auto">
                <div class="flex gap-2 justify-end">
                    <UButton :label="$t('presetsSourcesDialogAddNew')" variant="outline" @click="handleAddSource" />
                    <UButton :label="$t('OK')" @click="emit('close')" />
                </div>
            </div>
        </div>
    </dialog>
</template>

<script setup>
import { nextTick, ref, watch } from "vue";
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

const dialogRef = ref(null);
const selectedSourceId = ref("");

watch(
    () => props.open,
    async (isOpen) => {
        await nextTick();

        if (!dialogRef.value) {
            return;
        }

        if (isOpen && !dialogRef.value.open) {
            selectedSourceId.value = props.activeSourceIds[0] ?? props.sources[0]?.id ?? "";
            dialogRef.value.showModal();
        } else if (!isOpen && dialogRef.value.open) {
            dialogRef.value.close();
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

function handleAddSource() {
    emit("add-source");
}
</script>
