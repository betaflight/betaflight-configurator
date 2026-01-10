import { ref, computed, onMounted, onUnmounted } from "vue";
import loginManager from "../../js/LoginManager";

export function useUserSession() {
    const isLoggedIn = ref(false);
    const profile = ref(null);
    const menuOpen = ref(false);
    const menuStyle = ref({});

    const displayName = computed(() => {
        return profile.value?.name || profile.value?.email || "";
    });

    const avatarUrl = computed(() => {
        return profile.value?.avatar || null;
    });

    const handleLoginClick = () => {
        loginManager.showLoginDialog();
    };

    const updateMenuPosition = () => {
        const trigger = document.getElementById("user-menu-trigger");
        if (trigger) {
            const rect = trigger.getBoundingClientRect();
            menuStyle.value = {
                position: "fixed",
                left: `${rect.left}px`,
                bottom: `${window.innerHeight - rect.top}px`,
            };
        }
    };

    const toggleMenu = () => {
        menuOpen.value = !menuOpen.value;
        if (menuOpen.value) {
            updateMenuPosition();
        }
    };

    const handleSignOut = async () => {
        menuOpen.value = false;
        await loginManager.signOut();
    };

    const updateLoginState = async () => {
        isLoggedIn.value = await loginManager.isUserLoggedIn();
        if (isLoggedIn.value) {
            await loginManager.fetchUserProfile();
            profile.value = loginManager.getUserProfile();
        } else {
            profile.value = null;
        }
    };

    const handleClickOutside = (event) => {
        const userLoggedIn = document.getElementById("user-logged-in");
        const popup = document.getElementById("user-menu-popup");

        // Check if click is inside either the user-logged-in container or the popup menu
        const clickInsideSession = userLoggedIn?.contains(event.target);
        const clickInsidePopup = popup?.contains(event.target);

        if (!clickInsideSession && !clickInsidePopup) {
            menuOpen.value = false;
        }
    };

    // Register callbacks for login/logout events
    let unsubscribeLogin;
    let unsubscribeLogout;

    onMounted(async () => {
        await updateLoginState();

        // Register login/logout callbacks
        unsubscribeLogin = loginManager.onLogin(updateLoginState);
        unsubscribeLogout = loginManager.onLogout(updateLoginState);

        // Add click outside listener
        document.addEventListener("click", handleClickOutside);
    });

    onUnmounted(() => {
        // Cleanup callbacks
        if (unsubscribeLogin) {
            unsubscribeLogin();
        }

        if (unsubscribeLogout) {
            unsubscribeLogout();
        }

        // Remove click outside listener
        document.removeEventListener("click", handleClickOutside);
    });

    return {
        isLoggedIn,
        profile,
        displayName,
        avatarUrl,
        menuOpen,
        menuStyle,
        handleLoginClick,
        toggleMenu,
        handleSignOut,
    };
}
