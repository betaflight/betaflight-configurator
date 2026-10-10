/*
 * This file is part of Betaflight.
 *
 * Betaflight is free software. You can redistribute this software
 * and/or modify this software under the terms of the GNU General
 * Public License as published by the Free Software Foundation,
 * either version 3 of the License, or (at your option) any later
 * version.
 *
 * Betaflight is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this software.
 *
 * If not, see <http://www.gnu.org/licenses/>.
 */

import { i18n } from "./localization";
import { gui_log } from "./gui_log";
import LoginApi from "./LoginApi";
import UserApi, { type UserProfile } from "./UserApi";
import { switchTab } from "./tab_switch";
import { useNavigationStore } from "../stores/navigation";

type SessionCallback = () => void;

/** The waiting dialog UserSession registers; LoginManager only ever shows and hides it. */
export interface WaitingDialogController {
    show: (message: string) => void;
    hide: () => void;
}

/**
 * LoginManager - Handles user authentication using passkeys
 * This is a global login manager that works independently of any specific tab
 */
class LoginManager {
    readonly _loginApi = new LoginApi();
    readonly _userApi = new UserApi(this._loginApi);
    _profile: UserProfile | null = null;
    readonly _onLoginCallbacks: SessionCallback[] = [];
    readonly _onLogoutCallbacks: SessionCallback[] = [];
    _dialogOpener: SessionCallback | null = null;
    _loginDialogPending = false;
    _waitingDialogController: WaitingDialogController | null = null;

    /**
     * Set the dialog opener callback from Vue component
     */
    setDialogOpener(callback: SessionCallback | null): void {
        this._dialogOpener = callback;
        if (callback && this._loginDialogPending) {
            this._loginDialogPending = false;
            callback();
        }
    }

    /**
     * Set a controller from Vue to manage the waiting dialog
     */
    setWaitingDialogController(controller: WaitingDialogController | null): void {
        this._waitingDialogController = controller;
    }

    /**
     * Initialize the login manager and set up UI handlers
     */
    async initialize(): Promise<void> {
        await this.fetchUserProfile();
    }

    /**
     * Show waiting dialog
     * @param message Message to display
     */
    showWaitingDialog(message = "Processing passkey authentication..."): void {
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
    hideWaitingDialog(): void {
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
     * Show the login dialog, or as soon as the Vue component registers its opener
     */
    showLoginDialog(): void {
        if (this._dialogOpener) {
            this._dialogOpener();
        } else {
            this._loginDialogPending = true;
        }
    }

    /**
     * Create a new passkey for the user
     */
    async createPasskey(email: string): Promise<void> {
        try {
            this.showWaitingDialog(i18n.getMessage("userCreatingPasskey"));

            // Request temporary password/verification code
            await this._loginApi.requestTemporaryPassword(email);
            this.hideWaitingDialog();
        } catch (error) {
            this.hideWaitingDialog();
            gui_log(`${i18n.getMessage("userCreatePasskeyFailed")}: ${error}`);
            console.error("Create passkey error:", error);
            throw error;
        }
    }

    /**
     * Verify code and create passkey
     */
    async verifyAndCreatePasskey(email: string, code: string): Promise<void> {
        try {
            // Show non-blocking waiting dialog so OS/browser UI can surface
            this.showWaitingDialog(i18n.getMessage("userVerifyingCode"));

            const result = await this._loginApi.createCredentialOptions(email, code);
            await this._loginApi.createCredential(result.key, result.options);

            gui_log(i18n.getMessage("userCreatePasskeySuccess"));

            // Fetch user profile data
            await this.fetchUserProfile();
            this.notifyLoginCallbacks();

            this.hideWaitingDialog();
        } catch (error) {
            this.hideWaitingDialog();
            gui_log(`${i18n.getMessage("userCreatePasskeyFailed")}: ${error}`);
            console.error("Verify and create passkey error:", error);
            throw error;
        }
    }

    /**
     * Request a verification code to be emailed to the user.
     * Throws on failure so the caller can present a specific error.
     */
    async requestVerificationCode(email: string): Promise<void> {
        try {
            this.showWaitingDialog(i18n.getMessage("userSendingCode"));
            await this._loginApi.requestTemporaryPassword(email);
            this.hideWaitingDialog();
        } catch (error) {
            this.hideWaitingDialog();
            gui_log(`${i18n.getMessage("userSendCodeFailed")}: ${error}`);
            console.error("Request verification code error:", error);
            throw error;
        }
    }

    /**
     * Login with an emailed verification code (no passkey).
     * Used for browsers (e.g. Safari) where passkeys are unreliable.
     * Throws on failure so the caller can present a specific error.
     */
    async loginWithEmailCode(email: string, code: string): Promise<void> {
        try {
            this.showWaitingDialog(i18n.getMessage("userVerifyingCode"));

            await this._loginApi.verifyLogin(email, code);

            await this.fetchUserProfile();
            this.notifyLoginCallbacks();

            this.hideWaitingDialog();
            gui_log(i18n.getMessage("userLoginSuccess"));
        } catch (error) {
            this.hideWaitingDialog();
            gui_log(`${i18n.getMessage("userLoginFailed")}: ${error}`);
            console.error("Email code login error:", error);
            throw error;
        }
    }

    /**
     * Login with existing passkey
     */
    async loginWithPasskey(email: string): Promise<void> {
        try {
            // Show non-blocking waiting dialog so OS/browser UI can surface
            this.showWaitingDialog(i18n.getMessage("userLoggingIn"));

            const result = await this._loginApi.createAssertionOptions(email);
            await this._loginApi.verifyAssertion(result.key, result.options);

            // Fetch user profile data
            await this.fetchUserProfile();
            this.notifyLoginCallbacks();

            this.hideWaitingDialog();
            gui_log(i18n.getMessage("userLoginSuccess"));
        } catch (error) {
            this.hideWaitingDialog();
            gui_log(`${i18n.getMessage("userLoginFailed")}: ${error}`);
            console.error("Login error:", error);
            throw error;
        }
    }

    /**
     * Fetch user profile data
     */
    async fetchUserProfile(): Promise<void> {
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
    async signOut(): Promise<void> {
        try {
            await this._loginApi.signOut();
            this._finishSession();
            gui_log(i18n.getMessage("userSignedOut"));
        } catch (error) {
            gui_log(`${i18n.getMessage("userSignOutFailed")}: ${error}`);
            console.error("Sign out error:", error);
        }
    }

    /**
     * Permanently delete the signed-in user's account, then end the local session.
     * Throws (leaving the session intact) when the server refuses.
     */
    async deleteAccount(): Promise<void> {
        await this.getUserApi().deleteAccount();
        this._loginApi.clearSession();
        this._finishSession();
        gui_log(i18n.getMessage("userAccountDeleteSuccess"));
    }

    _finishSession(): void {
        this._profile = null;
        this.notifyLogoutCallbacks();

        // Pick a tab that is valid for the current connection state —
        // "landing" is disconnected-only, so fall back to "setup" or the
        // first allowed tab when connected.
        const { allowedTabs } = useNavigationStore();
        const fallback = ["landing", "setup", ...allowedTabs].find((tab) => allowedTabs.includes(tab));
        if (fallback) {
            switchTab(fallback, { mode: fallback === "landing" ? "disconnected" : "connected" });
        }
    }

    /**
     * Register callback for login events
     * @returns Unsubscribe function to remove the callback
     */
    onLogin(callback: SessionCallback): () => void {
        this._onLoginCallbacks.push(callback);
        return () => this.removeLoginCallback(callback);
    }

    /**
     * Register callback for logout events
     * @returns Unsubscribe function to remove the callback
     */
    onLogout(callback: SessionCallback): () => void {
        this._onLogoutCallbacks.push(callback);
        return () => this.removeLogoutCallback(callback);
    }

    /**
     * Remove a login callback
     * @param callback The callback to remove
     */
    removeLoginCallback(callback: SessionCallback): void {
        const index = this._onLoginCallbacks.indexOf(callback);
        if (index > -1) {
            this._onLoginCallbacks.splice(index, 1);
        }
    }

    /**
     * Notify login callbacks
     */
    notifyLoginCallbacks(): void {
        // Iterate over shallow copy to allow removals during notification
        const callbacks = this._onLoginCallbacks.slice();
        for (const callback of callbacks) {
            try {
                callback();
            } catch (error) {
                console.error("Error in login callback:", error);
            }
        }
    }

    /**
     * Remove a logout callback
     * @param callback The callback to remove
     */
    removeLogoutCallback(callback: SessionCallback): void {
        const index = this._onLogoutCallbacks.indexOf(callback);
        if (index > -1) {
            this._onLogoutCallbacks.splice(index, 1);
        }
    }

    /**
     * Notify logout callbacks
     */
    notifyLogoutCallbacks(): void {
        // Iterate over shallow copy to allow removals during notification
        const callbacks = this._onLogoutCallbacks.slice();
        for (const callback of callbacks) {
            try {
                callback();
            } catch (error) {
                console.error("Error in logout callback:", error);
            }
        }
    }

    /**
     * Get user API instance
     */
    getUserApi(): UserApi {
        return this._userApi;
    }

    /**
     * Check if user is logged in
     */
    async isUserLoggedIn(): Promise<boolean> {
        return await this._loginApi.isSignedIn();
    }

    /**
     * Get current user email
     */
    getUserEmail(): string | undefined {
        return this._profile?.email;
    }

    /**
     * Get current user profile
     */
    getUserProfile(): UserProfile | null {
        return this._profile;
    }
}

// Create singleton instance
const loginManager = new LoginManager();

export default loginManager;
