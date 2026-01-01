<template>
    <div class="tab-user_profile">
        <div class="content_wrapper">
            <div class="tab_title" i18n="tabUserProfile">User Profile</div>

            <!-- Loading State -->
            <div v-if="isLoading" class="data-loading">
                <p>Waiting for data ...</p>
            </div>

            <!-- Not Logged In State -->
            <div v-else-if="!isLoggedIn" class="grid-box col3">
                <div class="options col-span-1"></div>
                <div class="options gui_box col-span-1">
                    <div class="spacer">
                        <div class="message-box">
                            <h3 i18n="profileNotLoggedIn">Not Logged In</h3>
                            <p i18n="profileLoginMessage">Please log in to view your profile.</p>
                            <div class="button-container" style="text-align: center">
                                <a href="#" @click.prevent="showLoginDialog" class="regular-button" i18n="login"
                                    >Login</a
                                >
                            </div>
                        </div>
                    </div>
                </div>
                <div class="options col-span-1"></div>
            </div>

            <!-- Logged In State -->
            <div v-else class="profile grid-box col3">
                <div class="options col-span-3"></div>
                <div class="options gui_box col-span-3">
                    <div class="spacer">
                        <div class="profile-content">
                            <img :src="profilePhoto" alt="Profile" class="profile-photo" />
                            <div class="profile-info">
                                <p>
                                    <span i18n="profileNameTitle" class="title">Name:</span
                                    ><span>{{ profile.name }}</span>
                                </p>
                                <p>
                                    <span i18n="profileEmailTitle" class="title">Email:</span
                                    ><span>{{ profile.email }}</span>
                                </p>
                                <p>
                                    <span i18n="profileAddressTitle" class="title">Address:</span
                                    ><span>{{ profile.address }}</span>
                                </p>
                                <p>
                                    <span i18n="profileCountryTitle" class="title">Country:</span
                                    ><span>{{ profile.country }}</span>
                                </p>
                            </div>

                            <!-- Edit Form -->
                            <div v-if="isEditing" class="profile-edit" style="position: relative">
                                <button
                                    class="profile-edit-close-button"
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
                                <p>
                                    <label for="edit-name">Name:</label>
                                    <input v-model="editForm.name" type="text" id="edit-name" name="name" />
                                </p>
                                <p>
                                    <label for="edit-address">Address:</label>
                                    <input v-model="editForm.address" type="text" id="edit-address" name="address" />
                                </p>
                                <p>
                                    <label for="edit-country">Country:</label>
                                    <input v-model="editForm.country" type="text" id="edit-country" name="country" />
                                </p>
                            </div>

                            <!-- Profile Display -->
                            <div v-else class="button-container">
                                <a
                                    href="#"
                                    @click.prevent="startEdit"
                                    class="edit-profile_button regular-button"
                                    i18n="Edit Profile"
                                    >Edit Profile</a
                                >
                            </div>

                            <!-- Save Button (only shown when editing) -->
                            <div v-if="isEditing" class="button-container">
                                <a
                                    href="#"
                                    @click.prevent="saveProfileChanges"
                                    class="save-profile_button regular-button"
                                    i18n="Save Changes"
                                    >Save Changes</a
                                >
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Token Section -->
                <div class="options col-span-3">
                    <div class="gui_box tokens">
                        <h3>User Tokens</h3>
                        <div class="token-list">
                            <table class="token-table">
                                <thead>
                                    <tr>
                                        <th i18n="userTokenId">Id</th>
                                        <th i18n="userTokenCreated">Created</th>
                                        <th i18n="userTokenExpiry">Expiry</th>
                                        <th i18n="userTokenDetails">Details</th>
                                        <th i18n="userTokenActions">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-if="tokens.length === 0">
                                        <td colspan="5" i18n="userTokenNoTokens">No tokens available</td>
                                    </tr>
                                    <tr v-for="token in tokens" :key="token.id">
                                        <td>{{ token.id }}</td>
                                        <td>{{ formatDate(token.created) }}</td>
                                        <td>{{ formatDate(token.expiry) }}</td>
                                        <td>{{ token.details || token.client?.address || "-" }}</td>
                                        <td>
                                            <a
                                                href="#"
                                                @click.prevent="deleteToken(token.id)"
                                                class="delete-token"
                                                i18n="userTokenDelete"
                                                >Delete</a
                                            >
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
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

export default defineComponent({
    name: "UserProfile",
    data() {
        return {
            isLoading: true,
            isLoggedIn: false,
            isEditing: false,
            profile: null,
            unsubscribeLogin: null,
            unsubscribeLogout: null,
            editForm: {
                name: "",
                address: "",
                country: "",
            },
            tokens: [],
            userApi: null,
        };
    },
    computed: {
        profilePhoto() {
            if (this.profile.avatar) {
                return this.profile.avatar;
            }
            return "images/default_avatar.png";
        },
    },
    methods: {
        async loadProfile() {
            this.isLoading = true;

            if (!loginManager.isUserLoggedIn()) {
                this.isLoggedIn = false;
                this.tokens = [];
                this.isLoading = false;
                return;
            }

            this.isLoggedIn = true;
            this.userApi = loginManager.getUserApi();

            try {
                const data = await this.userApi.profile();
                this.profile = data;
            } catch (error) {
                gui_log(`${i18n.getMessage("userProfileLoadFailed")}: ${error}`);
            }

            try {
                this.tokens = await this.userApi.getTokens();
            } catch (error) {
                gui_log(`${i18n.getMessage("userTokenLoadFailed")}: ${error}`);
            }

            this.isLoading = false;
        },
        startEdit() {
            if (!this.profile) {
                return;
            }
            this.editForm.name = this.profile.name || "";
            this.editForm.address = this.profile.address || "";
            this.editForm.country = this.profile.country || "";
            this.isEditing = true;
        },
        cancelEdit() {
            this.isEditing = false;
        },
        async saveProfileChanges() {
            if (!this.userApi) {
                return;
            }

            try {
                await this.userApi.updateProfile({
                    name: this.editForm.name,
                    address: this.editForm.address,
                    country: this.editForm.country,
                });

                if (!this.profile) {
                    this.profile = {};
                }
                this.profile.name = this.editForm.name;
                this.profile.address = this.editForm.address;
                this.profile.country = this.editForm.country;
                gui_log(i18n.getMessage("userProfileUpdateSuccess"));
                this.isEditing = false;
            } catch (error) {
                gui_log(`${i18n.getMessage("userProfileUpdateFailed")}: ${error}`);
            }
        },
        async deleteToken(tokenId) {
            const confirmed = globalThis.confirm(i18n.getMessage("userTokenDeleteConfirm"));
            if (!confirmed) {
                return;
            }

            if (!this.userApi) {
                return;
            }

            try {
                await this.userApi.deleteToken(tokenId);
                this.tokens = this.tokens.filter((tk) => tk.id !== tokenId);
                gui_log(i18n.getMessage("userTokenDeleteSuccess"));
            } catch (error) {
                gui_log(`${i18n.getMessage("userTokenDeleteFailed")}: ${error}`);
            }
        },
        formatDate(dateString) {
            if (!dateString) {
                return "";
            }
            return new Date(dateString).toLocaleString();
        },
        showLoginDialog() {
            loginManager.showLoginDialog();
        },
    },
    async mounted() {
        // Load profile on mount
        await this.loadProfile();

        // Register callbacks for login/logout and store unsubscribe functions
        this.unsubscribeLogin = loginManager.onLogin(async () => {
            await this.loadProfile();
        });

        this.unsubscribeLogout = loginManager.onLogout(async () => {
            await this.loadProfile();
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
