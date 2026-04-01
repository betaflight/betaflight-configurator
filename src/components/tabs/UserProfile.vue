<template>
    <div class="tab-user_profile">
        <div class="content_wrapper">
            <div class="tab_title" i18n="tabUserProfile">User Profile</div>

            <!-- Loading State -->
            <div v-if="isLoading" class="data-loading">
                <p>{{ $t("dataWaitingForData") }}</p>
            </div>

            <!-- Not Logged In State -->
            <div v-else-if="!isLoggedIn" class="grid-box col3">
                <div class="options col-span-1"></div>
                <div class="options gui_box col-span-1">
                    <div class="spacer">
                        <div class="message-box">
                            <h3 i18n="notLoggedIn">Not Logged In</h3>
                            <p i18n="profileLoginMessage">Please log in to view your profile.</p>
                            <div class="button-container" style="text-align: center">
                                <a href="#" @click.prevent="showLoginDialog" class="regular-button" i18n="labelLogin"
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
                                    <span i18n="labelName" class="title">Name:</span><span>{{ profile.name }}</span>
                                </p>
                                <p>
                                    <span i18n="labelEmail" class="title">Email:</span><span>{{ profile.email }}</span>
                                </p>
                                <p>
                                    <span i18n="labelAddress" class="title">Address:</span
                                    ><span>{{ profile.address }}</span>
                                </p>
                                <p>
                                    <span i18n="labelCountry" class="title">Country:</span
                                    ><span>{{ profile.country }}</span>
                                </p>
                            </div>

                            <!-- Profile Display -->
                            <div class="button-container">
                                <a href="#" @click.prevent="startEdit" class="edit-profile_button regular-button">{{
                                    $t("actionEdit")
                                }}</a>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Edit Profile Modal -->
                <div v-if="isEditing" class="profile-edit-modal" @click.self="cancelEdit">
                    <div class="profile-edit-form">
                        <button class="profile-edit-close-button" aria-label="Close" @click.prevent="cancelEdit">
                            &times;
                        </button>
                        <h4>{{ $t("titleEditProfile") }}</h4>
                        <p>
                            <label for="edit-name">{{ $t("labelName") }}</label>
                            <input v-model="editForm.name" type="text" id="edit-name" name="name" />
                        </p>
                        <p>
                            <label for="edit-address">{{ $t("labelAddress") }}</label>
                            <input v-model="editForm.address" type="text" id="edit-address" name="address" />
                        </p>
                        <p>
                            <label for="edit-country">{{ $t("labelCountry") }}</label>
                            <input v-model="editForm.country" type="text" id="edit-country" name="country" />
                        </p>
                        <p>
                            <label for="edit-avatar">{{ $t("labelAvatarUrl") }}</label>
                            <input
                                v-model="editForm.avatar"
                                type="url"
                                id="edit-avatar"
                                name="avatar"
                                :placeholder="$t('placeholderAvatarUrl')"
                            />
                        </p>
                        <p v-if="editError" class="profile-edit-error" role="alert" aria-live="polite">
                            {{ editError }}
                        </p>
                        <div class="button-container">
                            <a
                                href="#"
                                @click.prevent="saveProfileChanges"
                                class="save-profile_button regular-button"
                                i18n="actionSave"
                                >Save Changes</a
                            >
                        </div>
                    </div>
                </div>

                <!-- Token Section -->
                <div class="options col-span-3">
                    <div class="gui_box tokens">
                        <h3>{{ $t("sectionUserTokens") }}</h3>
                        <div class="token-list">
                            <table class="profile-table">
                                <thead>
                                    <tr>
                                        <th i18n="labelId">Id</th>
                                        <th i18n="labelCreated">Created</th>
                                        <th i18n="labelExpiry">Expiry</th>
                                        <th i18n="labelDetails">Details</th>
                                        <th i18n="labelActions">Actions</th>
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
                                                i18n="actionDelete"
                                                >Delete</a
                                            >
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- Passkeys Section -->
                <div class="options col-span-3">
                    <div class="gui_box passkeys">
                        <h3>{{ $t("sectionUserPasskeys") }}</h3>
                        <div class="passkey-list">
                            <table class="profile-table">
                                <thead>
                                    <tr>
                                        <th i18n="labelId">Id</th>
                                        <th i18n="labelCreated">Created</th>
                                        <th i18n="labelLastUsed">Last Used</th>
                                        <th i18n="labelDetails">Platform Info</th>
                                        <th i18n="labelActions">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-if="passkeys.length === 0">
                                        <td colspan="5" i18n="userPasskeyNoPasskeys">No passkeys available</td>
                                    </tr>
                                    <tr v-for="passkey in passkeys" :key="passkey.id">
                                        <td>{{ passkey.id }}</td>
                                        <td>{{ formatDate(passkey.createdAtUtc) }}</td>
                                        <td>{{ formatDate(passkey.updatedAtUtc) }}</td>
                                        <td>{{ passkey.client?.address || "-" }}</td>
                                        <td>
                                            <a
                                                href="#"
                                                @click.prevent="deletePasskey(passkey.id)"
                                                class="delete-passkey"
                                                i18n="actionDelete"
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

<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useTranslation } from "i18next-vue";
import loginManager from "../../js/LoginManager";
import { gui_log } from "../../js/gui_log";

const { t } = useTranslation();

const isLoading = ref(true);
const isLoggedIn = ref(false);
const isEditing = ref(false);
const editError = ref(null);
const profile = ref(null);
const editForm = ref({ name: "", address: "", country: "", avatar: "" });
const tokens = ref([]);
const passkeys = ref([]);
let userApi = null;
let unsubscribeLogin = null;
let unsubscribeLogout = null;

const profilePhoto = computed(() => {
    if (profile.value?.avatar) {
        return profile.value.avatar;
    }
    return "/images/default-user-avatar-loggedin.png";
});

async function loadProfile() {
    isLoading.value = true;

    try {
        const loggedIn = await loginManager.isUserLoggedIn();
        if (!loggedIn) {
            isLoggedIn.value = false;
            tokens.value = [];
            passkeys.value = [];
            isLoading.value = false;
            return;
        }

        isLoggedIn.value = true;
        userApi = loginManager.getUserApi();

        try {
            profile.value = await userApi.profile();
        } catch (error) {
            gui_log(`${t("userProfileLoadFailed")}: ${error}`);
        }

        try {
            tokens.value = await userApi.getTokens();
        } catch (error) {
            gui_log(`${t("userTokenLoadFailed")}: ${error}`);
        }
    } catch (error) {
        console.error("Error checking login state:", error);
        isLoggedIn.value = false;
        tokens.value = [];
        passkeys.value = [];
        isLoading.value = false;
        return;
    }

    try {
        passkeys.value = await userApi.getPasskeys();
    } catch (error) {
        gui_log(`${t("userPasskeyLoadFailed")}: ${error}`);
    }

    isLoading.value = false;
}

function startEdit() {
    if (!profile.value) {
        return;
    }
    editForm.value.name = profile.value.name || "";
    editForm.value.address = profile.value.address || "";
    editForm.value.country = profile.value.country || "";
    editForm.value.avatar = profile.value.avatar || "";
    editError.value = null;
    isEditing.value = true;
}

function cancelEdit() {
    isEditing.value = false;
    editError.value = null;
}

async function saveProfileChanges() {
    if (!userApi) {
        return;
    }

    try {
        editError.value = null;
        await userApi.updateProfile({
            name: editForm.value.name,
            address: editForm.value.address,
            country: editForm.value.country,
            avatar: editForm.value.avatar,
        });

        if (!profile.value) {
            profile.value = {};
        }
        profile.value.name = editForm.value.name;
        profile.value.address = editForm.value.address;
        profile.value.country = editForm.value.country;
        profile.value.avatar = editForm.value.avatar;
        gui_log(t("userProfileUpdateSuccess"));
        isEditing.value = false;
    } catch (error) {
        editError.value = `${t("userProfileUpdateFailed")}: ${error.message || error}`;
        gui_log(editError.value);
    }
}

async function deleteToken(tokenId) {
    const confirmed = globalThis.confirm(t("confirmDelete", { item: t("itemToken") }));
    if (!confirmed || !userApi) {
        return;
    }

    try {
        await userApi.deleteToken(tokenId);
        tokens.value = tokens.value.filter((tk) => tk.id !== tokenId);
        gui_log(t("userTokenDeleteSuccess"));
    } catch (error) {
        gui_log(`${t("userTokenDeleteFailed")}: ${error}`);
    }
}

async function deletePasskey(passkeyId) {
    const confirmed = globalThis.confirm(t("confirmDelete", { item: t("itemPasskey") }));
    if (!confirmed || !userApi) {
        return;
    }

    try {
        await userApi.deletePasskey(passkeyId);
        passkeys.value = passkeys.value.filter((pk) => pk.id !== passkeyId);
        gui_log(t("userPasskeyDeleteSuccess"));
    } catch (error) {
        gui_log(`${t("userPasskeyDeleteFailed")}: ${error}`);
    }
}

function formatDate(dateString) {
    if (!dateString) {
        return "";
    }
    return new Date(dateString).toLocaleString();
}

function showLoginDialog() {
    loginManager.showLoginDialog();
}

onMounted(async () => {
    await loadProfile();

    unsubscribeLogin = loginManager.onLogin(async () => {
        await loadProfile();
    });

    unsubscribeLogout = loginManager.onLogout(async () => {
        await loadProfile();
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
.tab-user_profile {
    font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
}
.profile {
    margin-top: 20px;
}
.profile-table {
    width: 100%;
    border-collapse: collapse;
    border-spacing: 0;
}
.profile-table th {
    padding: 8px;
    text-align: left;
    background-color: var(--surface-500);
    font-weight: bold;
    border-color: var(--surface-500);
}
.profile-table th:first-child {
    border-top-left-radius: 5px;
}
.profile-table th:last-child {
    border-top-right-radius: 5px;
}
.profile-table td {
    padding: 8px;
    text-align: left;
}
.profile-table tr:hover {
    background-color: var(--surface-600);
}

.profile-table a {
    margin-right: 10px;
    text-decoration: none;
    color: var(--primary-500);
}
.profile-table a:hover {
    text-decoration: underline;
}

.profile-content {
    display: flex;
    align-items: flex-start;
}
.profile-photo {
    width: 100px;
    height: 100px;
    border-radius: 50%;
    object-fit: cover;
    border: 3px solid var(--surface-500);
    margin-right: 20px;
}
.profile-info {
    flex-grow: 1;
}
.profile-info p {
    margin: 10px 0;
    font-size: 14px;
}
.profile-info h3,
.temp-password-form h3,
.create-passkey-form h3,
.signup-form h3,
.login-form h3 {
    padding-bottom: 5px;
    border-bottom-color: var(--surface-500);
    border-bottom-style: solid;
    border-width: 1px;
}
.profile-info input,
.temp-password-form input,
.create-passkey-form input,
.signup-form input,
.login-form input {
    width: 220px;
}
.profile-info .title,
.temp-password-form .title,
.create-passkey-form .title,
.signup-form .title,
.login-form .title {
    color: var(--primary-500);
    font-weight: 600;
    margin-right: 5px;
    min-width: 60px;
    display: inline-block;
}
.profile-info .space,
.temp-password-form .space,
.create-passkey-form .space,
.signup-form .space,
.login-form .space {
    margin-top: 10px;
}

.profile-edit-modal {
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

.profile-edit-form {
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

.profile-edit-form label {
    display: block;
    margin-bottom: 5px;
    font-weight: bold;
}

.profile-edit-form input {
    width: 100%;
    padding: 5px;
    margin-bottom: 10px;
    border: 1px solid var(--surface-400);
    border-radius: 4px;
}

.profile-edit-error {
    color: var(--error-500);
    font-size: 12px;
    margin: 10px 0;
    padding: 8px;
    background-color: rgba(255, 0, 0, 0.1);
    border-radius: 4px;
}

.profile-edit-close-button {
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
.profile-photo img {
    width: 100px;
    height: 100px;
    border-radius: 50%;
}
.content_wrapper .data-loading {
    min-height: 150px;
    height: 50%;
    p {
        text-align: center;
        margin-top: 100px;
    }
}

/* Responsive design */
@media (max-width: 768px) {
    .profile-content {
        flex-direction: column;
        align-items: center;
    }
    .profile-photo {
        margin-right: 0;
        margin-bottom: 20px;
    }
    .profile-info {
        text-align: center;
    }
}
/* Button styles (for consistency with the image) */
.secondary-button {
    padding: 4px 10px;
    border-radius: 3px;
    text-decoration: none;
    font-weight: bold;
    display: inline-block;
    transition: background-color 0.3s;
    min-width: 135px;
    text-align: center;
    background-color: var(--primary-600);
    color: var(--text);
}
.button-container {
    margin-top: 10px;
}
.button-container a {
    margin-right: 10px;
}
.error-message {
    color: var(--error-500);
    font-weight: bold;
    margin-bottom: 10px;
}
.create-passkey-link {
    margin-top: 10px;
    text-align: center;
}
.create-passkey-link a {
    color: var(--primary-500);
    text-decoration: none;
}
.create-passkey-link a:hover {
    text-decoration: underline;
}
.create-passkey-form,
.temp-password-form {
    margin-top: 20px;
}
.create-passkey-form h3,
.temp-password-form h3 {
    margin-bottom: 15px;
}
.create-passkey-form .number,
.temp-password-form .number {
    margin-bottom: 15px;
}
.create-passkey-form label,
.temp-password-form label {
    display: block;
    margin-bottom: 5px;
}
.create-passkey-form input,
.temp-password-form input {
    width: 100%;
    padding: 5px;
    border: 1px solid var(--surface-400);
    border-radius: 4px;
}
.create-passkey-form .button-container,
.temp-password-form .button-container {
    display: flex;
    justify-content: space-between;
    margin-top: 15px;
}
.create-passkey-form .button-container a,
.temp-password-form .button-container a {
    flex: 1;
    margin: 0 5px;
}
</style>
