<template>
    <dialog id="presets_sources_dialog" ref="dialogRef" @close="emit('close')" @cancel.prevent="emit('close')">
        <div id="presets_sources_dialog_content_wrapper">
            <div id="presets_sources_dialog_content">
                <div class="presets_sources_dialog_title_panel" v-html="$t('presetsSourcesDialogTitle')"></div>
                <div class="presets_sources_dialog_scrollable">
                    <div class="note" v-html="$t('presets_sources_dialog_warning')"></div>
                    <div class="presets_sources_dialog_sources">
                        <PresetSourceCard
                            v-for="(source, index) in sources"
                            :key="`${source.name}-${index}`"
                            :source="source"
                            :selected="selectedIndex === index"
                            :active="activeIndexes.includes(index)"
                            @select="selectedIndex = index"
                            @save="emit('save-source', index, $event)"
                            @delete="emit('delete-source', index)"
                            @activate="emit('activate-source', index)"
                            @deactivate="emit('deactivate-source', index)"
                        />
                    </div>
                </div>
            </div>

            <div class="content_toolbar">
                <div class="btn">
                    <a
                        id="presets_sources_dialog_close"
                        href="#"
                        class="tool regular-button"
                        @click.prevent="emit('close')"
                        >{{ $t("OK") }}</a
                    >
                    <a
                        id="presets_sources_dialog_add_new"
                        href="#"
                        class="tool regular-button"
                        @click.prevent="handleAddSource"
                        >{{ $t("presetsSourcesDialogAddNew") }}</a
                    >
                </div>
            </div>
        </div>
    </dialog>
</template>

<script setup>
import { nextTick, ref, watch } from "vue";
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
    activeIndexes: {
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
const selectedIndex = ref(0);

watch(
    () => props.open,
    async (isOpen) => {
        await nextTick();

        if (!dialogRef.value) {
            return;
        }

        if (isOpen && !dialogRef.value.open) {
            selectedIndex.value = props.activeIndexes[0] ?? 0;
            dialogRef.value.showModal();
        } else if (!isOpen && dialogRef.value.open) {
            dialogRef.value.close();
        }
    },
    { immediate: true },
);

watch(
    () => props.sources.length,
    (length, oldLength) => {
        if (length > oldLength) {
            selectedIndex.value = length - 1;
        } else if (selectedIndex.value >= length) {
            selectedIndex.value = Math.max(0, length - 1);
        }
    },
);

function handleAddSource() {
    emit("add-source");
}
</script>

<style lang="less">
#presets_sources_dialog {
    width: 600px;
    height: 520px;
    padding: 12px;
}

.presets_sources_dialog_title_panel {
    padding-bottom: 0.5ex;
    border-bottom: 1px solid var(--primary-500);
    margin-bottom: 2ex;
    font-size: 1.5em;
    font-weight: bold;
}

.presets_sources_dialog_scrollable {
    height: 430px;
    overflow-y: auto;
    overflow-x: hidden;
}

@media all and (max-width: 575px) {
    #presets_sources_dialog_content_wrapper .content_toolbar {
        position: fixed;
    }

    .presets_sources_dialog_scrollable {
        overflow-y: auto;
        overflow-x: hidden;
        padding-bottom: 51px;
        height: unset;
    }
}
</style>
