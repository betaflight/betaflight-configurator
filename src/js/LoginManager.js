import $ from "jquery";
import { i18n } from "./localization";
import { gui_log } from "./gui_log";
import LoginApi from "./LoginApi";
import UserApi from "./UserApi";

/**
 * LoginManager - Handles user authentication using passkeys
 * This is a global login manager that works independently of any specific tab
 */
class LoginManager {
    _loginApi = new LoginApi();
    _userApi = new UserApi(this._loginApi);
    _profile = null;
    _onLoginCallbacks = [];
    _onLogoutCallbacks = [];
    _dialogOpener = null;
    _waitingDialogController = null;

    /**
     * Set the dialog opener callback from Vue component
     */
    setDialogOpener(callback) {
        this._dialogOpener = callback;
    }

    /**
     * Set a controller from Vue to manage the waiting dialog
     * @param {{show: Function, hide: Function}|null} controller
     */
    setWaitingDialogController(controller) {
        this._waitingDialogController = controller;
    }

    /**
     * Initialize the login manager and set up UI handlers
     */
    async initialize() {
        await this.fetchUserProfile();

        // Update tab visibility based on login state
        await this.updateTabVisibility();
    }

    /**
     * Show waiting dialog
     * @param {string} message Message to display
     */
    showWaitingDialog(message = "Processing passkey authentication...") {
        // Only use Vue component controller
        if (this._waitingDialogController && typeof this._waitingDialogController.show === "function") {
            try {
                this._waitingDialogController.show(message);
            } catch (error) {
                console.error("Error showing waiting dialog:", error);
            }
        }
    }

    /**
     * Hide waiting dialog
     */
    hideWaitingDialog() {
        // Only use Vue component controller
        if (this._waitingDialogController && typeof this._waitingDialogController.hide === "function") {
            try {
                this._waitingDialogController.hide();
            } catch (error) {
                console.error("Error hiding waiting dialog:", error);
            }
        }
    }

    /**
     * Show the login dialog
     */
    showLoginDialog() {
        // Call the Vue component's dialog opener if available
        if (this._dialogOpener) {
            this._dialogOpener();
        }
    }

    /**
     * Create a new passkey for the user
     */
    async createPasskey(email) {
        try {
            this.showWaitingDialog(i18n.getMessage("userCreatingPasskey"));

            // Request temporary password/verification code
            await this._loginApi.requestTemporaryPassword(email);
            this.hideWaitingDialog();
        } catch (error) {
            this.hideWaitingDialog();
            gui_log(`${i18n.getMessage("userCreatePasskeyFailed")}: ${error}`);
            console.error("Create passkey error:", error);
        }
    }

    /**
     * Verify code and create passkey
     */
    async verifyAndCreatePasskey(email, code) {
        try {
            // Show non-blocking waiting dialog so OS/browser UI can surface
            this.showWaitingDialog(i18n.getMessage("userVerifyingCode"), true);

            const result = await this._loginApi.createCredentialOptions(email, code);
            await this._loginApi.createCredential(result.key, result.options);

            gui_log(i18n.getMessage("userCreatePasskeySuccess"));

            // Fetch user profile data
            await this.fetchUserProfile();
            await this.updateTabVisibility();
            this.notifyLoginCallbacks();

            this.hideWaitingDialog();
        } catch (error) {
            this.hideWaitingDialog();
            gui_log(`${i18n.getMessage("userCreatePasskeyFailed")}: ${error}`);
            console.error("Verify and create passkey error:", error);
        }
    }

    /**
     * Update tab visibility based on login state
     */
    async updateTabVisibility() {
        if (await this.isUserLoggedIn()) {
            $("#tabs ul.mode-loggedin").show();
        } else {
            $("#tabs ul.mode-loggedin").hide();
        }
    }

    /**
     * Login with existing passkey
     */
    async loginWithPasskey(email) {
        try {
            // Show non-blocking waiting dialog so OS/browser UI can surface
            this.showWaitingDialog(i18n.getMessage("userLoggingIn"), true);

            const result = await this._loginApi.createAssertionOptions(email);
            await this._loginApi.verifyAssertion(result.key, result.options);

            // Fetch user profile data
            await this.fetchUserProfile();

            await this.updateTabVisibility();
            this.notifyLoginCallbacks();

            this.hideWaitingDialog();
            gui_log(i18n.getMessage("userLoginSuccess"));
        } catch (error) {
            this.hideWaitingDialog();
            gui_log(`${i18n.getMessage("userLoginFailed")}: ${error}`);
            console.error("Login error:", error);
        }
    }

    /**
     * Fetch user profile data
     */
    async fetchUserProfile() {
        try {
            if (await this._loginApi.checkToken()) {
                const profile = await this._userApi.profile();
                if (profile) {
                    this._profile = profile;
                }
            }
        } catch (error) {
            console.warn("Failed to fetch user profile:", error);
            // Continue with login even if profile fetch fails
        }
    }

    /**
     * Sign out the user
     */
    async signOut() {
        try {
            await this._loginApi.signOut();

            this._profile = null;
            await this.updateTabVisibility();
            this.notifyLogoutCallbacks();

            // Always switch to landing/welcome tab on logout
            $(".tab_landing a").click();

            gui_log(i18n.getMessage("userSignedOut"));
        } catch (error) {
            gui_log(`${i18n.getMessage("userSignOutFailed")}: ${error}`);
            console.error("Sign out error:", error);
        }
    }

    /**
     * Register callback for login events
     * @returns {Function} Unsubscribe function to remove the callback
     */
    onLogin(callback) {
        this._onLoginCallbacks.push(callback);
        return () => this.removeLoginCallback(callback);
    }

    /**
     * Register callback for logout events
     * @returns {Function} Unsubscribe function to remove the callback
     */
    onLogout(callback) {
        this._onLogoutCallbacks.push(callback);
        return () => this.removeLogoutCallback(callback);
    }

    /**
     * Remove a login callback
     * @param {Function} callback The callback to remove
     */
    removeLoginCallback(callback) {
        const index = this._onLoginCallbacks.indexOf(callback);
        if (index > -1) {
            this._onLoginCallbacks.splice(index, 1);
        }
    }

    /**
     * Notify login callbacks
     */
    notifyLoginCallbacks() {
        // Iterate over shallow copy to allow removals during notification
        const callbacks = this._onLoginCallbacks.slice();
        callbacks.forEach((callback) => {
            try {
                callback();
            } catch (error) {
                console.error("Error in login callback:", error);
            }
        });
    }

    /**
     * Remove a logout callback
     * @param {Function} callback The callback to remove
     */
    removeLogoutCallback(callback) {
        const index = this._onLogoutCallbacks.indexOf(callback);
        if (index > -1) {
            this._onLogoutCallbacks.splice(index, 1);
        }
    }

    /**
     * Notify logout callbacks
     */
    notifyLogoutCallbacks() {
        // Iterate over shallow copy to allow removals during notification
        const callbacks = this._onLogoutCallbacks.slice();
        callbacks.forEach((callback) => {
            try {
                callback();
            } catch (error) {
                console.error("Error in logout callback:", error);
            }
        });
    }

    /**
     * Get user API instance
     */
    getUserApi() {
        return this._userApi;
    }

    /**
     * Check if user is logged in
     */
    async isUserLoggedIn() {
        return await this._loginApi.isSignedIn();
    }

    /**
     * Get current user email
     */
    getUserEmail() {
        return this._profile?.email;
    }

    /**
     * Get current user profile
     */
    getUserProfile() {
        return this._profile;
    }
}

// Create singleton instance
const loginManager = new LoginManager();

export default loginManager;
