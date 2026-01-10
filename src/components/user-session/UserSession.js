import { ref, computed, onMounted, onUnmounted, nextTick } from "vue";
import loginManager from "../../js/LoginManager";
import { i18n } from "../../js/localization";

export function useUserSession() {
    const isLoggedIn = ref(false);
    const profile = ref(null);
    const menuOpen = ref(false);
    const menuStyle = ref({});
    const loginEmail = ref("");
    const loginError = ref(null);
    const verificationError = ref(null);
    const verificationCode = ref("");
    const dialogLoginRef = ref(null);
    const dialogVerificationRef = ref(null);
    const currentVerificationEmail = ref("");

    const displayName = computed(() => {
        return profile.value?.name || profile.value?.email || "";
    });

    const avatarUrl = computed(() => {
        return profile.value?.avatar || null;
    });

    const handleLoginClick = () => {
        openLoginDialog();
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

    const openLoginDialog = () => {
        loginEmail.value = "";
        loginError.value = null;
        if (dialogLoginRef.value) {
            dialogLoginRef.value.showModal();
        }
    };

    const closeLoginDialog = () => {
        if (dialogLoginRef.value?.open) {
            dialogLoginRef.value.close();
        }
    };

    const closeVerificationDialog = () => {
        if (dialogVerificationRef.value?.open) {
            dialogVerificationRef.value.close();
        }
    };

    const openVerificationDialog = (email) => {
        currentVerificationEmail.value = email;
        verificationCode.value = "";
        verificationError.value = null;
        if (dialogVerificationRef.value) {
            dialogVerificationRef.value.showModal();
            // Focus input after dialog opens
            nextTick(() => {
                const input = document.getElementById("verification-code-input");
                if (input) {
                    input.focus();
                }
            });
        }
    };

    const handleCreatePasskey = async () => {
        const email = loginEmail.value.trim();

        if (!email) {
            loginError.value = i18n.getMessage("userEmailRequired");
            return;
        }

        try {
            await loginManager.createPasskey(email);
            closeLoginDialog();
            openVerificationDialog(email);
        } catch (error) {
            loginError.value = i18n.getMessage("userCreatePasskeyFailed");
            console.error("Create passkey error:", error);
        }
    };

    const handleUsePasskey = async () => {
        const email = loginEmail.value.trim();

        if (!email) {
            loginError.value = i18n.getMessage("userEmailRequired");
            return;
        }

        try {
            await loginManager.loginWithPasskey(email);
            closeLoginDialog();
        } catch (error) {
            loginError.value = i18n.getMessage("userLoginFailed");
            console.error("Login with passkey error:", error);
        }
    };

    const handleVerificationSubmit = async () => {
        const code = verificationCode.value.trim();
        if (code) {
            try {
                await loginManager.verifyAndCreatePasskey(currentVerificationEmail.value, code);
                closeVerificationDialog();
            } catch (error) {
                verificationError.value = i18n.getMessage("userCreatePasskeyFailed");
                if (dialogVerificationRef.value && !dialogVerificationRef.value.open) {
                    dialogVerificationRef.value.showModal();
                }
                console.error("Verify passkey error:", error);
            }
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

        // Register dialog open callback with LoginManager
        loginManager.setDialogOpener(openLoginDialog);

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

        // Clear dialog opener
        loginManager.setDialogOpener(null);

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
        loginEmail,
        loginError,
        verificationError,
        verificationCode,
        dialogLoginRef,
        dialogVerificationRef,
        handleLoginClick,
        toggleMenu,
        handleSignOut,
        closeLoginDialog,
        closeVerificationDialog,
        handleCreatePasskey,
        handleUsePasskey,
        handleVerificationSubmit,
    };
}
