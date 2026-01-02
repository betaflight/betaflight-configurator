<template>
    <div class="tab-backups">
        <div class="content_wrapper">
            <div class="tab_title" i18n="tabBackups">Backups</div>

            <!-- Loading State -->
            <div v-if="isLoading" class="data-loading">
                <p>Waiting for data ...</p>
            </div>

            <!-- Backups Content -->
            <div v-else class="grid-box col3">
                <div class="options col-span-3">
                    <div class="gui_box backups">
                        <div class="spacer">
                            <div v-if="isConnected" class="backup-controls" style="margin-bottom: 15px">
                                <a
                                    href="#"
                                    @click.prevent="createBackup"
                                    class="backup_button regular-button"
                                    i18n="Backup"
                                    >Backup</a
                                >
                            </div>
                            <div class="backup-list">
                                <table class="backup-table">
                                    <thead>
                                        <tr>
                                            <th i18n="userBackupDate">Date</th>
                                            <th i18n="userBackupName">Name</th>
                                            <th i18n="userBackupDescription">Description</th>
                                            <th i18n="userBackupActions">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr v-if="backups.length === 0">
                                            <td colspan="4">No backups available</td>
                                        </tr>
                                        <template v-for="(groupBackups, craft) in groupedBackups" :key="craft">
                                            <tr>
                                                <td colspan="4">
                                                    <span class="title">{{ craft }}</span>
                                                    <span v-if="getSerialForCraft(craft)" class="serial"
                                                        >[{{ getSerialForCraft(craft) }}]</span
                                                    >
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
                                                        >Download</a
                                                    >
                                                    <a href="#" @click.prevent="startEdit(backup)" class="edit-backup"
                                                        >Edit</a
                                                    >
                                                    <a
                                                        href="#"
                                                        @click.prevent="deleteBackup(backup.id)"
                                                        class="delete-backup"
                                                        >Delete</a
                                                    >
                                                </td>
                                            </tr>
                                        </template>
                                    </tbody>
                                </table>
                            </div>

                            <!-- Edit Form -->
                            <div v-if="isEditing" class="backup-edit-form" style="position: relative">
                                <button
                                    class="backup-edit-close-button"
                                    aria-label="Close"
                                    @click.prevent="cancelEdit"
                                    style="
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
                                    "
                                >
                                    &times;
                                </button>
                                <h4>Edit Backup</h4>
                                <p>
                                    <label for="edit-backup-name">Name:</label>
                                    <input v-model="editForm.name" type="text" id="edit-backup-name" name="name" />
                                </p>
                                <p>
                                    <label for="edit-backup-description">Description:</label>
                                    <textarea
                                        v-model="editForm.description"
                                        id="edit-backup-description"
                                        name="description"
                                    ></textarea>
                                </p>
                                <p>
                                    <strong>Created Date:</strong> <span>{{ formatDate(editForm.created) }}</span>
                                </p>
                                <div class="button-container">
                                    <a
                                        href="#"
                                        @click.prevent="saveBackupChanges"
                                        class="save-backup-changes_button regular-button"
                                        i18n="Save Changes"
                                        >Save Changes</a
                                    >
                                </div>
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
import { i18n } from "../../js/localization";
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
                gui_log(`${i18n.getMessage("userBackupsLoadFailed")}: ${error}`);
            }

            this.isLoading = false;
        },
        async createBackup() {
            try {
                if (!this.userApi) {
                    throw new Error("Not logged in");
                }

                const output = await new Promise((resolve, reject) => {
                    MSP.send_cli_command("dump all", (output) => {
                        if (output && output.length > 0) {
                            resolve(output);
                        } else {
                            reject(new Error(i18n.getMessage("profileBackupEmptyResult") || "Empty backup result"));
                        }
                    });
                });

                gui_log(i18n.getMessage("profileBackupSuccess"));
                const text = output.join("\n");

                // Upload to API
                await this.userApi.uploadBackup(text);

                gui_log(i18n.getMessage("profileBackupApiSuccess"));
                await this.loadBackups();
            } catch (error) {
                gui_log(`${i18n.getMessage("profileBackupApiFail")}: ${error.message || error}`);
            }
        },
        async downloadBackup(backup) {
            try {
                if (!this.userApi) {
                    throw new Error("Not logged in");
                }

                const response = await this.userApi.downloadBackupFile(backup.id);
                // response is an object { name, file }
                const filename = response.name || backup.name || "backup.txt";
                const url = globalThis.URL.createObjectURL(response.file);
                const link = document.createElement("a");
                link.href = url;
                link.setAttribute("download", filename);
                document.body.appendChild(link);
                link.click();
                link.remove();
                // Clean up the object URL to avoid memory leaks
                globalThis.URL.revokeObjectURL(url);
            } catch (error) {
                gui_log(`${i18n.getMessage("userBackupDownloadFailed")}: ${error}`);
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
                gui_log(i18n.getMessage("userBackupUpdateSuccess"));
                await this.loadBackups();
                this.isEditing = false;
            } catch (error) {
                gui_log(`${i18n.getMessage("userBackupUpdateFailed")}: ${error}`);
            }
        },
        async deleteBackup(backupId) {
            const confirmed = globalThis.confirm("Are you sure you want to delete this backup?");
            if (!confirmed) {
                return;
            }

            if (!this.userApi) {
                return;
            }

            try {
                await this.userApi.deleteBackup(backupId);
                gui_log(i18n.getMessage("userBackupDeleteSuccess"));
                await this.loadBackups();
            } catch (error) {
                gui_log(`${i18n.getMessage("userBackupDeleteFailed")}: ${error}`);
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
            return backup ? backup.serial || "mcu unknown" : "";
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
