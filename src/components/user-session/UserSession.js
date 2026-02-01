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
    const verificationInputRef = ref(null);
    const dialogLoginRef = ref(null);
    const dialogVerificationRef = ref(null);
    const dialogWaitingRef = ref(null);
    const waitingMessage = ref("");
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
                if (verificationInputRef.value) {
                    verificationInputRef.value.focus();
                }
            });
        }
    };

    // Waiting dialog controls (component-managed)
    const showWaitingDialog = (message = i18n.getMessage("userLoggingIn")) => {
        waitingMessage.value = message || i18n.getMessage("userLoggingIn");
        const dlg = dialogWaitingRef.value;
        if (!dlg) return;
        try {
            dlg.showModal();
        } catch {
            if (!dlg.open) dlg.setAttribute("open", "open");
        }
    };

    const hideWaitingDialog = () => {
        const dlg = dialogWaitingRef.value;
        if (!dlg) return;
        if (dlg.open) {
            try {
                dlg.close();
            } catch {}
        }
        dlg.classList.remove("non-blocking");
        dlg.removeAttribute("inert");
    };

    const handleCreatePasskey = async () => {
        const email = loginEmail.value.trim();

        if (!email) {
            loginError.value = i18n.getMessage("userEmailRequired");
            return;
        }

        try {
            closeLoginDialog();
            await loginManager.createPasskey(email);
            openVerificationDialog(email);
        } catch (error) {
            openLoginDialog();
            loginError.value = i18n.getMessage("userCreatePasskeyFailed");
            console.error("Create passkey error:", error);
        }
    };

    const handleUsePasskey = async () => {
        const email = loginEmail.value.trim();

        try {
            closeLoginDialog();
            await loginManager.loginWithPasskey(email);
        } catch (error) {
            openLoginDialog();
            loginError.value = i18n.getMessage("userLoginFailed");
            console.error("Login with passkey error:", error);
        }
    };

    const handleVerificationSubmit = async () => {
        const code = verificationCode.value.trim();
        if (code) {
            try {
                closeVerificationDialog();
                await loginManager.verifyAndCreatePasskey(currentVerificationEmail.value, code);
            } catch (error) {
                openVerificationDialog(currentVerificationEmail.value);
                verificationError.value = i18n.getMessage("userCreatePasskeyFailed");
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
        // Register waiting dialog controller with LoginManager
        loginManager.setWaitingDialogController({ show: showWaitingDialog, hide: hideWaitingDialog });

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
        loginManager.setWaitingDialogController(null);

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
        verificationInputRef,
        dialogLoginRef,
        dialogVerificationRef,
        dialogWaitingRef,
        waitingMessage,
        handleLoginClick,
        toggleMenu,
        handleSignOut,
        showWaitingDialog,
        hideWaitingDialog,
        closeLoginDialog,
        closeVerificationDialog,
        handleCreatePasskey,
        handleUsePasskey,
        handleVerificationSubmit,
    };
}
