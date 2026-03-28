<template>
    <BaseTab tab-name="presets" @mounted="onTabMounted" @cleanup="onTabCleanup">
        <div class="content_wrapper" id="presets_content_wrapper">
            <div class="tab_title">
                <div class="presets_title_text" v-html="$t('tabPresets')"></div>
                <div class="presets_top_bar_button_pannel">
                    <a
                        href="https://betaflight.com/docs/wiki/app/presets-tab"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="presetsWikiButton tool regular-button right"
                        >{{ $t("presetsWiki") }}</a
                    >
                    <div class="top_panel_spacer visible-on-desktop-only"></div>
                    <a
                        href="#"
                        class="presets_sources_show tool regular-button right"
                        @click.prevent="openSourcesDialog"
                        >{{ $t("presetSources") }}</a
                    >
                    <div class="top_panel_spacer visible-on-desktop-only"></div>
                    <a
                        href="#"
                        class="presets_load_config tool regular-button right"
                        @click.prevent="loadConfigBackup"
                        >{{ $t("presetsBackupLoad") }}</a
                    >
                    <a
                        href="#"
                        class="presets_save_config tool regular-button right"
                        @click.prevent="saveConfigBackup"
                        >{{ $t("presetsBackupSave") }}</a
                    >
                </div>
            </div>

            <div class="presets_warnings">
                <div
                    v-if="store.isThirdPartyActive"
                    class="note presets_warning_not_official_source"
                    v-html="$t('presetsWarningNotOfficialSource')"
                ></div>
                <div
                    v-if="store.failedRepositoryNames.length"
                    class="note presets_failed_to_load_repositories"
                    v-html="store.failedRepositoriesMessage"
                ></div>
                <div v-if="store.backupWarningVisible" class="note presets_warning_backup">
                    <div class="presets_warning_backup_text" v-html="$t('presetsWarningBackup')"></div>
                    <a
                        href="#"
                        class="tool regular-button presets_warning_backup_button_hide"
                        @click.prevent="hideBackupWarning"
                        >{{ $t("dontShowAgain") }}</a
                    >
                </div>
            </div>

            <div v-if="store.isLoading" id="presets_global_loading" class="data-loading presets_visible_block"></div>

            <div v-else-if="store.hasLoadError" id="presets_global_loading_error" class="presets_visible_block">
                <h3 v-html="$t('presetsLoadError')"></h3>
                <a href="#" id="presets_reload" class="tool regular-button" @click.prevent="reloadPresets">{{
                    $t("presetsReload")
                }}</a>
            </div>

            <div v-else id="presets_main_content" class="presets_visible_block">
                <div class="presets_search_settings">
                    <div class="presets_filter_table_wrapper">
                        <PresetFilterSelect
                            v-model="store.filters.categories"
                            label-key="presetsFilterCategory"
                            :options="store.filterOptions.categories"
                        />
                        <PresetFilterSelect
                            v-model="store.filters.keywords"
                            label-key="presetsFilterKeyword"
                            :options="store.filterOptions.keywords"
                        />
                        <PresetFilterSelect
                            v-model="store.filters.authors"
                            label-key="presetsFilterAuthor"
                            :options="store.filterOptions.authors"
                        />
                        <PresetFilterSelect
                            v-model="store.filters.firmwareVersions"
                            label-key="presetsFilterFirmware"
                            :options="store.filterOptions.firmwareVersions"
                        />
                        <PresetFilterSelect
                            v-model="store.filters.status"
                            label-key="presetsFilterStatus"
                            :options="store.filterOptions.status"
                        />
                    </div>

                    <div id="presets_search_bar_wrapper">
                        <div id="presets_search_hint"></div>
                        <input
                            id="presets_filter_text"
                            type="text"
                            class="presets_text_input"
                            :value="store.filters.searchString"
                            :placeholder="searchPlaceholder"
                            @input="store.setSearchString($event.target.value)"
                        />
                    </div>
                </div>

                <div id="preset_list_wrapper">
                    <div
                        v-if="store.hasNoResults"
                        id="presets_list_no_found"
                        v-html="$t('presetsNoPresetsFound')"
                    ></div>
                    <div id="presets_list">
                        <PresetCard
                            v-for="entry in store.visiblePresetEntries"
                            :key="entry.key"
                            :preset="entry.preset"
                            :repository="entry.repository"
                            :show-repository-name="store.isThirdPartyActive"
                            :is-favorite="store.isPresetFavorite(entry.preset, entry.repository)"
                            :is-picked="store.isPresetPicked(entry.preset, entry.repository)"
                            @open="store.openPresetDetails(entry.preset, entry.repository)"
                            @toggle-favorite="store.toggleFavorite(entry.preset, entry.repository)"
                        />
                        <div
                            v-if="store.hasTooManyResults"
                            id="presets_list_too_many_found"
                            v-html="$t('presetsTooManyPresetsFound')"
                        ></div>
                    </div>
                </div>
            </div>
        </div>

        <div class="content_toolbar toolbar_fixed_bottom">
            <div class="btn">
                <a
                    href="#"
                    id="presets_save_button"
                    class="tool regular-button"
                    :class="{ disabled: !store.canApply }"
                    @click.prevent="store.canApply && applyPickedPresets()"
                    >{{ $t("presetsButtonSave") }}</a
                >
                <a
                    href="#"
                    id="presets_cancel_button"
                    class="tool regular-button"
                    :class="{ disabled: !store.canApply }"
                    @click.prevent="store.canApply && store.clearPickedPresets()"
                    >{{ $t("presetsButtonCancel") }}</a
                >
            </div>
        </div>

        <PresetDetailsDialog
            :open="store.detailsState.open"
            :preset="store.selectedPreset"
            :repository="store.selectedPresetRepository"
            :loading="store.detailsState.loading"
            :error="store.detailsState.error"
            :show-cli="store.detailsState.showCli"
            :show-repository-name="store.selectedPresetShowRepoName"
            :selected-option-ids="store.detailsState.selectedOptionIds"
            :selected-option-labels="store.selectedPresetOptionLabels"
            :options-expanded="store.detailsState.optionsExpanded"
            :cli-strings="store.selectedPresetCliStrings"
            :is-favorite="store.isSelectedPresetFavorite"
            :is-picked="store.isSelectedPresetPicked"
            @apply="applyPresetSelection"
            @close="store.closePresetDetails()"
            @toggle-cli-visible="store.setDetailsCliVisible($event)"
            @toggle-option="store.setOptionChecked($event.optionId, $event.checked)"
            @select-exclusive-option="store.setExclusiveOption($event.groupOptionIds, $event.selectedOptionId)"
            @toggle-favorite="store.toggleFavorite(store.selectedPreset, store.selectedPresetRepository)"
            @options-expanded-change="store.setOptionsExpanded($event)"
        />

        <PresetSourcesDialog
            :open="store.showSourcesDialog"
            :sources="store.sources"
            :active-source-ids="store.activeSourceIds"
            @close="closeSourcesDialog"
            @add-source="store.addSource()"
            @save-source="handleSaveSource"
            @delete-source="store.deleteSource"
            @activate-source="handleActivateSource"
            @deactivate-source="handleDeactivateSource"
        />

        <dialog id="presets_apply_progress_dialog" ref="progressDialogRef" @cancel.prevent>
            <div class="presets_apply_progress_dialog_label" v-html="$t('presetsApplyingPresets')"></div>
            <div class="presets_apply_progress_dialog_please_wait" v-html="$t('presetsPleaseWait')"></div>
            <progress
                class="presets_apply_progress_dialog_progress_bar"
                :value="store.applyState.progress"
                max="100"
            ></progress>
        </dialog>

        <dialog
            id="presets_cli_errors_dialog"
            ref="cliErrorsDialogRef"
            @close="handleCliErrorsDialogClose"
            @cancel.prevent
        >
            <div class="presets_cli_errors_dialog_warning" v-html="$t('presetsCliErrorsWarning')"></div>
            <div id="presets_cli">
                <div id="presets_cli_background">
                    <div id="presets_cli_window" ref="cliWindowRef" class="window">
                        <div id="presets_cli_window_wrapper" ref="windowWrapperRef" class="wrapper"></div>
                    </div>
                </div>
                <div class="commandline">
                    <textarea
                        id="presets_cli_command"
                        ref="commandInputRef"
                        name="commands"
                        rows="1"
                        cols="0"
                    ></textarea>
                </div>
            </div>
            <div class="btn">
                <a
                    href="#"
                    id="presets_cli_errors_save_anyway_button"
                    class="tool regular-button"
                    @click.prevent="saveAnywayAfterCliErrors"
                    >{{ $t("presetsSaveAnyway") }}</a
                >
                <a
                    href="#"
                    id="presets_cli_errors_exit_no_save_button"
                    class="tool regular-button"
                    @click.prevent="closeCliErrorsWithoutSaving"
                    >{{ $t("presetsButtonCancel") }}</a
                >
            </div>
        </dialog>
    </BaseTab>
</template>

<script setup>
import { inject, nextTick, ref, watch } from "vue";
import BaseTab from "./BaseTab.vue";
import PresetFilterSelect from "./presets/PresetFilterSelect.vue";
import PresetCard from "./presets/PresetCard.vue";
import PresetDetailsDialog from "./presets/PresetDetailsDialog.vue";
import PresetSourcesDialog from "./presets/PresetSourcesDialog.vue";
import { usePresetsStore } from "@/stores/presets";
import { usePresetsCliSession } from "@/composables/usePresetsCliSession";
import { useDialog } from "@/composables/useDialog";
import GUI from "@/js/gui";
import FC from "@/js/fc";
import { escapeHtml } from "@/js/utils/common";
import { useConnectionStore } from "@/stores/connection";
import FileSystem from "@/js/FileSystem";
import { generateFilename } from "@/js/utils/generate_filename";
import { i18n } from "@/js/localization";
import { update_sensor_status } from "@/js/serial_backend";
import { TAB_ADAPTER_REGISTRATION_KEY } from "@/js/vue_tab_mounter";
import CliEngine from "./presets/CliEngine";

const store = usePresetsStore();
const connectionStore = useConnectionStore();
const dialog = useDialog();
const cliSession = usePresetsCliSession({
    onProgressChange: (value) => store.updateApplyProgress(value),
});
const { cliWindowRef, windowWrapperRef, commandInputRef } = cliSession;
const progressDialogRef = ref(null);
const cliErrorsDialogRef = ref(null);
const searchPlaceholder = 'example: "karate race", or "5\'\' freestyle"';
const tabAdapterRegistration = inject(TAB_ADAPTER_REGISTRATION_KEY, null);
let isCleaningUpCliSession = false;

const tabAdapter = {
    read: (info) => cliSession.readSerial(info),
    cleanup: (callback) => {
        isCleaningUpCliSession = true;
        store.resetTransientState();
        cliSession.cleanup(() => {
            isCleaningUpCliSession = false;
            callback?.();
        });
    },
};

if (tabAdapterRegistration) {
    tabAdapterRegistration.current = tabAdapter;
}

watch(
    () => store.applyState.progressDialogOpen,
    async (isOpen) => {
        await nextTick();

        if (!progressDialogRef.value) {
            return;
        }

        if (isOpen && !progressDialogRef.value.open) {
            progressDialogRef.value.showModal();
        } else if (!isOpen && progressDialogRef.value.open) {
            progressDialogRef.value.close();
        }
    },
);

watch(
    () => store.applyState.cliErrorsDialogOpen,
    async (isOpen) => {
        await nextTick();

        if (!cliErrorsDialogRef.value) {
            return;
        }

        if (isOpen && !cliErrorsDialogRef.value.open) {
            cliErrorsDialogRef.value.showModal();
        } else if (!isOpen && cliErrorsDialogRef.value.open) {
            cliErrorsDialogRef.value.close();
        }
    },
);

async function onTabMounted() {
    store.initialize();
    GUI.content_ready();
    void update_sensor_status();
    await store.reloadRepositories();
}

function onTabCleanup() {
    store.resetTransientState();
}

async function reloadPresets() {
    await store.reloadRepositories();
}

function hideBackupWarning() {
    store.setBackupWarningVisible(false);
}

function openSourcesDialog() {
    store.openSourcesManager();
}

async function closeSourcesDialog() {
    if (!store.showSourcesDialog) {
        return;
    }

    store.closeSourcesManager();
    await store.reloadRepositories();
}

function handleSaveSource(index, source) {
    store.updateSource(index, source);
}

function handleActivateSource(sourceId) {
    store.setSourceActive(sourceId, true);
}

function handleDeactivateSource(sourceId) {
    store.setSourceActive(sourceId, false);
}

async function ensureCliPresetActionSupported() {
    if (!connectionStore.virtualMode) {
        return true;
    }

    await dialog.showInfo(i18n.getMessage("warningTitle"), i18n.getMessage("presetsVirtualModeCliUnsupported"), {
        confirmText: i18n.getMessage("close"),
    });

    return false;
}

function isPickerAbortError(error) {
    return error?.name === "AbortError";
}

async function saveConfigBackup() {
    if (!(await ensureCliPresetActionSupported())) {
        return;
    }

    const waitingDialog = dialog.showWait(i18n.getMessage("presetsLoadingDumpAll"), null);

    let activated = false;

    try {
        await cliSession.activate();
        activated = true;
        const cliStrings = await cliSession.readDumpAll();
        const filename = generateFilename("cli_backup", "txt");
        const text = cliStrings.join("\n");
        const file = await FileSystem.pickSaveFile(
            filename,
            i18n.getMessage("fileSystemPickerFiles", { typeof: "TXT" }),
            ".txt",
        );

        if (!file) {
            waitingDialog.close();
            return;
        }

        await FileSystem.writeFile(file, text);
        waitingDialog.close();
    } catch (error) {
        waitingDialog.close();

        if (isPickerAbortError(error)) {
            return;
        }

        await dialog.showInfo(i18n.getMessage("warningTitle"), i18n.getMessage("dumpAllNotSavedWarning"), {
            confirmText: i18n.getMessage("close"),
        });
    } finally {
        if (activated) {
            cliSession.sendLine(CliEngine.s_commandExit);
        }
    }
}

async function loadConfigBackup() {
    if (!(await ensureCliPresetActionSupported())) {
        return;
    }

    try {
        const file = await FileSystem.pickOpenFile(i18n.getMessage("fileSystemPickerFiles", { typeof: "TXT" }), ".txt");

        if (!file) {
            return;
        }

        const text = await FileSystem.readFile(file);

        if (!text) {
            return;
        }

        store.appendPickedPreset({ title: i18n.getMessage("presetsBackupLoad") }, text.split(/\r?\n/), undefined);
        await applyPickedPresets();
    } catch (error) {
        if (isPickerAbortError(error)) {
            return;
        }

        console.error("Failed loading presets config:", error);
        await dialog.showInfo(
            i18n.getMessage("warningTitle"),
            `${i18n.getMessage("userBackupsLoadFailed")}<br>${escapeHtml(String(error.message ?? ""))}`,
            { confirmText: i18n.getMessage("close") },
        );
    }
}

function isPresetCompatible(preset) {
    return preset.firmware_version?.some((firmwareVersion) =>
        FC.CONFIG.flightControllerVersion.startsWith(firmwareVersion),
    );
}

function pickPresetAfterVersionCheck() {
    if (!store.selectedPreset) {
        return;
    }

    if (isPresetCompatible(store.selectedPreset)) {
        store.pickSelectedPreset();
        return;
    }

    dialog.openYesNo(
        i18n.getMessage("presetsWarningDialogTitle"),
        i18n.getMessage("presetsWarningWrongVersionConfirmation", [
            store.selectedPreset.firmware_version,
            FC.CONFIG.flightControllerVersion,
        ]),
        () => store.pickSelectedPreset(),
        null,
        {
            yesText: i18n.getMessage("presetsWarningDialogYesButton"),
            noText: i18n.getMessage("presetsWarningDialogNoButton"),
        },
    );
}

async function applyPresetSelection() {
    if (!store.selectedPreset) {
        return;
    }

    if (store.selectedPreset.force_options_review && !store.detailsState.optionsReviewed) {
        await dialog.showInfo(i18n.getMessage("warningTitle"), i18n.getMessage("presetsReviewOptionsWarning"), {
            confirmText: i18n.getMessage("close"),
        });
        return;
    }

    if (!store.selectedPreset.completeWarning) {
        pickPresetAfterVersionCheck();
        return;
    }

    dialog.openYesNo(
        i18n.getMessage("presetsWarningDialogTitle"),
        escapeHtml(store.selectedPreset.completeWarning),
        pickPresetAfterVersionCheck,
        null,
        {
            yesText: i18n.getMessage("presetsWarningDialogYesButton"),
            noText: i18n.getMessage("presetsWarningDialogNoButton"),
        },
    );
}

async function applyPickedPresets() {
    if (!(await ensureCliPresetActionSupported())) {
        return;
    }

    cliSession.resetProgress();
    store.openProgressDialog();
    const currentCliErrorsCount = cliSession.getErrorCount();

    try {
        await cliSession.activate();
        store.markPickedPresetsAsFavorites();
        await cliSession.executeCommandsArray(store.getPickedPresetsCli());
        const newCliErrorsCount = cliSession.getErrorCount();

        if (newCliErrorsCount !== currentCliErrorsCount) {
            store.closeProgressDialog();
            store.openCliErrorsDialog();
            return;
        }

        store.closeProgressDialog();
        cliSession.sendLine(CliEngine.s_commandSave);
        cliSession.disconnectCliMakeSure();
    } catch (error) {
        console.error(error);
        store.closeProgressDialog();
        store.openCliErrorsDialog();
    }
}

function saveAnywayAfterCliErrors() {
    store.closeCliErrorsDialog(true);
    cliSession.sendLine(CliEngine.s_commandSave, null, () => {
        cliSession.sendLine(CliEngine.s_commandSave);
    });
    cliSession.disconnectCliMakeSure();
}

function closeCliErrorsWithoutSaving() {
    store.closeCliErrorsDialog(false);
}

function handleCliErrorsDialogClose() {
    if (isCleaningUpCliSession) {
        return;
    }

    const savePressed = store.applyState.cliErrorsSavePressed;
    store.closeCliErrorsDialog(savePressed);

    if (!savePressed) {
        cliSession.sendLine(CliEngine.s_commandExit);
        cliSession.disconnectCliMakeSure();
    }
}
</script>

<style lang="less">
.tab-presets {
    height: 100%;

    .content_wrapper {
        height: calc(100% - 30px - 3ex);
        overflow-y: scroll;
        overflow-x: hidden;
    }

    p {
        padding: 0;
        border: 0 dotted var(--surface-500);
    }

    .presets_warnings {
        padding-left: 20px;
        padding-right: 20px;
    }

    .top_panel_spacer {
        width: 0;
        display: inline;
        border: 1px var(--surface-500);
        border-style: none none none solid;
        height: 60%;
        margin-right: 10px;
        float: right;
    }

    .tab_title {
        padding: 20px 20px 0 20px;

        .presets_top_bar_button_pannel .regular-button {
            margin-bottom: 0;
            margin-top: 0;
            line-height: 17px;
            font-size: 10px;
            border-radius: 3px;
        }
    }

    .window {
        height: 100%;
        width: 100%;
        padding: 5px;
        overflow-y: auto;
        overflow-x: hidden;
        font-family: monospace;
        color: white;
        box-sizing: border-box;
        -webkit-user-select: text;
        user-select: text;
        float: left;

        .wrapper {
            white-space: pre-wrap;
            user-select: text;
        }

        .error_message {
            color: red;
            font-weight: bold;
        }
    }

    textarea[name="commands"] {
        -webkit-box-sizing: border-box;
        box-sizing: border-box;
        width: 100%;
        margin-top: 6px;
        padding: 4px 8px;
        color: white;
        border: 1px solid var(--surface-500);
        background-color: rgba(64, 64, 64, 1);
        resize: none;
    }

    .presets_cli_errors_dialog_warning {
        font-size: 1.2em;
        margin-bottom: 8px;
    }

    .presets_apply_progress_dialog_progress_bar {
        width: 100%;
        height: 20px;
        margin-top: 12px;
        border-radius: 4px;
        appearance: none;
        -webkit-appearance: none;
        overflow: hidden;

        &::-webkit-progress-bar {
            background-color: var(--surface-500);
        }

        &::-webkit-progress-value {
            background-color: var(--primary-500);
            border-radius: 0 4px 4px 0;
        }
    }
}

#presets_content_wrapper {
    padding: 0;
    position: relative;
}

.presets_title_text {
    display: inline-block;
}

.presets_top_bar_button_pannel {
    display: inline;
}

.presets_warning_backup {
    display: grid;
    grid-template-columns: 1fr fit-content(300px);
}

.presets_warning_backup_text {
    padding-right: 24px;
}

.presets_warning_backup_button_hide {
    margin-top: 0;
    margin-bottom: 0;
    margin-right: 0;
    line-height: 17px;
    font-size: 10px;
    height: 17px;
}

.presetsWikiButton {
    margin-right: 0;
}

#preset_list_wrapper {
    padding-left: 20px;
    padding-right: 20px;
}

#presets_list {
    padding: 0 0 20px 0;
    height: calc(100% - 180px);
    display: grid;
    gap: 12px;
    grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
}

#presets_global_loading {
    padding: 0 20px 20px 20px;
    width: 50%;
    height: 50%;
    margin: auto;
}

#presets_global_loading_error {
    padding: 0 20px 20px 20px;
}

.presets_visible_block {
    display: block !important;
}

.presets_search_settings {
    position: sticky;
    top: 0;
    background-color: var(--surface-100);
    z-index: 10;
}

.presets_text_input {
    border: 1px solid var(--surface-500);
    border-radius: 3px;
    background-color: var(--surface-200);
    color: var(--text);
}

#presets_filter_text {
    height: 26px;
    flex: 1;
    padding-left: 5px;
}

#presets_search_hint {
    float: left;
    width: 28px;
    height: 28px;
    margin-right: 12px;
    background-repeat: no-repeat;
    background-image: url(../../images/icons/cf_icon_search_orange.svg);
}

#presets_search_bar_wrapper {
    display: flex;
    padding: 2ex 20px 2ex 20px;
}

#presets_cli {
    width: 100%;
}

#presets_cli_background {
    border: 1px solid var(--surface-500);
    background-color: rgba(64, 64, 64, 1);
    margin-top: 0;
    height: 300px;
    border-radius: 5px;
    box-shadow: inset 0 0 20px rgba(0, 0, 0, 0.8);
}

#presets_cli_errors_dialog {
    width: 600px;
    padding: 24px;

    .regular-button {
        margin-bottom: 0;
        margin-left: 12px;
        margin-right: 0;
        float: right;
    }
}

#presets_apply_progress_dialog {
    width: 300px;
    padding: 24px;
}

.presets_filter_table_wrapper {
    display: grid;
    gap: 5px;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    padding: 0 20px 0 20px;
}

#presets_list_no_found,
#presets_list_too_many_found {
    font-size: 1.5em;
}

@media only screen and (max-width: 1055px), only screen and (max-device-width: 1055px) {
    .tab-presets {
        .content_wrapper {
            height: calc(100% - 87px);
        }

        .content_toolbar {
            margin-top: 5px;
        }
    }

    .presets_search_settings {
        position: static;
        top: unset;
    }
}

@media all and (max-width: 575px) {
    .tab-presets {
        .content_wrapper {
            height: calc(100% - 51px);
        }

        .tab_title {
            padding: 20px 10px 10px 10px;
        }

        .presets_warnings {
            padding-left: 8px;
            padding-right: 8px;
        }
    }

    #presets_list {
        grid-template-columns: 100%;
    }

    #preset_list_wrapper {
        padding-left: 8px;
        padding-right: 8px;
    }

    .presets_search_settings {
        padding-left: 8px;
        padding-right: 8px;
    }

    .presets_filter_table_wrapper {
        display: table;
        border-spacing: 6px;
        margin-right: -6px;
        margin-left: -6px;
        padding-left: 0;
        padding-right: 0;
    }

    #presets_search_bar_wrapper {
        padding-left: 0;
        padding-right: 0;
        padding-top: 1ex;
    }

    #presets_cli_errors_dialog {
        padding: 12px;

        .btn {
            position: fixed;
            right: 12px;
            bottom: 12px;
        }
    }

    #presets_apply_progress_dialog {
        padding: 12px;
    }

    #presets_cli {
        height: calc(100% - 121px);
    }

    #presets_cli_background {
        height: 100%;
    }

    .presets_warning_backup {
        display: block;
    }

    .presets_warning_backup_text {
        padding-right: 24px;
        margin-bottom: 6px;
    }
}
</style>
