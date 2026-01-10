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
                    <h3 class="dialog-title">{{ $t("titleLogin") }}</h3>
                    <div class="dialog-content">
                        <div class="dialog-input-group">
                            <label for="login-email" class="dialog-label">{{ $t("labelEmail") }}</label>
                            <input
                                v-model="loginEmail"
                                type="email"
                                id="login-email"
                                :placeholder="$t('placeholderEmailAddress')"
                                class="dialog-input"
                            />
                        </div>
                    </div>
                    <div class="dialog-buttons dialog-buttons-split">
                        <a href="#" class="regular-button dialog-passkey-button" @click.prevent="handleCreatePasskey">{{
                            $t("labelCreatePasskey")
                        }}</a>
                        <span class="dialog-separator">OR</span>
                        <a href="#" class="regular-button dialog-passkey-button" @click.prevent="handleUsePasskey">{{
                            $t("labelUsePasskey")
                        }}</a>
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
                                type="text"
                                id="verification-code-input"
                                placeholder=""
                                class="dialog-input"
                                @keypress.enter="handleVerificationSubmit"
                            />
                        </div>
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
        height: 64px;
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

    /* Hide username on smaller screens */
    @media (max-width: 1055px) {
        .username {
            display: none;
        }
    }

    /* Show username when menu is revealed on mobile */
    @media (max-width: 575px) {
        .tab_container.reveal & .username {
            display: block;
        }
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
    aspect-ratio: 16 / 9;
    padding: 20px;
    border: 1px solid var(--surface-600);
    border-radius: 8px;
}

.dialog-container {
    display: flex;
    flex-direction: column;
    height: 100%;
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
}

.dialog-buttons-split {
    flex-direction: row;
    gap: 10px;
    align-items: center;
    text-align: center;
}

.dialog-passkey-button {
    padding: 6px 12px;
    text-decoration: none;
    font-size: 12px;
    width: 120px;
    margin-left: 10px;
}

.dialog-separator {
    font-size: 12px;
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    flex-shrink: 0;
}

.dialog-submit-button {
    padding: 8px 24px;
    text-decoration: none;
}
</style>
