<template>
    <div class="justify-self-end-auto">
        <UDropdownMenu :items="getMenuItems()" v-if="isLoggedIn" :ui="{ content: 'z-3001' }">
            <UButton
                variant="ghost"
                color="neutral"
                size="xs"
                class="py-1"
                :aria-label="$t('tabUserProfile')"
                square
                :avatar="{
                    icon: 'i-lucide-user',
                    src: avatarUrl,
                    size: 'xs',
                }"
            >
            </UButton>
        </UDropdownMenu>
        <UTooltip :text="$t('labelLogin')" v-else :disabled="!isCompact">
            <UButton
                variant="ghost"
                color="neutral"
                :size="isCompact ? 'xs' : 'sm'"
                :class="{ 'py-2': !isCompact }"
                :square="isCompact"
                @click="handleLoginClick"
                icon="i-lucide-log-in"
                :aria-label="$t('labelLogin')"
            >
                {{ isCompact ? "" : $t("labelLogin") }}
            </UButton>
        </UTooltip>
        <Teleport to="#main-wrapper">
            <div v-show="menuOpen" id="user-menu-popup" class="user-popup-menu" :style="menuStyle">
                <div id="menu-username" class="menu-username">{{ displayName }}</div>
                <a href="#" id="menu-signout" class="menu-item" @click.prevent="handleSignOut">
                    <UIcon name="i-lucide-log-out" class="size-4" />
                    <span>{{ $t("labelSignOut") }}</span>
                </a>
            </div>

            <!-- Login Dialog -->
            <UModal v-model:open="loginDialogOpen" :ui="{ overlay: 'z-3000', content: 'max-w-sm z-3001' }">
                <template #header="{ close }">
                    <div class="flex items-start justify-between gap-2 w-full">
                        <div class="dialog-header-stack">
                            <div class="dialog-logo" aria-hidden="true"></div>
                            <h3 class="dialog-title">{{ loginTitle }}</h3>
                            <p class="dialog-description">{{ loginDescription }}</p>
                        </div>
                        <UButton
                            color="neutral"
                            variant="ghost"
                            icon="i-lucide-x"
                            size="sm"
                            :aria-label="$t('dialogClose')"
                            @click="close"
                        />
                    </div>
                </template>
                <template #body>
                    <!-- Passkey mode -->
                    <template v-if="loginMode === 'passkey'">
                        <div class="dialog-field">
                            <label for="login-email" class="dialog-label">{{ $t("labelEmail") }}</label>
                            <UInput
                                v-model="loginEmail"
                                type="email"
                                id="login-email"
                                class="w-full"
                                :placeholder="$t('placeholderEmailAddress')"
                                @keyup.enter="handleUsePasskey"
                            />
                        </div>
                        <p v-if="loginError" class="dialog-error">{{ loginError }}</p>

                        <UButton
                            block
                            icon="i-lucide-key-round"
                            :label="$t('labelSignInWithPasskey')"
                            @click="handleUsePasskey"
                        />

                        <div class="dialog-footer">
                            <p class="dialog-hint">
                                {{ $t("labelNoPasskeyPrompt") }}
                                <UButton
                                    variant="link"
                                    size="xs"
                                    :label="$t('labelSetOnePasskeyUp')"
                                    @click="handleCreatePasskey"
                                />
                            </p>
                            <UButton
                                variant="link"
                                size="xs"
                                color="neutral"
                                :label="$t('labelSignInWithEmailCode')"
                                @click="switchToCodeRequest"
                            />
                        </div>
                    </template>

                    <!-- Email-code request mode -->
                    <template v-else-if="loginMode === 'code-request'">
                        <div class="dialog-field">
                            <label for="login-email-code" class="dialog-label">{{ $t("labelEmail") }}</label>
                            <UInput
                                v-model="loginEmail"
                                type="email"
                                id="login-email-code"
                                class="w-full"
                                :placeholder="$t('placeholderEmailAddress')"
                                @keyup.enter="handleRequestCode"
                            />
                        </div>
                        <p v-if="loginError" class="dialog-error">{{ loginError }}</p>

                        <UButton
                            block
                            :label="$t('labelSendVerificationCode')"
                            :loading="loginSubmitting"
                            @click="handleRequestCode"
                        />

                        <div class="dialog-footer">
                            <UButton
                                variant="link"
                                size="xs"
                                color="neutral"
                                :label="$t('labelBackToPasskey')"
                                @click="switchToPasskey"
                            />
                        </div>
                    </template>

                    <!-- Email-code verify mode -->
                    <template v-else-if="loginMode === 'code-verify'">
                        <div class="dialog-field">
                            <label for="login-code-input" class="dialog-label">{{ $t("labelVerificationCode") }}</label>
                            <UInput
                                v-model="loginCode"
                                ref="loginCodeInputRef"
                                id="login-code-input"
                                type="password"
                                maxlength="8"
                                class="dialog-input-code w-full"
                                @keyup.enter="handleVerifyCode"
                            />
                        </div>
                        <p v-if="loginError" class="dialog-error">{{ loginError }}</p>

                        <UButton block :label="$t('submit')" :loading="loginSubmitting" @click="handleVerifyCode" />

                        <div class="dialog-footer">
                            <UButton
                                variant="link"
                                size="xs"
                                color="neutral"
                                :label="$t('labelBack')"
                                @click="switchToCodeRequest"
                            />
                        </div>
                    </template>
                </template>
            </UModal>

            <!-- Verification Code Dialog -->
            <UModal v-model:open="verificationDialogOpen" :ui="{ overlay: 'z-3000', content: 'max-w-sm z-3001' }">
                <template #header="{ close }">
                    <div class="flex items-start justify-between gap-2 w-full">
                        <div class="dialog-header-stack">
                            <h3 class="dialog-title">{{ $t("titleEnterVerificationCode") }}</h3>
                        </div>
                        <UButton
                            color="neutral"
                            variant="ghost"
                            icon="i-lucide-x"
                            size="sm"
                            :aria-label="$t('dialogClose')"
                            @click="close"
                        />
                    </div>
                </template>
                <template #body>
                    <div class="dialog-field">
                        <label for="verification-code-input" class="dialog-label">{{
                            $t("labelVerificationCode")
                        }}</label>
                        <UInput
                            v-model="verificationCode"
                            ref="verificationInputRef"
                            id="verification-code-input"
                            type="password"
                            class="dialog-input-code w-full"
                            @keyup.enter="handleVerificationSubmit"
                        />
                    </div>
                    <p v-if="verificationError" class="dialog-error">{{ verificationError }}</p>
                    <UButton block :label="$t('submit')" @click="handleVerificationSubmit" />
                </template>
            </UModal>

            <!-- Waiting Dialog -->
            <UModal
                v-model:open="waitingDialogOpen"
                :close="false"
                :dismissible="false"
                title=""
                :ui="{ overlay: 'z-3000', content: 'z-3001' }"
            >
                <template #body>
                    <div class="waiting-container">
                        <div class="waiting-spinner" aria-hidden="true"></div>
                        <p class="waiting-message">{{ waitingMessage }}</p>
                    </div>
                </template>
            </UModal>
        </Teleport>
    </div>
</template>

<script>
import { defineComponent } from "vue";
import { useUserSession } from "./UserSession";
import { switchTab } from "@/js/tab_switch.js";
import { sidebarItems } from "@/components/sidebar/sidebar_items.js";
import { i18n } from "@/js/localization";

export default defineComponent({
    name: "UserSession",
    props: {
        isCompact: {
            type: Boolean,
            default: false,
        },
    },
    setup() {
        const session = useUserSession();

        function getMenuItems() {
            const name = session.displayName.value || i18n.getMessage("tabUserProfile");
            const src = session.avatarUrl.value;
            const leadingItems = [
                {
                    label: name,
                    avatar: {
                        ...(src ? { src } : {}),
                        icon: "i-lucide-user",
                    },
                    type: "label",
                },
                { type: "separator" },
            ];
            const tabKeys = ["backups", "user_profile"];
            const trailingItems = [
                { type: "separator" },
                {
                    label: i18n.getMessage("labelSignOut"),
                    icon: "i-lucide-log-out",
                    color: "error",
                    onSelect: () => session.handleSignOut(),
                },
            ];

            return leadingItems.concat(
                sidebarItems
                    .filter((item) => tabKeys.includes(item.key))
                    .map((item) => ({
                        label: i18n.getMessage(item.i18n),
                        icon: item.icon,
                        onSelect: () => switchTab(item.key),
                    })),
                trailingItems,
            );
        }

        return {
            ...session,
            getMenuItems,
        };
    },
});
</script>

<style>
/* Unscoped styles for teleported popup menu */
.user-popup-menu {
    position: fixed;
    background-color: var(--surface-100);
    border: 1px solid var(--surface-400);
    border-radius: 10px;
    box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.3);
    width: 160px;
    z-index: 10000;
    margin-bottom: 4px;
}

.user-popup-menu #menu-username {
    padding: 10px 15px;
    font-weight: bold;
    border-bottom: 1px solid var(--surface-300);
    text-align: center;
}

.user-popup-menu .menu-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 15px;
    color: var(--text);
    text-decoration: none;
    transition: background-color 0.2s ease;
}

.user-popup-menu .menu-item i {
    width: 16px;
    text-align: center;
}

.user-popup-menu .menu-item:hover {
    background-color: var(--surface-300);
}

.user-popup-menu .menu-item:last-child {
    border-radius: 0 0 4px 4px;
}

/* Login dialogs */
.login-dialog {
    width: 360px;
    padding: 24px;
    border: 1px solid var(--surface-600);
    border-radius: 8px;
    background-color: var(--surface-100);
    color: var(--text);
}

.dialog-container {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.dialog-header-stack {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
    gap: 4px;
}

.dialog-logo {
    width: 180px;
    height: 36px;
    margin: 0 auto 12px;
    background-image: url(../../images/dark-wide-2.svg);
    background-repeat: no-repeat;
    background-position: center center;
    background-size: contain;
}

.dark .dialog-logo {
    background-image: url(../../images/light-wide-2.svg);
}

.dialog-description {
    margin: 0 0 16px 0;
    text-align: center;
    font-size: 12px;
    color: var(--text);
    opacity: 0.7;
}

.dialog-close-button {
    position: absolute;
    top: 10px;
    right: 10px;
}

.dialog-title {
    margin: 0 0 15px 0;
    text-align: center;
}

.dialog-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
}

.dialog-field {
    margin-bottom: 12px;
}

.dialog-error {
    color: var(--error-500);
    font-size: 12px;
    margin: 0 0 10px 0;
}

.dialog-label {
    display: block;
    margin-bottom: 5px;
    font-size: 12px;
}

.dialog-footer {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    margin-top: 12px;
    text-align: center;
}

.dialog-hint {
    margin: 0;
    font-size: 12px;
    color: var(--text);
    opacity: 0.75;
}

.dialog-input-code :deep(input) {
    text-align: center;
    letter-spacing: 0.15em;
}
</style>

<style scoped>
.waiting-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 120px;
    gap: 12px;
}
.waiting-spinner {
    border: 4px solid rgba(255, 255, 255, 0.2);
    border-top: 4px solid var(--primary-500);
    border-radius: 50%;
    width: 40px;
    height: 40px;
    animation: spin 1s linear infinite;
}
.waiting-message {
    font-size: 14px;
    color: var(--text);
    margin: 0;
    text-align: center;
}
@keyframes spin {
    0% {
        transform: rotate(0deg);
    }
    100% {
        transform: rotate(360deg);
    }
}
</style>
