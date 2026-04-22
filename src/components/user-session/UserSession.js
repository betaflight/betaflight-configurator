import { ref, computed, onMounted, onUnmounted, nextTick } from "vue";
import loginManager from "../../js/LoginManager";
import { i18n } from "../../js/localization";

// Login dialog modes
const MODE_PASSKEY = "passkey";
const MODE_CODE_REQUEST = "code-request";
const MODE_CODE_VERIFY = "code-verify";

export function useUserSession() {
    const isLoggedIn = ref(false);
    const profile = ref(null);
    const menuOpen = ref(false);
    const menuStyle = ref({});

    // Unified login dialog state
    const loginMode = ref(MODE_PASSKEY);
    const loginEmail = ref("");
    const loginCode = ref("");
    const loginError = ref(null);
    const loginSubmitting = ref(false);
    const loginCodeInputRef = ref(null);
    const codeEmail = ref("");

    const loginDialogOpen = ref(false);
    const waitingDialogOpen = ref(false);
    const waitingMessage = ref("");

    // Legacy passkey-creation verification dialog
    const verificationError = ref(null);
    const verificationCode = ref("");
    const verificationInputRef = ref(null);
    const verificationDialogOpen = ref(false);
    const currentVerificationEmail = ref("");

    const displayName = computed(() => {
        return profile.value?.name || profile.value?.email || "";
    });

    const avatarUrl = computed(() => {
        return profile.value?.avatar || null;
    });

    const loginTitle = computed(() => {
        return loginMode.value === MODE_CODE_VERIFY
            ? i18n.getMessage("titleEnterVerificationCode")
            : i18n.getMessage("titleLogin");
    });

    const loginDescription = computed(() => {
        if (loginMode.value === MODE_CODE_REQUEST) {
            return i18n.getMessage("descriptionCodeRequest");
        }
        if (loginMode.value === MODE_CODE_VERIFY) {
            return i18n.getMessage("descriptionCodeEntered", [codeEmail.value]);
        }
        return i18n.getMessage("descriptionPasskeyLogin");
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

    const resetLoginDialog = () => {
        loginMode.value = MODE_PASSKEY;
        loginEmail.value = "";
        loginCode.value = "";
        loginError.value = null;
        loginSubmitting.value = false;
        codeEmail.value = "";
    };

    const showLoginDialog = () => {
        loginDialogOpen.value = true;
    };

    const openLoginDialog = () => {
        resetLoginDialog();
        showLoginDialog();
    };

    const closeLoginDialog = () => {
        loginDialogOpen.value = false;
    };

    const switchToCodeRequest = () => {
        loginMode.value = MODE_CODE_REQUEST;
        loginError.value = null;
        loginCode.value = "";
    };

    const switchToPasskey = () => {
        loginMode.value = MODE_PASSKEY;
        loginError.value = null;
        loginCode.value = "";
    };

    const focusCodeInput = () => {
        nextTick(() => {
            loginCodeInputRef.value?.inputRef?.focus();
        });
    };

    const closeVerificationDialog = () => {
        verificationDialogOpen.value = false;
    };

    const openVerificationDialog = (email) => {
        currentVerificationEmail.value = email;
        verificationCode.value = "";
        verificationError.value = null;
        verificationDialogOpen.value = true;
        nextTick(() => {
            verificationInputRef.value?.inputRef?.focus();
        });
    };

    const showWaitingDialog = (message = i18n.getMessage("userLoggingIn")) => {
        waitingMessage.value = message || i18n.getMessage("userLoggingIn");
        waitingDialogOpen.value = true;
    };

    const hideWaitingDialog = () => {
        waitingDialogOpen.value = false;
    };

    const handleUsePasskey = async () => {
        const email = loginEmail.value.trim();

        if (!email) {
            loginError.value = i18n.getMessage("userEmailRequired");
            return;
        }

        loginError.value = null;

        try {
            closeLoginDialog();
            await loginManager.loginWithPasskey(email);
        } catch (error) {
            showLoginDialog();
            loginError.value = i18n.getMessage("userLoginFailed");
            console.error("Login with passkey error:", error);
        }
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
            showLoginDialog();
            loginError.value = i18n.getMessage("userCreatePasskeyFailed");
            console.error("Create passkey error:", error);
        }
    };

    const handleRequestCode = async () => {
        if (loginSubmitting.value) {
            return;
        }

        const email = loginEmail.value.trim();

        if (!email) {
            loginError.value = i18n.getMessage("userEmailRequired");
            return;
        }

        loginError.value = null;
        loginSubmitting.value = true;

        try {
            await loginManager.requestVerificationCode(email);
            codeEmail.value = email;
            loginMode.value = MODE_CODE_VERIFY;
            loginCode.value = "";
            focusCodeInput();
        } catch (error) {
            loginError.value = error?.message || i18n.getMessage("userSendCodeFailed");
        } finally {
            loginSubmitting.value = false;
        }
    };

    const handleVerifyCode = async () => {
        if (loginSubmitting.value) {
            return;
        }

        const code = loginCode.value.trim();

        if (!code) {
            loginError.value = i18n.getMessage("userCodeRequired");
            return;
        }

        loginError.value = null;
        loginSubmitting.value = true;

        try {
            await loginManager.loginWithEmailCode(codeEmail.value, code);
            closeLoginDialog();
        } catch (error) {
            loginError.value = error?.message || i18n.getMessage("userLoginFailed");
        } finally {
            loginSubmitting.value = false;
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
        if (unsubscribeLogin) {
            unsubscribeLogin();
        }
        if (unsubscribeLogout) {
            unsubscribeLogout();
        }

        loginManager.setDialogOpener(null);
        loginManager.setWaitingDialogController(null);

        document.removeEventListener("click", handleClickOutside);
    });

    return {
        isLoggedIn,
        profile,
        displayName,
        avatarUrl,
        menuOpen,
        menuStyle,
        loginMode,
        loginEmail,
        loginCode,
        loginError,
        loginSubmitting,
        loginTitle,
        loginDescription,
        loginCodeInputRef,
        loginDialogOpen,
        waitingDialogOpen,
        waitingMessage,
        verificationError,
        verificationCode,
        verificationInputRef,
        verificationDialogOpen,
        handleLoginClick,
        toggleMenu,
        handleSignOut,
        showWaitingDialog,
        hideWaitingDialog,
        closeLoginDialog,
        switchToCodeRequest,
        switchToPasskey,
        handleUsePasskey,
        handleCreatePasskey,
        handleRequestCode,
        handleVerifyCode,
        closeVerificationDialog,
        handleVerificationSubmit,
    };
}
