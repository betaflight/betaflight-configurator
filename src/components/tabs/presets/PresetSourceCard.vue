<template>
    <div>
        <div
            :class="[
                'bg-(--ui-bg-muted) border border-(--ui-border) p-4 shadow-sm rounded mb-1.5',
                selected ? '' : 'cursor-pointer hover:bg-(--ui-bg-elevated) hover:shadow-md',
            ]"
            @click="!selected && emit('select')"
        >
            <div v-if="!selected" class="flex items-center gap-2">
                <img v-if="active" :src="checkIcon" alt="" aria-hidden="true" class="w-[30px] h-[30px]" />
                <span class="text-lg inline-block align-middle">{{ source.name }}</span>
            </div>

            <div v-else>
                <div class="grid grid-cols-[100px_1fr] gap-1.5 items-center">
                    <span class="whitespace-pre pr-2.5 min-w-[100px]">Name</span>
                    <UInput v-model="draft.name" :disabled="source.official" class="w-full" />
                    <span class="whitespace-pre pr-2.5 min-w-[100px]">Url</span>
                    <UInput
                        v-model="draft.url"
                        :disabled="source.official"
                        class="w-full"
                        @update:model-value="handleUrlInput"
                    />
                    <template v-if="showGithubBranch">
                        <span class="whitespace-pre pr-2.5 min-w-[100px]">GitHub branch</span>
                        <UInput v-model="draft.gitHubBranch" :disabled="source.official" class="w-full" />
                    </template>
                </div>

                <div class="flex items-center flex-wrap gap-2 mt-3">
                    <img v-if="active" :src="checkIcon" alt="" aria-hidden="true" class="w-[30px] h-[30px]" />
                    <UButton
                        v-if="!active"
                        :label="$t('presetsSourcesDialogMakeSourceActive')"
                        size="xs"
                        @click="handleActivate"
                    />
                    <UButton
                        v-if="active"
                        :label="$t('presetsSourcesDialogMakeSourceDisable')"
                        variant="outline"
                        size="xs"
                        @click="handleDeactivate"
                    />
                    <div class="ml-auto flex gap-1.5">
                        <UButton
                            v-if="!source.official"
                            :label="$t('presetsSourcesDialogSaveSource')"
                            :disabled="!isDirty"
                            size="xs"
                            @click="handleSave"
                        />
                        <UButton
                            v-if="!source.official"
                            :label="$t('presetsSourcesDialogResetSource')"
                            :disabled="!isDirty"
                            variant="outline"
                            size="xs"
                            @click="resetDraft"
                        />
                        <UButton
                            v-if="!source.official"
                            :label="$t('presetsSourcesDialogDeleteSource')"
                            variant="outline"
                            color="error"
                            size="xs"
                            @click="emit('delete')"
                        />
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, reactive, watch } from "vue";
import PresetSource from "./SourcesDialog/PresetSource";
import checkIcon from "@/images/icons/cf_icon_check_orange.svg";

const props = defineProps({
    source: {
        type: Object,
        required: true,
    },
    selected: {
        type: Boolean,
        default: false,
    },
    active: {
        type: Boolean,
        default: false,
    },
});

const emit = defineEmits(["select", "save", "activate", "deactivate", "delete"]);

const draft = reactive({
    name: "",
    url: "",
    gitHubBranch: "",
});

const showGithubBranch = computed(() => PresetSource.isUrlGithubRepo(draft.url ?? ""));
const isDirty = computed(
    () =>
        draft.name !== props.source.name ||
        draft.url !== props.source.url ||
        draft.gitHubBranch !== (props.source.gitHubBranch ?? ""),
);

watch(
    () => props.source,
    (source) => {
        draft.name = source.name;
        draft.url = source.url;
        draft.gitHubBranch = source.gitHubBranch ?? "";
    },
    { immediate: true, deep: true },
);

watch(
    () => props.selected,
    (selected) => {
        if (selected) {
            resetDraft();
        }
    },
);

function resetDraft() {
    draft.name = props.source.name;
    draft.url = props.source.url;
    draft.gitHubBranch = props.source.gitHubBranch ?? "";
}

function normalizedDraft() {
    return {
        name: draft.name,
        url: draft.url,
        gitHubBranch: showGithubBranch.value && draft.gitHubBranch ? draft.gitHubBranch : undefined,
        official: props.source.official,
    };
}

function handleUrlInput() {
    if (PresetSource.containsBranchName(draft.url)) {
        draft.gitHubBranch = PresetSource.getBranchName(draft.url) ?? draft.gitHubBranch;
        draft.url = draft.url.split("/tree/")[0];
        return;
    }

    draft.gitHubBranch = "";
}

function handleSave() {
    if (isDirty.value) {
        emit("save", normalizedDraft());
    }
}

function handleActivate() {
    emit("save", normalizedDraft());
    emit("activate");
}

function handleDeactivate() {
    emit("save", normalizedDraft());
    emit("deactivate");
}
</script>
