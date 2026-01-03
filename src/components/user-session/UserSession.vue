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
                <span id="user-login-display" class="username">{{ $t("user-session-login") }}</span>
            </a>
        </div>

        <div v-else id="user-logged-in" class="session-view">
            <a href="#" id="user-menu-trigger" class="tabicon" @click.prevent="toggleMenu">
                <img
                    id="user-gravatar"
                    :src="avatarUrl || '/images/default-user-avatar.png'"
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
                    <span>{{ $t("user-session-signOut") }}</span>
                </a>
            </div>
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
</style>
