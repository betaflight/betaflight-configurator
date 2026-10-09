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

import { get as getConfig, set as setConfig, remove as removeConfig } from "./ConfigStorage";
import { startRegistration, startAuthentication, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import type {
    PublicKeyCredentialCreationOptionsJSON,
    PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";

/** The access token as it is persisted under the `accessToken` config key. */
interface StoredAccessToken {
    token?: string;
    expiry?: number;
}

/*
 * Response bodies of the login server. They are parsed JSON, so these are the contract, not a
 * runtime guarantee; fields the code checks before use are optional.
 */

/** `/api/credentials`, `/api/assertion` and `/api/user/verify/{email}/login`. */
interface UserTokenResponse {
    token?: string;
}

/** `/api/token`. `expiry` is anything `new Date()` parses; it is validated before use. */
interface AccessTokenResponse {
    token?: string;
    expiry?: string | number;
}

/** `/api/credentials/options`: passkey registration options plus the server's session key. */
export interface CredentialOptions {
    options: PublicKeyCredentialCreationOptionsJSON;
    key: string;
}

/** `/api/assertion/options`: passkey authentication options plus the server's session key. */
export interface AssertionOptions {
    options: PublicKeyCredentialRequestOptionsJSON;
    key: string;
}

export class TokenFailure extends Error {
    constructor(message = "", options?: ErrorOptions) {
        super(message, options);
        this.name = "TokenFailure";
    }
}

export default class LoginApi {
    readonly _url = "https://login.betaflight.com";
    _accessToken: string | null = null;
    _accessExpiryMs: number | null = null;
    _userToken: string | null = null;

    userToken(): boolean {
        if (!this._userToken) {
            // ConfigStorage.get() returns a `{ userToken: value }` record, never the bare value.
            const storedToken = getConfig<string | undefined>("userToken").userToken;
            if (!storedToken) {
                return false;
            }

            this._userToken = storedToken;
            console.info("Loaded user token from storage.");
            return true;
        }
        return true;
    }

    async accessToken(): Promise<boolean> {
        if (!this._accessToken || !this._accessExpiryMs) {
            const storedToken = getConfig<StoredAccessToken | undefined>("accessToken").accessToken;
            if (storedToken?.token && storedToken.expiry) {
                this._accessToken = storedToken.token;
                this._accessExpiryMs = storedToken.expiry;
                console.info(
                    `Loaded access token from storage, expiry: ${new Date(this._accessExpiryMs).toISOString()}`,
                );
            }
        }

        /* Consider token valid if it expires in more than 3 minutes */
        if (this._accessToken && (this._accessExpiryMs ?? 0) > Date.now() + 3 * 60 * 1000) {
            return true;
        }

        const response = await fetch(`${this._url}/api/token`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this._userToken}`,
            },
        });

        if (response.status === 401) {
            console.warn("User login token invalid. Login required.");
            await this.signOut();
            throw new TokenFailure("Unable to obtain access token. Login required.");
        }

        if (!response.ok) {
            throw new Error(await response.text());
        }

        const result: AccessTokenResponse = await response.json();
        if (!result.token || !result.expiry) {
            throw new Error(`Invalid response: ${JSON.stringify(result)}`);
        }

        // Validate expiry date
        const expiryDate = new Date(result.expiry);
        if (Number.isNaN(expiryDate.getTime())) {
            throw new TypeError(`Invalid expiry date format: ${result.expiry}`);
        }

        if (expiryDate.getTime() < Date.now()) {
            throw new Error(`Received access token is already expired: ${expiryDate.toISOString()}`);
        }

        this._accessToken = result.token;
        this._accessExpiryMs = expiryDate.getTime();
        setConfig({ accessToken: { token: this._accessToken, expiry: this._accessExpiryMs } });

        console.info(`New access token issued, expiry: ${expiryDate.toISOString()}, now: ${new Date().toISOString()}`);
        return true;
    }

    async checkToken(): Promise<boolean> {
        if (this.userToken()) {
            try {
                if (await this.accessToken()) {
                    return true;
                }
            } catch (err) {
                console.error("Failed to obtain access token:", err);
            }

            console.info("Unable to obtain valid access token, signing out user.");
            await this.signOut();
            return false;
        }
        return false;
    }

    /* PASSKEY Functionality */
    /** @param key the emailed verification code */
    async createCredentialOptions(email: string, key: string): Promise<CredentialOptions> {
        this.checkMediationSupport();

        const response = await fetch(`${this._url}/api/credentials/options`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ email, key }),
        });

        if (!response.ok) {
            throw new Error(await response.text());
        }

        const credentialOptions: CredentialOptions = await response.json();

        return {
            options: credentialOptions.options,
            key: credentialOptions.key,
        };
    }

    async createCredential(key: string, options: PublicKeyCredentialCreationOptionsJSON): Promise<void> {
        try {
            // SimpleWebAuthn handles the parsing and the navigator.credentials.create call
            // It returns a JSON-compatible object automatically.
            const attestationResponse = await startRegistration({ optionsJSON: options });

            const credentialResponse = await fetch(`${this._url}/api/credentials`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    response: attestationResponse,
                    key,
                }),
            });

            if (!credentialResponse.ok) {
                throw new Error(await credentialResponse.text());
            }

            const result: UserTokenResponse = await credentialResponse.json();
            if (!result.token) {
                throw new Error("Server did not return a valid token");
            }

            setConfig({ userToken: result.token });
            await this.checkToken();
        } catch (err) {
            console.error("Registration failed:", err);
            throw err;
        }
    }

    async createAssertionOptions(email: string): Promise<AssertionOptions> {
        this.checkMediationSupport();

        const response = await fetch(`${this._url}/api/assertion/options`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ email }),
        });

        if (!response.ok) {
            throw new Error(await response.text());
        }

        const assertionOptions: AssertionOptions = await response.json();

        return {
            options: assertionOptions.options,
            key: assertionOptions.key,
        };
    }

    async verifyAssertion(key: string, options: PublicKeyCredentialRequestOptionsJSON): Promise<void> {
        this.checkMediationSupport();

        try {
            const assertionResponse = await startAuthentication({
                optionsJSON: options,
                useBrowserAutofill: false,
            });

            const verificationResponse = await fetch(`${this._url}/api/assertion`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    response: assertionResponse,
                    key,
                }),
            });

            if (!verificationResponse.ok) {
                throw new Error(await verificationResponse.text());
            }

            const result: UserTokenResponse = await verificationResponse.json();
            if (!result.token) {
                throw new Error("Server did not return a valid token");
            }

            setConfig({ userToken: result.token });
            console.info("Usertoken received and stored");
            await this.checkToken();
        } catch (err) {
            // Not `instanceof Error`: an abort arrives as a DOMException, and not every
            // environment makes that an Error subclass (jsdom does not).
            if (typeof err === "object" && err !== null && "name" in err && err.name === "AbortError") {
                console.info("Authentication was aborted");
                return;
            }
            throw err;
        }
    }

    async signOut(): Promise<void> {
        // removeCurrentToken() builds its request from the current token before its first await,
        // so the local session can be cleared straight away. Clearing it only after the
        // revocation round-trip let a login made meanwhile have its new token wiped.
        const revocation = this.removeCurrentToken();
        this.clearSession();
        await revocation;
    }

    clearSession(): void {
        removeConfig("userToken");
        removeConfig("accessToken");
        this._accessToken = null;
        this._accessExpiryMs = null;
        this._userToken = null;
    }

    async removeCurrentToken(): Promise<void> {
        if (!this.userToken()) {
            return;
        }
        try {
            await fetch(`${this._url}/api/user/tokens/current`, {
                method: "DELETE",
                headers: {
                    Authorization: `Bearer ${this._userToken}`,
                },
            });
        } catch (err) {
            console.error("Failed to remove current token:", err);
        }
    }

    async requestTemporaryPassword(email: string): Promise<void> {
        const response = await fetch(`${this._url}/api/user/verify/${encodeURIComponent(email)}/request`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
        });

        if (!response.ok) {
            throw new Error(await response.text());
        }
    }

    /**
     * Verify an emailed code and obtain a refresh token without using a passkey.
     * Intended for browsers where passkey authentication is unreliable.
     */
    async verifyLogin(email: string, code: string): Promise<void> {
        const response = await fetch(`${this._url}/api/user/verify/${encodeURIComponent(email)}/login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ email, key: code }),
        });

        if (!response.ok) {
            const text = await response.text();
            let errorMsg = text || response.statusText;
            try {
                const body: { error?: string } | null = JSON.parse(text);
                if (body?.error) {
                    errorMsg = body.error;
                }
            } catch {
                // not JSON — use text as-is
            }
            throw new Error(errorMsg);
        }

        const result: UserTokenResponse = await response.json();
        if (!result.token) {
            throw new Error("Server did not return a valid token");
        }

        setConfig({ userToken: result.token });
        await this.checkToken();
    }

    async isSignedIn(): Promise<boolean> {
        try {
            return await this.checkToken();
        } catch (err) {
            if (err instanceof TokenFailure) {
                console.warn("User is not signed in:", err.message);
                return false;
            }
            throw err;
        }
    }

    checkMediationSupport(): void {
        if (!browserSupportsWebAuthn()) {
            throw new Error("WebAuthn/Passkeys are not supported by your browser");
        }
    }

    async getAccessToken(): Promise<string | null> {
        try {
            if (!(await this.isSignedIn())) {
                return null;
            }

            if (this._accessToken) {
                return this._accessToken;
            }
        } catch (error) {
            // Silently continue without auth headers
            console.log(`Unable to obtain access token for Login API. ${error}`);
        }

        return null;
    }
}
