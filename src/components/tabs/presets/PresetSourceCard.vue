<template>
    <div>
        <div
            :class="[
                'presets_source_panel',
                selected ? 'presets_source_panel_selected' : 'presets_source_panel_not_selected',
            ]"
            @click="!selected && emit('select')"
        >
            <div v-if="!selected" class="presets_source_panel_no_editing">
                <div v-if="active" class="presets_source_panel_no_editing_selected"></div>
                <div class="presets_source_panel_no_editing_name">{{ source.name }}</div>
            </div>

            <div v-else class="presets_source_panel_editing">
                <div class="presets_source_panel_editing_table">
                    <div class="presets_source_panel_editing_row">
                        <div class="presets_source_panel_editing_field_label">Name</div>
                        <div class="presets_source_panel_editing_field_edit">
                            <input
                                v-model="draft.name"
                                type="text"
                                class="presets_source_panel_editing_name_field standard_input"
                                :disabled="source.official"
                            />
                        </div>
                    </div>
                    <div class="presets_source_panel_editing_row">
                        <div class="presets_source_panel_editing_field_label">Url</div>
                        <div class="presets_source_panel_editing_field_edit">
                            <input
                                v-model="draft.url"
                                type="text"
                                class="presets_source_panel_editing_url_field standard_input"
                                :disabled="source.official"
                                @input="handleUrlInput"
                            />
                        </div>
                    </div>
                    <div
                        v-if="showGithubBranch"
                        class="presets_source_panel_editing_row presets_source_panel_editing_github_branch"
                    >
                        <div class="presets_source_panel_editing_field_label">GitHub branch</div>
                        <div class="presets_source_panel_editing_field_edit">
                            <input
                                v-model="draft.gitHubBranch"
                                type="text"
                                class="presets_source_panel_editing_branch_field standard_input"
                                :disabled="source.official"
                            />
                        </div>
                    </div>
                </div>

                <div>
                    <div v-if="active" class="presets_source_panel_no_editing_selected"></div>
                    <a
                        v-if="!active"
                        href="#"
                        class="tool regular-button presets_source_panel_activate"
                        @click.prevent="handleActivate"
                        >{{ $t("presetsSourcesDialogMakeSourceActive") }}</a
                    >
                    <a
                        v-if="active"
                        href="#"
                        class="tool regular-button presets_source_panel_deactivate"
                        @click.prevent="handleDeactivate"
                        >{{ $t("presetsSourcesDialogMakeSourceDisable") }}</a
                    >
                    <a
                        v-if="!source.official"
                        href="#"
                        class="tool regular-button presets_source_panel_save"
                        :class="{ disabled: !isDirty }"
                        @click.prevent="isDirty && handleSave()"
                        >{{ $t("presetsSourcesDialogSaveSource") }}</a
                    >
                    <a
                        v-if="!source.official"
                        href="#"
                        class="tool regular-button presets_source_panel_reset"
                        :class="{ disabled: !isDirty }"
                        @click.prevent="isDirty && resetDraft()"
                        >{{ $t("presetsSourcesDialogResetSource") }}</a
                    >
                    <a
                        v-if="!source.official"
                        href="#"
                        class="tool regular-button presets_source_panel_delete"
                        @click.prevent="emit('delete')"
                        >{{ $t("presetsSourcesDialogDeleteSource") }}</a
                    >
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, reactive, watch } from "vue";
import PresetSource from "@/tabs/presets/SourcesDialog/PresetSource";

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
    emit("save", normalizedDraft());
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

<style lang="less">
.presets_source_panel {
    background-color: var(--surface-200);
    border: 1px solid var(--surface-500);
    padding: 1.5ex;
    box-shadow: 2px 2px 5px rgba(92, 92, 92, 0.25);
    border-radius: 4px;
    margin-bottom: 6px;
}

.presets_source_panel_not_selected {
    cursor: pointer;
}

.presets_source_panel_not_selected:hover {
    background-color: var(--surface-500);
    box-shadow: 2px 2px 5px rgba(92, 92, 92, 0.5);
}

.presets_source_panel_editing_table {
    display: table;
    width: 100%;
    border-spacing: 6px;
}

.presets_source_panel_editing_row {
    display: table-row;
}

.presets_source_panel_editing_field_label {
    display: table-cell;
    white-space: pre;
    padding-right: 10px;
    min-width: 100px;
}

.presets_source_panel_editing_field_edit {
    display: table-cell;
    width: 100%;
    padding-right: 10px;
}

.presets_source_panel_editing_row .standard_input {
    width: 100%;
    margin-right: 12px;
}

.presets_source_panel_no_editing_name {
    font-size: 130%;
    display: inline-block;
    vertical-align: middle;
}

.presets_source_panel_no_editing_selected {
    background-image: url(../../../images/icons/cf_icon_check_orange.svg);
    width: 30px;
    height: 30px;
    display: inline-block;
    margin-top: 8px;
    margin-bottom: 8px;
    margin-right: 5px;
    vertical-align: middle;
}

.presets_source_panel_reset,
.presets_source_panel_save,
.presets_source_panel_delete {
    float: right;
}
</style>
