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
                                    <tr v-for="backup in groupBackups" :key="backup.id">
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

<script>
import { defineComponent } from "vue";
import loginManager from "../../js/LoginManager";
import { gui_log } from "../../js/gui_log";
import MSP from "../../js/msp";
import CONFIGURATOR from "../../js/data_storage";

export default defineComponent({
    name: "Backups",
    data() {
        return {
            isLoading: true,
            backups: [],
            isEditing: false,
            unsubscribeLogin: null,
            unsubscribeLogout: null,
            editForm: {
                id: null,
                name: "",
                description: "",
                created: null,
            },
            userApi: null,
            currentCraft: null,
        };
    },
    computed: {
        groupedBackups() {
            const grouped = {};
            this.backups.forEach((backup) => {
                const key = backup.key || "Unknown";
                if (!grouped[key]) {
                    grouped[key] = [];
                }
                grouped[key].push(backup);
            });
            return grouped;
        },
        isConnected() {
            return CONFIGURATOR.connectionValid;
        },
    },
    methods: {
        async loadBackups() {
            this.isLoading = true;

            try {
                const isLoggedIn = await loginManager.isUserLoggedIn();
                if (!isLoggedIn) {
                    this.backups = [];
                    this.isLoading = false;
                    return;
                }

                this.userApi = loginManager.getUserApi();

                const backups = await this.userApi.getBackups();
                this.backups = backups;
            } catch (error) {
                gui_log(`${this.$t("userBackupsLoadFailed")}: ${error}`);
            }

            this.isLoading = false;
        },
        async createBackup() {
            try {
                if (!this.userApi) {
                    throw new Error(this.$t("notLoggedIn"));
                }

                const output = await new Promise((resolve, reject) => {
                    MSP.send_cli_command("diff all", (data) => {
                        if (data && Array.isArray(data) && data.length > 0) {
                            // Create a copy of the data since the original array gets cleared after callback
                            resolve([...data]);
                        } else {
                            reject(new Error(this.$t("profileBackupEmptyResult") || "Empty backup result"));
                        }
                    });
                });

                gui_log(this.$t("profileBackupSuccess"));
                const text = output.join("\n");

                // Upload to API
                await this.userApi.uploadBackup(text);

                gui_log(this.$t("profileBackupApiSuccess"));
                await this.loadBackups();
            } catch (error) {
                gui_log(`${this.$t("profileBackupApiFail")}: ${error.message || error}`);
            }
        },
        async downloadBackup(backup) {
            try {
                if (!this.userApi) {
                    throw new Error(this.$t("notLoggedIn"));
                }

                const response = await this.userApi.downloadBackupFile(backup.id);
                // response is an object { name, file } where file is JSON string

                // Parse the JSON and extract fileContents
                let fileContent = response.file;
                if (!fileContent || fileContent.length === 0) {
                    throw new Error("Backup file is empty");
                }

                const filename = response.name || backup.name || "backup.txt";
                // Create a blob from the decoded text for download
                const blob = new Blob([fileContent], { type: "text/plain" });
                const url = globalThis.URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.setAttribute("download", filename);
                document.body.appendChild(link);
                link.click();
                link.remove();
                // Clean up the object URL to avoid memory leaks
                globalThis.URL.revokeObjectURL(url);
            } catch (error) {
                gui_log(`${this.$t("userBackupDownloadFailed")}: ${error}`);
            }
        },
        startEdit(backup) {
            this.editForm.id = backup.id;
            this.editForm.name = backup.name;
            this.editForm.description = backup.description || "";
            this.editForm.created = backup.created;
            this.isEditing = true;
        },
        cancelEdit() {
            this.isEditing = false;
        },
        async saveBackupChanges() {
            if (!this.userApi) {
                return;
            }

            try {
                await this.userApi.updateBackup({
                    Id: this.editForm.id,
                    name: this.editForm.name,
                    description: this.editForm.description,
                });
                gui_log(this.$t("userBackupUpdateSuccess"));
                await this.loadBackups();
                this.isEditing = false;
            } catch (error) {
                gui_log(`${this.$t("userBackupUpdateFailed")}: ${error}`);
            }
        },
        async deleteBackup(backupId) {
            const confirmed = globalThis.confirm(this.$t("confirmDelete", { item: this.$t("itemBackup") }));
            if (!confirmed) {
                return;
            }

            if (!this.userApi) {
                return;
            }

            try {
                await this.userApi.deleteBackup(backupId);
                gui_log(this.$t("userBackupDeleteSuccess"));
                await this.loadBackups();
            } catch (error) {
                gui_log(`${this.$t("userBackupDeleteFailed")}: ${error}`);
            }
        },
        formatDate(dateString) {
            if (!dateString) {
                return "";
            }
            return new Date(dateString).toLocaleString();
        },
        getSerialForCraft(craft) {
            const backup = this.backups.find((b) => b.key === craft);
            return backup ? backup.serial || this.$t("backupMcuUnknown") : "";
        },
    },
    async mounted() {
        // Load backups on mount
        await this.loadBackups();

        // Register callbacks for login/logout and store unsubscribe functions
        this.unsubscribeLogin = loginManager.onLogin(async () => {
            await this.loadBackups();
        });

        this.unsubscribeLogout = loginManager.onLogout(async () => {
            await this.loadBackups();
        });
    },
    unmounted() {
        // Clean up callbacks on unmount
        if (this.unsubscribeLogin) {
            this.unsubscribeLogin();
        }
        if (this.unsubscribeLogout) {
            this.unsubscribeLogout();
        }
    },
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

.backup-controls {
    margin-bottom: 15px;
}

.backup-table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    margin-bottom: 20px;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid var(--surface-400);
}

.backup-table th,
.backup-table td {
    border-bottom: 1px solid var(--surface-400);
    border-right: 1px solid var(--surface-400);
    padding: 8px;
    text-align: left;
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
