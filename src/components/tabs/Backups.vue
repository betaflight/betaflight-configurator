<template>
    <div class="tab-backups">
        <div class="content_wrapper">
            <div class="tab_title" i18n="tabBackups">Backups</div>

            <!-- Loading State -->
            <div v-if="isLoading" class="data-loading">
                <p>{{ $t("dataWaitingForData") }}</p>
            </div>

            <!-- Backups Content -->
            <div v-else class="grid-box col3">
                <div class="options col-span-3">
                    <div v-if="isConnected" class="backup-controls">
                        <a
                            href="#"
                            @click.prevent="createBackup"
                            class="backup_button regular-button"
                            i18n="actionBackup"
                            >Backup</a
                        >
                    </div>
                    <div v-if="backupMessage" class="backup-message">
                        <p>{{ backupMessage }}</p>
                    </div>
                    <div class="backup-list">
                        <table class="backup-table">
                            <thead>
                                <tr>
                                    <th i18n="labelDate">Date</th>
                                    <th i18n="labelName">Name</th>
                                    <th i18n="labelDescription">Description</th>
                                    <th i18n="labelActions">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-if="backups.length === 0">
                                    <td colspan="4">{{ $t("backupNoBackupsAvailable") }}</td>
                                </tr>
                                <template v-for="(groupBackups, craft) in groupedBackups" :key="craft">
                                    <tr>
                                        <td colspan="5">
                                            <span class="title">{{ craft }}</span>
                                        </td>
                                    </tr>
                                    <tr class="backup-row" v-for="backup in groupBackups" :key="backup.id">
                                        <td>{{ formatDate(backup.created) }}</td>
                                        <td>{{ backup.name }}</td>
                                        <td>{{ backup.description || "" }}</td>
                                        <td>
                                            <a
                                                href="#"
                                                @click.prevent="downloadBackup(backup)"
                                                class="download-backup"
                                                >{{ $t("actionDownload") }}</a
                                            >
                                            <a href="#" @click.prevent="startEdit(backup)" class="edit-backup">{{
                                                $t("actionEdit")
                                            }}</a>
                                            <a
                                                href="#"
                                                @click.prevent="deleteBackup(backup.id)"
                                                class="delete-backup"
                                                >{{ $t("actionDelete") }}</a
                                            >
                                        </td>
                                    </tr>
                                </template>
                            </tbody>
                        </table>
                    </div>

                    <!-- Edit Form Modal -->
                    <div v-if="isEditing" class="backup-edit-modal" @click.self="cancelEdit">
                        <div class="backup-edit-form">
                            <button class="backup-edit-close-button" aria-label="Close" @click.prevent="cancelEdit">
                                &times;
                            </button>
                            <h4>{{ $t("titleEditBackup") }}</h4>
                            <p>
                                <label for="edit-backup-name">{{ $t("labelName") }}</label>
                                <input v-model="editForm.name" type="text" id="edit-backup-name" name="name" />
                            </p>
                            <p>
                                <label for="edit-backup-description">{{ $t("labelDescription") }}</label>
                                <textarea
                                    v-model="editForm.description"
                                    id="edit-backup-description"
                                    name="description"
                                ></textarea>
                            </p>
                            <p>
                                <strong>{{ $t("labelCreated") }}</strong>
                                <span>{{ formatDate(editForm.created) }}</span>
                            </p>
                            <div class="button-container">
                                <a
                                    href="#"
                                    @click.prevent="saveBackupChanges"
                                    class="save-backup-changes_button regular-button"
                                    >{{ $t("actionSave") }}</a
                                >
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useTranslation } from "i18next-vue";
import loginManager from "../../js/LoginManager";
import { gui_log } from "../../js/gui_log";
import MSP from "../../js/msp";
import { useConnectionStore } from "../../stores/connection";

const { t } = useTranslation();
const connectionStore = useConnectionStore();

const isLoading = ref(true);
const backups = ref([]);
const backupMessage = ref(null);
const isEditing = ref(false);
const editForm = ref({ id: null, name: "", description: "", created: null });
let userApi = null;
let unsubscribeLogin = null;
let unsubscribeLogout = null;

const groupedBackups = computed(() => {
    const grouped = {};
    backups.value.forEach((backup) => {
        const key = backup.key || "Unknown";
        if (!grouped[key]) {
            grouped[key] = [];
        }
        grouped[key].push(backup);
    });
    return grouped;
});

const isConnected = computed(() => connectionStore.connectionValid);

async function loadBackups() {
    isLoading.value = true;

    try {
        const loggedIn = await loginManager.isUserLoggedIn();
        if (!loggedIn) {
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

        const output = await new Promise((resolve, reject) => {
            MSP.send_cli_command("diff all", (data) => {
                if (data && Array.isArray(data) && data.length > 0) {
                    resolve([...data]);
                } else {
                    reject(new Error(t("profileBackupEmptyResult") || "Empty backup result"));
                }
            });
        });

        gui_log(t("profileBackupSuccess"));
        const text = output.join("\n");

        await userApi.uploadBackup(text);

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

        let fileContent = response.file;
        if (!fileContent || fileContent.length === 0) {
            throw new Error("Backup file is empty");
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
    editForm.value.id = backup.id;
    editForm.value.name = backup.name;
    editForm.value.description = backup.description || "";
    editForm.value.created = backup.created;
    isEditing.value = true;
}

function cancelEdit() {
    isEditing.value = false;
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

async function deleteBackup(backupId) {
    const confirmed = globalThis.confirm(t("confirmDelete", { item: t("itemBackup") }));
    if (!confirmed || !userApi) {
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

    unsubscribeLogin = loginManager.onLogin(async () => {
        await loadBackups();
    });

    unsubscribeLogout = loginManager.onLogout(async () => {
        await loadBackups();
    });
});

onUnmounted(() => {
    if (unsubscribeLogin) {
        unsubscribeLogin();
    }
    if (unsubscribeLogout) {
        unsubscribeLogout();
    }
});
</script>

<style scoped>
.content_wrapper .data-loading {
    min-height: 150px;
    height: 50%;
    p {
        text-align: center;
        margin-top: 100px;
    }
}

.backup-message {
    padding: 10px 15px;
    margin-bottom: 15px;
    background-color: var(--surface-500);
    border-left: 4px solid var(--primary-500);
    border-radius: 4px;
}

.backup-controls {
    margin-bottom: 15px;
}

.backup-table {
    width: 100%;
    border-collapse: collapse;
    border-spacing: 0;
    margin-bottom: 20px;
}

.backup-table th,
.backup-table td {
    padding: 8px;
    text-align: left;
}

.backup-table th:first-child {
    border-top-left-radius: 8px;
}

.backup-table th:last-child {
    border-top-right-radius: 8px;
}

.backup-table th:last-child,
.backup-table td:last-child {
    border-right: none;
}

.backup-table tr:last-child td {
    border-bottom: none;
}

.backup-table th {
    background-color: var(--surface-500);
    font-weight: bold;
}

.backup-table a {
    margin-right: 10px;
    text-decoration: none;
    color: var(--primary-500);
}

.backup-table a:hover {
    text-decoration: underline;
}
.backup-table .backup-row:hover {
    background-color: var(--surface-600);
}

.backup-table .title {
    font-weight: bold;
    color: var(--primary-500);
    width: 100%;
}

.backup-edit-modal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
}

.backup-edit-form {
    position: relative;
    width: 90%;
    max-width: 600px;
    max-height: 90vh;
    overflow-y: auto;
    padding: 20px;
    border: 1px solid var(--surface-400);
    background-color: var(--surface-200);
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.backup-edit-form label {
    display: block;
    margin-bottom: 5px;
}

.backup-edit-form input[type="text"],
.backup-edit-form textarea {
    width: 100%;
    padding: 5px;
    margin-bottom: 10px;
}

.backup-edit-form textarea {
    height: 100px;
}

.backup-edit-close-button {
    position: absolute;
    top: 10px;
    right: 10px;
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    padding: 0;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text);
}

.button-container {
    margin-top: 10px;
}

.button-container a {
    margin-right: 10px;
}
</style>
