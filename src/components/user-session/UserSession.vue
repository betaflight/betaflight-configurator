<template>
    <div id="user-session-container">
        <div v-if="!isLoggedIn" id="user-logged-out" class="session-view">
            <a href="#" id="open-login" class="tabicon" @click.prevent="handleLoginClick">
                <img
                    id="user-default-gravatar"
                    src="/images/default-user-avatar.png"
                    alt="User Default Avatar"
                    class="user-avatar-icon"
                />
                <span id="user-login-display" class="username">{{ $t("labelLogin") }}</span>
            </a>
        </div>

        <div v-else id="user-logged-in" class="session-view">
            <a href="#" id="user-menu-trigger" class="tabicon" @click.prevent="toggleMenu">
                <img
                    id="user-gravatar"
                    :src="avatarUrl || '/images/default-user-avatar-loggedin.png'"
                    alt="User Avatar"
                    class="user-avatar-icon"
                />
                <span id="username-display" class="username">{{ displayName }}</span>
            </a>
        </div>
        <Teleport to="body">
            <div v-show="menuOpen" id="user-menu-popup" class="user-popup-menu" :style="menuStyle">
                <div id="menu-username" class="menu-username">{{ displayName }}</div>
                <a href="#" id="menu-signout" class="menu-item" @click.prevent="handleSignOut">
                    <i class="fas fa-sign-out-alt"></i>
                    <span>{{ $t("labelSignOut") }}</span>
                </a>
            </div>

            <!-- Login Dialog -->
            <dialog ref="dialogLoginRef" class="login-dialog">
                <div class="dialog-container">
                    <button class="dialog-close-button" aria-label="Close" @click.prevent="closeLoginDialog">
                        &times;
                    </button>
                    <div class="dialog-logo" aria-hidden="true"></div>
                    <h3 class="dialog-title">{{ loginTitle }}</h3>
                    <p class="dialog-description">{{ loginDescription }}</p>

                    <div class="dialog-content">
                        <!-- Passkey mode -->
                        <template v-if="loginMode === 'passkey'">
                            <div class="dialog-input-group">
                                <label for="login-email" class="dialog-label">{{ $t("labelEmail") }}</label>
                                <input
                                    v-model="loginEmail"
                                    type="email"
                                    id="login-email"
                                    :placeholder="$t('placeholderEmailAddress')"
                                    class="dialog-input"
                                    @keyup.enter="handleUsePasskey"
                                />
                            </div>
                            <p v-if="loginError" class="dialog-error">{{ loginError }}</p>

                            <div class="dialog-buttons">
                                <a
                                    href="#"
                                    class="regular-button dialog-primary-button"
                                    @click.prevent="handleUsePasskey"
                                >
                                    <i class="fas fa-key dialog-button-icon"></i>
                                    <span>{{ $t("labelSignInWithPasskey") }}</span>
                                </a>
                            </div>

                            <div class="dialog-footer">
                                <p class="dialog-hint">
                                    {{ $t("labelNoPasskeyPrompt") }}
                                    <a href="#" class="dialog-link" @click.prevent="handleCreatePasskey">{{
                                        $t("labelSetOnePasskeyUp")
                                    }}</a>
                                </p>
                                <a
                                    href="#"
                                    class="dialog-link dialog-link-muted"
                                    @click.prevent="switchToCodeRequest"
                                    >{{ $t("labelSignInWithEmailCode") }}</a
                                >
                            </div>
                        </template>

                        <!-- Email-code request mode -->
                        <template v-else-if="loginMode === 'code-request'">
                            <div class="dialog-input-group">
                                <label for="login-email-code" class="dialog-label">{{ $t("labelEmail") }}</label>
                                <input
                                    v-model="loginEmail"
                                    type="email"
                                    id="login-email-code"
                                    :placeholder="$t('placeholderEmailAddress')"
                                    class="dialog-input"
                                    @keyup.enter="handleRequestCode"
                                />
                            </div>
                            <p v-if="loginError" class="dialog-error">{{ loginError }}</p>

                            <div class="dialog-buttons">
                                <a
                                    href="#"
                                    class="regular-button dialog-primary-button"
                                    :class="{ 'button-disabled': loginSubmitting }"
                                    @click.prevent="handleRequestCode"
                                >
                                    {{ $t("labelSendVerificationCode") }}
                                </a>
                            </div>

                            <div class="dialog-footer">
                                <a href="#" class="dialog-link dialog-link-muted" @click.prevent="switchToPasskey">{{
                                    $t("labelBackToPasskey")
                                }}</a>
                            </div>
                        </template>

                        <!-- Email-code verify mode -->
                        <template v-else-if="loginMode === 'code-verify'">
                            <div class="dialog-input-group">
                                <label for="login-code-input" class="dialog-label">{{
                                    $t("labelVerificationCode")
                                }}</label>
                                <input
                                    v-model="loginCode"
                                    ref="loginCodeInputRef"
                                    type="text"
                                    id="login-code-input"
                                    maxlength="8"
                                    class="dialog-input dialog-input-code"
                                    @keyup.enter="handleVerifyCode"
                                />
                            </div>
                            <p v-if="loginError" class="dialog-error">{{ loginError }}</p>

                            <div class="dialog-buttons">
                                <a
                                    href="#"
                                    class="regular-button dialog-primary-button"
                                    :class="{ 'button-disabled': loginSubmitting }"
                                    @click.prevent="handleVerifyCode"
                                >
                                    {{ $t("submit") }}
                                </a>
                            </div>

                            <div class="dialog-footer">
                                <a
                                    href="#"
                                    class="dialog-link dialog-link-muted"
                                    @click.prevent="switchToCodeRequest"
                                    >{{ $t("labelBack") }}</a
                                >
                            </div>
                        </template>
                    </div>
                </div>
            </dialog>

            <!-- Verification Code Dialog -->
            <dialog ref="dialogVerificationRef" class="login-dialog">
                <div class="dialog-container">
                    <button class="dialog-close-button" aria-label="Close" @click.prevent="closeVerificationDialog">
                        &times;
                    </button>
                    <h3 class="dialog-title">{{ $t("titleEnterVerificationCode") }}</h3>
                    <div class="dialog-content">
                        <div class="dialog-input-group">
                            <label for="verification-code-input" class="dialog-label">{{
                                $t("labelVerificationCode")
                            }}</label>
                            <input
                                v-model="verificationCode"
                                ref="verificationInputRef"
                                type="text"
                                id="verification-code-input"
                                placeholder=""
                                class="dialog-input"
                                @keyup.enter="handleVerificationSubmit"
                            />
                        </div>
                        <p v-if="verificationError" class="dialog-error">{{ verificationError }}</p>
                    </div>
                    <div class="dialog-buttons">
                        <a
                            href="#"
                            class="regular-button dialog-submit-button"
                            @click.prevent="handleVerificationSubmit"
                            >{{ $t("submit") }}</a
                        >
                    </div>
                </div>
            </dialog>

            <!-- Waiting Dialog (component-managed, non-blocking capable) -->
            <dialog ref="dialogWaitingRef" class="login-dialog waiting-dialog">
                <div class="dialog-container waiting-container">
                    <div class="waiting-spinner" aria-hidden="true"></div>
                    <p class="waiting-message">{{ waitingMessage }}</p>
                </div>
            </dialog>
        </Teleport>
    </div>
</template>

<script>
import { defineComponent } from "vue";
import { useUserSession } from "./UserSession";

export default defineComponent({
    name: "UserSession",

    setup() {
        return useUserSession();
    },
});
</script>

<style scoped>
#user-session-container {
    background-color: var(--surface-100);
    border-radius: 1rem;
    font-size: 13px;
    padding: 0;
    position: relative;
    margin-top: auto;
    margin-bottom: 1rem;

    #open-login,
    #user-menu-trigger {
        position: relative;
        width: 100%;
    }

    #user-logged-out {
        #open-login {
            display: flex;
            flex-direction: row;
            align-items: center;
            gap: 8px;
            padding: 0.5rem;
            color: var(--text);
            text-decoration: none;
            cursor: pointer;
            transition: all 0.2s ease;

            &:hover {
                background-color: var(--surface-200);
                border-radius: 0.5rem;
            }
        }
    }

    #user-logged-in {
        #user-menu-trigger {
            display: flex;
            flex-direction: row;
            align-items: center;
            gap: 8px;
            padding: 0.5rem;
            color: var(--text);
            text-decoration: none;
            cursor: pointer;
            transition: all 0.2s ease;
            z-index: 0;
            &:hover {
                background-color: var(--surface-200);
                border-radius: 0.5rem;
            }
        }
    }

    .user-avatar-icon {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        object-fit: cover;
        flex-shrink: 0;
    }

    .username {
        font-size: 11px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex: 1;
    }

    /* Show username when the compact navigation drawer is revealed */
    @media (max-width: 575px), (max-width: 950px) and (max-height: 500px) and (orientation: landscape) {
        margin-bottom: 0.25rem;
        padding: 0.5rem 0;
        :global(.tab_container.reveal) & .username {
            display: block;
        }
        .user-avatar-icon {
            width: 32px;
            height: 32px;
        }
    }

    :global(body.compact-header-layout .tab_container.reveal) & .username {
        display: block;
    }
}
</style>

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

.dialog-input-group {
    margin-bottom: 15px;
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

.dialog-input {
    width: 100%;
    padding: 8px;
    border: 1px solid var(--surface-500);
    border-radius: 4px;
    background-color: var(--surface-100);
    color: var(--text);
    box-sizing: border-box;
}

.dialog-buttons {
    display: flex;
    justify-content: center;
    margin-top: 4px;
}

.dialog-primary-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 10px 16px;
    text-decoration: none;
    font-size: 13px;
    text-align: center;
    box-sizing: border-box;
}

.dialog-button-icon {
    font-size: 12px;
}

.button-disabled {
    opacity: 0.6;
    pointer-events: none;
}

.dialog-footer {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    margin-top: 16px;
    text-align: center;
}

.dialog-hint {
    margin: 0;
    font-size: 12px;
    color: var(--text);
    opacity: 0.75;
}

.dialog-link {
    color: var(--primary-500);
    font-size: 12px;
    text-decoration: none;
}

.dialog-link:hover {
    text-decoration: underline;
}

.dialog-link-muted {
    color: var(--text);
    opacity: 0.7;
}

.dialog-input-code {
    text-align: center;
    letter-spacing: 0.15em;
}

.dialog-submit-button {
    padding: 8px 24px;
    text-decoration: none;
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
