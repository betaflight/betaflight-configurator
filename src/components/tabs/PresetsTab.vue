<template>
    <BaseTab tab-name="presets" @mounted="onTabMounted" @cleanup="onTabCleanup">
        <div class="content_wrapper" id="presets_content_wrapper">
            <div class="tab_title">{{ $t("tabPresets") }}</div>
            <WikiButton docUrl="presets" />
            <div class="flex items-center gap-2 flex-wrap mb-2 justify-end">
                <UButton :label="$t('presetSources')" size="xs" @click="openSourcesDialog" />
                <UButton :label="$t('presetsBackupLoad')" size="xs" @click="loadConfigBackup" />
                <UButton :label="$t('presetsBackupSave')" size="xs" @click="saveConfigBackup" />
            </div>

            <div class="flex flex-col gap-2 mb-3">
                <UiBox v-if="store.isThirdPartyActive" type="warning" highlight>
                    <span v-html="$t('presetsWarningNotOfficialSource')"></span>
                </UiBox>
                <UiBox v-if="store.failedRepositoryNames.length" type="error" highlight>
                    <span v-html="store.failedRepositoriesMessage"></span>
                </UiBox>
                <UiBox v-if="store.backupWarningVisible" type="warning" highlight>
                    <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                        <span class="flex-1 min-w-0" v-html="$t('presetsWarningBackup')"></span>
                        <UButton
                            :label="$t('dontShowAgain')"
                            size="xs"
                            class="self-start sm:self-auto"
                            @click="hideBackupWarning"
                        />
                    </div>
                </UiBox>
            </div>

            <div v-if="store.isLoading" class="data-loading p-5 w-1/2 h-1/2 mx-auto"></div>

            <div v-else-if="store.hasLoadError" class="p-5">
                <h3 v-html="$t('presetsLoadError')"></h3>
                <UButton :label="$t('presetsReload')" class="mt-2" @click="reloadPresets" />
            </div>

            <div v-else>
                <div class="sticky top-0 bg-(--ui-bg) z-10">
                    <div class="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-1.5">
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

                    <div class="flex items-center gap-3 py-3">
                        <UInput
                            :model-value="store.filters.searchString"
                            :placeholder="searchPlaceholder"
                            icon="i-lucide-search"
                            class="flex-1"
                            @update:model-value="store.setSearchString($event)"
                        />
                    </div>
                </div>

                <div>
                    <div v-if="store.hasNoResults" class="text-2xl py-4" v-html="$t('presetsNoPresetsFound')"></div>
                    <div class="preset-card-grid grid gap-3 pb-5">
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
                            class="text-2xl col-span-full py-4"
                            v-html="$t('presetsTooManyPresetsFound')"
                        ></div>
                    </div>
                </div>
            </div>
        </div>

        <div class="content_toolbar toolbar_fixed_bottom">
            <div class="flex gap-2">
                <UButton
                    :label="$t('presetsButtonSave')"
                    :disabled="!store.canApply"
                    :color="store.canApply ? 'success' : 'neutral'"
                    @click="applyPickedPresets()"
                />
                <UButton
                    :label="$t('presetsButtonCancel')"
                    :disabled="!store.canApply"
                    :color="store.canApply ? 'primary' : 'neutral'"
                    @click="store.clearPickedPresets()"
                />
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

        <dialog ref="progressDialogRef" class="w-[300px] h-fit p-6" @cancel.prevent>
            <div class="text-lg mb-2" v-html="$t('presetsApplyingPresets')"></div>
            <div class="text-sm text-(--ui-text-muted)" v-html="$t('presetsPleaseWait')"></div>
            <UProgress :model-value="store.applyState.progress" :max="100" class="mt-3" />
        </dialog>

        <dialog
            ref="cliErrorsDialogRef"
            class="w-[600px] max-w-[calc(100vw-2rem)] h-fit p-6"
            @close="handleCliErrorsDialogClose"
            @cancel.prevent
        >
            <div class="text-lg mb-2" v-html="$t('presetsCliErrorsWarning')"></div>
            <div id="presets_cli" class="w-full">
                <div class="presets_cli_background">
                    <div ref="cliWindowRef" class="presets_cli_window">
                        <div ref="windowWrapperRef" class="presets_cli_wrapper"></div>
                    </div>
                </div>
                <div class="presets_cli_commandline">
                    <textarea ref="commandInputRef" name="commands" rows="1" cols="0"></textarea>
                </div>
            </div>
            <div class="flex gap-2 justify-end mt-3">
                <UButton :label="$t('presetsButtonCancel')" variant="outline" @click="closeCliErrorsWithoutSaving" />
                <UButton :label="$t('presetsSaveAnyway')" @click="saveAnywayAfterCliErrors" />
            </div>
        </dialog>
    </BaseTab>
</template>

<script setup>
import { inject, nextTick, ref, watch } from "vue";
import BaseTab from "./BaseTab.vue";
import UiBox from "@/components/elements/UiBox.vue";
import WikiButton from "@/components/elements/WikiButton.vue";
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

<style>
.preset-card-grid {
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 500px), 1fr));
}

.tab-presets .content_wrapper {
    overflow-y: scroll;
    overflow-x: hidden;
}

/* CLI terminal window — runtime-generated DOM, cannot use Tailwind */
.presets_cli_background {
    border: 1px solid var(--ui-border);
    background-color: rgba(64, 64, 64, 1);
    height: 300px;
    border-radius: 5px;
    box-shadow: inset 0 0 20px rgba(0, 0, 0, 0.8);
}

.presets_cli_window {
    height: 100%;
    width: 100%;
    padding: 5px;
    overflow-y: auto;
    overflow-x: hidden;
    font-family: monospace;
    color: white;
    box-sizing: border-box;
    user-select: text;
    float: left;
}

.presets_cli_wrapper {
    white-space: pre-wrap;
    user-select: text;
}

.presets_cli_window .error_message {
    color: red;
    font-weight: bold;
}

.presets_cli_commandline textarea {
    box-sizing: border-box;
    width: 100%;
    margin-top: 6px;
    padding: 4px 8px;
    color: white;
    border: 1px solid var(--ui-border);
    background-color: rgba(64, 64, 64, 1);
    resize: none;
}

@media only screen and (max-width: 1055px) {
    .tab-presets .content_wrapper {
        height: calc(100% - 87px);
    }

    .tab-presets .content_toolbar {
        margin-top: 5px;
    }
}

@media all and (max-width: 575px) {
    .tab-presets .content_wrapper {
        height: calc(100% - 51px);
    }
}
</style>
