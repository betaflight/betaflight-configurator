<template>
    <BaseTab tab-name="user_profile">
        <div class="content_wrapper">
            <div class="tab_title">{{ $t("tabUserProfile") }}</div>

            <!-- Loading State -->
            <div v-if="isLoading" class="flex items-center justify-center py-16">
                <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin text-[var(--color-primary-500)]" />
                <span class="ml-2 text-dimmed">{{ $t("dataWaitingForData") }}</span>
            </div>

            <!-- Not Logged In State -->
            <div v-else-if="!isLoggedIn" class="grid-box col3">
                <div class="options col-span-1"></div>
                <UiBox class="options col-span-1" :title="$t('notLoggedIn')">
                    <p>{{ $t("profileLoginMessage") }}</p>
                    <div class="button-container" style="text-align: center">
                        <button type="button" class="regular-button" @click="showLoginDialog">
                            {{ $t("labelLogin") }}
                        </button>
                    </div>
                </UiBox>
                <div class="options col-span-1"></div>
            </div>

            <!-- Logged In State -->
            <div v-else class="profile grid-box col3">
                <div class="options col-span-3"></div>
                <UiBox v-if="profile" class="options col-span-3">
                    <div class="profile-content">
                        <img :src="profilePhoto" alt="Profile" class="profile-photo" />
                        <div class="profile-info">
                            <p>
                                <span class="title">{{ $t("labelName") }}</span>
                                <span>{{ profile.name }}</span>
                            </p>
                            <p>
                                <span class="title">{{ $t("labelEmail") }}</span>
                                <span>{{ profile.email }}</span>
                            </p>
                            <p>
                                <span class="title">{{ $t("labelAddress") }}</span>
                                <span>{{ profile.address }}</span>
                            </p>
                            <p>
                                <span class="title">{{ $t("labelCountry") }}</span>
                                <span>{{ profile.country }}</span>
                            </p>
                        </div>

                        <div class="button-container">
                            <button type="button" class="regular-button" @click="startEdit">
                                {{ $t("actionEdit") }}
                            </button>
                        </div>
                    </div>
                </UiBox>

                <!-- Edit Profile Dialog -->
                <dialog ref="editDialogRef" class="profile-edit-dialog" @cancel="cancelEdit">
                    <h3>{{ $t("titleEditProfile") }}</h3>
                    <div class="profile-edit-form">
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
                        <div class="buttons">
                            <button type="button" class="regular-button" @click="saveProfileChanges">
                                {{ $t("actionSave") }}
                            </button>
                            <button type="button" class="regular-button" @click="cancelEdit">
                                {{ $t("cancel") }}
                            </button>
                        </div>
                    </div>
                </dialog>

                <!-- Token Section -->
                <UiBox class="options col-span-3" :title="$t('sectionUserTokens')">
                    <UTable :data="tokens" :columns="tokenColumns" :empty="$t('userTokenNoTokens')" class="text-sm">
                        <template #created-cell="{ row }">
                            {{ formatDate(row.original.created) }}
                        </template>
                        <template #expiry-cell="{ row }">
                            {{ formatDate(row.original.expiry) }}
                        </template>
                        <template #details-cell="{ row }">
                            <span class="text-dimmed">
                                {{ row.original.details || row.original.client?.address || "-" }}
                            </span>
                        </template>
                        <template #actions-cell="{ row }">
                            <UButton
                                size="xs"
                                variant="soft"
                                color="error"
                                icon="i-lucide-trash-2"
                                @click="deleteToken(row.original.id)"
                            >
                                {{ $t("actionDelete") }}
                            </UButton>
                        </template>
                    </UTable>
                </UiBox>

                <!-- Passkeys Section -->
                <UiBox class="options col-span-3" :title="$t('sectionUserPasskeys')">
                    <UTable
                        :data="passkeys"
                        :columns="passkeyColumns"
                        :empty="$t('userPasskeyNoPasskeys')"
                        class="text-sm"
                    >
                        <template #createdAtUtc-cell="{ row }">
                            {{ formatDate(row.original.createdAtUtc) }}
                        </template>
                        <template #updatedAtUtc-cell="{ row }">
                            {{ formatDate(row.original.updatedAtUtc) }}
                        </template>
                        <template #details-cell="{ row }">
                            <span class="text-dimmed">{{ row.original.client?.address || "-" }}</span>
                        </template>
                        <template #actions-cell="{ row }">
                            <UButton
                                size="xs"
                                variant="soft"
                                color="error"
                                icon="i-lucide-trash-2"
                                @click="deletePasskey(row.original.id)"
                            >
                                {{ $t("actionDelete") }}
                            </UButton>
                        </template>
                    </UTable>
                </UiBox>
            </div>
        </div>
    </BaseTab>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useTranslation } from "i18next-vue";
import BaseTab from "./BaseTab.vue";
import UiBox from "../elements/UiBox.vue";
import { useDialog } from "@/composables/useDialog";
import loginManager from "../../js/LoginManager";
import { gui_log } from "../../js/gui_log";

const { t } = useTranslation();
const dialog = useDialog();

const isLoading = ref(true);
const isLoggedIn = ref(false);
const editError = ref(null);
const profile = ref(null);
const editForm = ref({ name: "", address: "", country: "", avatar: "" });
const tokens = ref([]);
const passkeys = ref([]);
const editDialogRef = ref(null);
let userApi = null;
let unsubscribeLogin = null;
let unsubscribeLogout = null;

const tokenColumns = computed(() => [
    { accessorKey: "id", header: t("labelId") },
    { accessorKey: "created", header: t("labelCreated") },
    { accessorKey: "expiry", header: t("labelExpiry") },
    { accessorKey: "details", header: t("labelDetails") },
    { id: "actions", header: t("labelActions") },
]);

const passkeyColumns = computed(() => [
    { accessorKey: "id", header: t("labelId") },
    { accessorKey: "createdAtUtc", header: t("labelCreated") },
    { accessorKey: "updatedAtUtc", header: t("labelLastUsed") },
    { accessorKey: "details", header: t("labelDetails") },
    { id: "actions", header: t("labelActions") },
]);

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
            userApi = null;
            isLoggedIn.value = false;
            profile.value = null;
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
            profile.value = null;
            gui_log(`${t("userProfileLoadFailed")}: ${error}`);
        }

        try {
            tokens.value = await userApi.getTokens();
        } catch (error) {
            tokens.value = [];
            gui_log(`${t("userTokenLoadFailed")}: ${error}`);
        }
    } catch (error) {
        console.error("Error checking login state:", error);
        userApi = null;
        isLoggedIn.value = false;
        profile.value = null;
        tokens.value = [];
        passkeys.value = [];
        isLoading.value = false;
        return;
    }

    try {
        passkeys.value = await userApi.getPasskeys();
    } catch (error) {
        passkeys.value = [];
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
    editDialogRef.value?.showModal();
}

function cancelEdit() {
    editError.value = null;
    editDialogRef.value?.close();
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
        editDialogRef.value?.close();
    } catch (error) {
        editError.value = `${t("userProfileUpdateFailed")}: ${error.message || error}`;
        gui_log(editError.value);
    }
}

async function deleteToken(tokenId) {
    const confirmed = await dialog.showYesNo(t("actionDelete"), t("confirmDelete", { item: t("itemToken") }));
    if (!confirmed) {
        return;
    }

    if (!userApi) {
        gui_log(t("notLoggedIn"));
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
    const confirmed = await dialog.showYesNo(t("actionDelete"), t("confirmDelete", { item: t("itemPasskey") }));
    if (!confirmed) {
        return;
    }

    if (!userApi) {
        gui_log(t("notLoggedIn"));
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

<style lang="less">
.tab-user_profile {
    font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;

    .profile {
        margin-top: 20px;
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

        p {
            margin: 10px 0;
            font-size: 14px;
        }

        .title {
            color: var(--color-primary-500);
            font-weight: 600;
            margin-right: 5px;
            min-width: 60px;
            display: inline-block;
        }
    }

    .profile-edit-dialog {
        z-index: 1000;
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        margin: 0;
        width: 90%;
        max-width: 600px;
        max-height: 90vh;
        overflow-y: auto;
        border: 1px solid var(--surface-400);
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);

        &::backdrop {
            background: rgba(0, 0, 0, 0.5);
        }
    }

    .profile-edit-form {
        label {
            display: block;
            margin-bottom: 5px;
            font-weight: bold;
        }

        input {
            width: 100%;
            padding: 5px;
            margin-bottom: 10px;
            border: 1px solid var(--surface-400);
            border-radius: 4px;
        }
    }

    .profile-edit-error {
        color: var(--error-500);
        font-size: 12px;
        margin: 10px 0;
        padding: 8px;
        background-color: rgba(255, 0, 0, 0.1);
        border-radius: 4px;
    }

    .content_wrapper .data-loading {
        min-height: 150px;
        height: 50%;

        p {
            text-align: center;
            margin-top: 100px;
        }
    }

    .button-container {
        margin-top: 10px;
    }
}

@media (max-width: 768px) {
    .tab-user_profile {
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
}
</style>
