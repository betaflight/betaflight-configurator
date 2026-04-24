<template>
    <BaseTab tab-name="backups">
        <div class="content_wrapper grid-box col1">
            <div class="tab_title">{{ $t("tabBackups") }}</div>
            <!-- Loading State -->
            <div v-if="isLoading" class="flex items-center justify-center py-16">
                <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin text-[var(--color-primary-500)]" />
                <span class="ml-2 text-dimmed">{{ $t("dataWaitingForData") }}</span>
            </div>

            <template v-else>
                <!-- Message from API (e.g. membership info) -->
                <UiBox v-if="backupMessage" type="neutral">
                    <p>{{ backupMessage }}</p>
                </UiBox>

                <!-- Backup list per craft -->
                <UiBox :title="$t('tabBackups')">
                    <div v-if="backups.length === 0" class="text-dimmed text-sm py-4">
                        {{ $t("backupNoBackupsAvailable") }}
                    </div>

                    <template v-for="(groupBackups, craft) in groupedBackups" :key="craft">
                        <div class="mb-4">
                            <div class="text-sm font-bold text-[var(--color-primary-500)] mb-1">{{ craft }}</div>
                            <UTable :data="groupBackups" :columns="columns" class="text-sm">
                                <template #created-cell="{ row }">
                                    {{ formatDate(row.original.created) }}
                                </template>
                                <template #description-cell="{ row }">
                                    <span class="text-dimmed">{{ row.original.description || "" }}</span>
                                </template>
                                <template #actions-cell="{ row }">
                                    <div class="flex gap-2">
                                        <UButton
                                            size="xs"
                                            variant="soft"
                                            icon="i-lucide-download"
                                            @click="downloadBackup(row.original)"
                                        >
                                            {{ $t("actionDownload") }}
                                        </UButton>
                                        <UButton
                                            v-if="isConnected"
                                            size="xs"
                                            variant="soft"
                                            color="success"
                                            icon="i-lucide-upload"
                                            :disabled="isRestoreBusy"
                                            @click="restoreBackup(row.original)"
                                        >
                                            {{ $t("actionRestore") }}
                                        </UButton>
                                        <UButton
                                            size="xs"
                                            variant="soft"
                                            icon="i-lucide-pencil"
                                            @click="startEdit(row.original)"
                                        >
                                            {{ $t("actionEdit") }}
                                        </UButton>
                                        <UButton
                                            size="xs"
                                            variant="soft"
                                            color="error"
                                            icon="i-lucide-trash-2"
                                            @click="deleteBackup(row.original.id)"
                                        >
                                            {{ $t("actionDelete") }}
                                        </UButton>
                                    </div>
                                </template>
                            </UTable>
                        </div>
                    </template>
                </UiBox>
            </template>

            <!-- Edit Dialog -->
            <Dialog v-model="isEditing" :title="$t('titleEditBackup')">
                <div class="flex flex-col gap-3">
                    <div>
                        <label class="text-sm font-semibold block mb-1">{{ $t("labelName") }}</label>
                        <UInput v-model="editForm.name" size="sm" class="w-full" />
                    </div>
                    <div>
                        <label class="text-sm font-semibold block mb-1">{{ $t("labelDescription") }}</label>
                        <UTextarea v-model="editForm.description" size="sm" class="w-full" :rows="4" />
                    </div>
                    <div class="text-sm">
                        <span class="font-semibold">{{ $t("labelCreated") }}</span>
                        {{ formatDate(editForm.created) }}
                    </div>
                </div>
                <template #footer>
                    <UButton @click="saveBackupChanges" size="sm">
                        {{ $t("actionSave") }}
                    </UButton>
                </template>
            </Dialog>

            <!-- Restore progress dialog -->
            <dialog ref="restoreProgressDialogRef" class="w-[320px] h-fit p-6" @cancel.prevent>
                <div class="text-lg mb-2" v-html="$t('userBackupRestoreInProgress')"></div>
                <div class="text-sm text-dimmed" v-html="$t('presetsPleaseWait')"></div>
                <UProgress :model-value="restoreProgress" :max="100" class="mt-3" />
            </dialog>

            <!-- Restore errors dialog -->
            <dialog
                ref="restoreErrorsDialogRef"
                class="w-[600px] max-w-[calc(100vw-2rem)] h-fit p-6"
                @close="handleRestoreErrorsClose"
                @cancel.prevent
            >
                <div class="text-lg mb-2" v-html="$t('userBackupRestoreErrors')"></div>
                <div class="backups_cli_background">
                    <div class="backups_cli_window">
                        <template v-for="(failure, idx) in restoreErrors" :key="idx">
                            <div>{{ failure.command }}</div>
                            <div
                                v-for="(line, lineIdx) in failure.response"
                                :key="lineIdx"
                                :class="{ error_message: line.startsWith('###ERROR') }"
                            >
                                {{ line }}
                            </div>
                        </template>
                    </div>
                </div>
                <div class="flex gap-2 justify-end mt-3">
                    <UButton :label="$t('presetsButtonCancel')" variant="outline" @click="closeRestoreErrors(false)" />
                    <UButton :label="$t('presetsSaveAnyway')" @click="closeRestoreErrors(true)" />
                </div>
            </dialog>
        </div>

        <!-- Bottom toolbar -->
        <div v-if="isConnected" class="content_toolbar toolbar_fixed_bottom flex items-center gap-2">
            <div class="flex-1"></div>
            <UButton @click="createBackup" size="sm" icon="i-lucide-save">
                {{ $t("actionBackup") }}
            </UButton>
        </div>
    </BaseTab>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from "vue";
import { useTranslation } from "i18next-vue";
import BaseTab from "./BaseTab.vue";
import UiBox from "../elements/UiBox.vue";
import Dialog from "../elements/Dialog.vue";
import loginManager from "@/js/LoginManager";
import { gui_log } from "@/js/gui_log";
import { useConnectionStore } from "@/stores/connection";
import {
    cancelScheduledReconnect,
    saveAndReconnect,
    scheduleReconnect,
    useMspCliSession,
} from "@/composables/useMspCliSession";
import { useDialog } from "@/composables/useDialog";

const { t } = useTranslation();
const connectionStore = useConnectionStore();
const cliSession = useMspCliSession();
const dialog = useDialog();

const isLoading = ref(true);
const backups = ref([]);
const backupMessage = ref(null);
const isEditing = ref(false);
const editForm = ref({ id: null, name: "", description: "", created: null });
const restoreProgress = ref(0);
const restoreProgressOpen = ref(false);
const restoreErrors = ref([]);
const restoreErrorsOpen = ref(false);
const restoreSavePressed = ref(false);
const restoreProgressDialogRef = ref(null);
const restoreErrorsDialogRef = ref(null);
let userApi = null;
let unsubscribeLogin = null;
let unsubscribeLogout = null;

const columns = computed(() => [
    { accessorKey: "created", header: t("labelDate") },
    { accessorKey: "name", header: t("labelName") },
    { accessorKey: "description", header: t("labelDescription") },
    { id: "actions", header: t("labelActions") },
]);

const groupedBackups = computed(() => {
    const grouped = {};
    for (const backup of backups.value) {
        const key = backup.key || "Unknown";
        if (!grouped[key]) {
            grouped[key] = [];
        }
        grouped[key].push(backup);
    }
    return grouped;
});

const isConnected = computed(() => connectionStore.connectionValid);
const isRestoreBusy = computed(
    () => restoreProgressOpen.value || restoreErrorsOpen.value || cliSession.isBatchRunning.value,
);

async function loadBackups() {
    isLoading.value = true;

    try {
        const loggedIn = await loginManager.isUserLoggedIn();
        if (!loggedIn) {
            userApi = null;
            backups.value = [];
            backupMessage.value = null;
            isLoading.value = false;
            return;
        }

        userApi = loginManager.getUserApi();
        const response = await userApi.getBackups();
        backups.value = response.backups ?? [];
        backupMessage.value = response.message ?? null;
    } catch (error) {
        gui_log(`${t("userBackupsLoadFailed")}: ${error}`);
    }

    isLoading.value = false;
}

async function createBackup() {
    try {
        if (!userApi) {
            throw new Error(t("notLoggedIn"));
        }

        const output = await cliSession.readDumpAll();
        if (!output.length) {
            throw new Error(t("profileBackupEmptyResult") || "Empty backup result");
        }

        gui_log(t("profileBackupSuccess"));
        await userApi.uploadBackup(output.join("\n"));
        gui_log(t("profileBackupApiSuccess"));
        await loadBackups();
    } catch (error) {
        gui_log(`${t("profileBackupApiFail")}: ${error.message || error}`);
    }
}

async function downloadBackup(backup) {
    try {
        if (!userApi) {
            throw new Error(t("notLoggedIn"));
        }

        const response = await userApi.downloadBackupFile(backup.id);
        const fileContent = response.file;
        if (!fileContent?.length) {
            throw new Error(t("userBackupFileEmpty"));
        }

        const filename = response.name || backup.name || "backup.txt";
        const blob = new Blob([fileContent], { type: "text/plain" });
        const url = globalThis.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        link.remove();
        globalThis.URL.revokeObjectURL(url);
    } catch (error) {
        gui_log(`${t("userBackupDownloadFailed")}: ${error}`);
    }
}

function startEdit(backup) {
    editForm.value = {
        id: backup.id,
        name: backup.name,
        description: backup.description || "",
        created: backup.created,
    };
    isEditing.value = true;
}

async function saveBackupChanges() {
    if (!userApi) {
        return;
    }

    try {
        await userApi.updateBackup({
            Id: editForm.value.id,
            name: editForm.value.name,
            description: editForm.value.description,
        });
        gui_log(t("userBackupUpdateSuccess"));
        await loadBackups();
        isEditing.value = false;
    } catch (error) {
        gui_log(`${t("userBackupUpdateFailed")}: ${error}`);
    }
}

async function restoreBackup(backup) {
    if (!userApi) {
        gui_log(t("notLoggedIn"));
        return;
    }

    if (!connectionStore.connectionValid) {
        return;
    }

    const confirmed = await dialog.showYesNo(
        t("titleRestoreBackup"),
        t("userBackupRestoreConfirm", { name: backup.name || t("itemBackup") }),
        {
            yesText: t("actionRestore"),
            noText: t("presetsButtonCancel"),
        },
    );

    if (!confirmed) {
        return;
    }

    let text;
    try {
        const response = await userApi.downloadBackupFile(backup.id);
        text = response.file;
        if (!text?.length) {
            throw new Error(t("userBackupFileEmpty"));
        }
    } catch (error) {
        gui_log(`${t("userBackupRestoreFailed")}: ${error.message || error}`);
        return;
    }

    const fileLines = text.split(/\r?\n/);
    const hasDefaultsPrefix = fileLines.some((line) => line.trim().toLowerCase() === "defaults nosave");
    const commands = hasDefaultsPrefix ? fileLines : ["defaults nosave", "", ...fileLines];

    restoreProgress.value = 0;
    restoreProgressOpen.value = true;

    const result = await cliSession.runBatch(commands, {
        onProgress: ({ index, total }) => {
            restoreProgress.value = total > 0 ? Math.round((index / total) * 100) : 100;
        },
        commandTimeoutMs: 5000,
    });

    restoreProgressOpen.value = false;

    if (result.cancelled) {
        return;
    }

    if (result.errors.length > 0) {
        restoreErrors.value = result.errors;
        restoreErrorsOpen.value = true;
        return;
    }

    gui_log(t("userBackupRestoreSuccess"));
    await saveAndReconnect();
}

function closeRestoreErrors(saveAnyway) {
    restoreSavePressed.value = saveAnyway;
    restoreErrorsOpen.value = false;
}

async function handleRestoreErrorsClose() {
    const savePressed = restoreSavePressed.value;
    restoreSavePressed.value = false;

    if (savePressed) {
        await saveAndReconnect();
        return;
    }

    try {
        await cliSession.send("exit");
    } catch (error) {
        console.error("Failed to send exit:", error);
    } finally {
        scheduleReconnect();
    }
}

watch(restoreProgressOpen, async (isOpen) => {
    await nextTick();
    if (!restoreProgressDialogRef.value) {
        return;
    }
    if (isOpen && !restoreProgressDialogRef.value.open) {
        restoreProgressDialogRef.value.showModal();
    } else if (!isOpen && restoreProgressDialogRef.value.open) {
        restoreProgressDialogRef.value.close();
    }
});

watch(restoreErrorsOpen, async (isOpen) => {
    await nextTick();
    if (!restoreErrorsDialogRef.value) {
        return;
    }
    if (isOpen && !restoreErrorsDialogRef.value.open) {
        restoreErrorsDialogRef.value.showModal();
    } else if (!isOpen && restoreErrorsDialogRef.value.open) {
        restoreErrorsDialogRef.value.close();
    }
});

async function deleteBackup(backupId) {
    const confirmed = globalThis.confirm(t("confirmDelete", { item: t("itemBackup") }));
    if (!confirmed) {
        return;
    }

    if (!userApi) {
        gui_log(t("notLoggedIn"));
        return;
    }

    try {
        await userApi.deleteBackup(backupId);
        gui_log(t("userBackupDeleteSuccess"));
        await loadBackups();
    } catch (error) {
        gui_log(`${t("userBackupDeleteFailed")}: ${error}`);
    }
}

function formatDate(dateString) {
    if (!dateString) {
        return "";
    }
    return new Date(dateString).toLocaleString();
}

onMounted(async () => {
    await loadBackups();
    unsubscribeLogin = loginManager.onLogin(() => loadBackups());
    unsubscribeLogout = loginManager.onLogout(() => loadBackups());
});

onUnmounted(() => {
    cancelScheduledReconnect();
    cliSession.cancel();
    unsubscribeLogin?.();
    unsubscribeLogout?.();
});
</script>

<style scoped>
.backups_cli_background {
    border: 1px solid var(--ui-border);
    background-color: rgba(64, 64, 64, 1);
    height: 300px;
    border-radius: 5px;
    box-shadow: inset 0 0 20px rgba(0, 0, 0, 0.8);
    overflow-y: auto;
}

.backups_cli_window {
    padding: 5px;
    font-family: monospace;
    color: white;
    white-space: pre-wrap;
    user-select: text;
}

.backups_cli_window .error_message {
    color: red;
    font-weight: bold;
}
</style>
