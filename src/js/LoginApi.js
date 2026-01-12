import { get as getConfig, set as setConfig, remove as removeConfig } from "./ConfigStorage";
import { startRegistration, startAuthentication, browserSupportsWebAuthn } from "@simplewebauthn/browser";

export class TokenFailure extends Error {
    constructor(message = "", ...args) {
        super(message, ...args);
        this.name = "TokenFailure";
    }
}

export default class LoginApi {
    _url = "https://login.betaflight.com";
    _accessToken = null;
    _accessExpiryMs = null;
    _userToken = null;

    userToken() {
        if (!this._userToken) {
            const storedToken = getConfig("userToken");
            if (!storedToken) {
                return false;
            }

            // Handle both string format and object format
            if (typeof storedToken === "string") {
                this._userToken = storedToken;
                console.info(`Loaded user token from storage (string format).`);
                return true;
            } else if (typeof storedToken === "object" && storedToken.userToken) {
                this._userToken = storedToken.userToken;
                console.info(`Loaded user token from storage (object format).`);
                return true;
            }

            return false;
        }
        return true;
    }

    async accessToken() {
        if (!this._accessToken || !this._accessExpiryMs) {
            const storedToken = getConfig("accessToken");
            if (storedToken && typeof storedToken === "object") {
                if (storedToken.accessToken?.token && storedToken.accessToken?.expiry) {
                    this._accessToken = storedToken.accessToken.token;
                    this._accessExpiryMs = storedToken.accessToken.expiry;
                    console.info(
                        `Loaded access token from storage, expiry: ${new Date(this._accessExpiryMs).toISOString()}`,
                    );
                }
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

        const result = await response.json();
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

    async checkToken() {
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
    async createCredentialOptions(email, key) {
        this.checkMediationSupport();

        const response = await fetch(`${this._url}/api/credentials/options`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ email: email, key: key }),
        });

        if (!response.ok) {
            throw new Error(await response.text());
        }

        const credentialOptions = await response.json();

        return {
            options: credentialOptions.options,
            key: credentialOptions.key,
        };
    }

    async createCredential(key, options) {
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
                    key: key,
                }),
            });

            if (!credentialResponse.ok) {
                throw new Error(await credentialResponse.text());
            }

            const result = await credentialResponse.json();
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

    async createAssertionOptions(email) {
        this.checkMediationSupport();

        const response = await fetch(`${this._url}/api/assertion/options`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ email: email }),
        });

        if (!response.ok) {
            throw new Error(await response.text());
        }

        const assertionOptions = await response.json();

        return {
            options: assertionOptions.options,
            key: assertionOptions.key,
        };
    }

    async verifyAssertion(key, options) {
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
                    key: key,
                }),
            });

            if (!verificationResponse.ok) {
                throw new Error(await verificationResponse.text());
            }

            const result = await verificationResponse.json();
            if (!result.token) {
                throw new Error("Server did not return a valid token");
            }

            setConfig({ userToken: result.token });
            console.info("Usertoken received and stored");
            await this.checkToken();
        } catch (err) {
            if (err.name === "AbortError") {
                console.info("Authentication was aborted");
                return;
            }
            throw err;
        }
    }

    async signOut() {
        await this.removeCurrentToken();
        removeConfig("userToken");
        removeConfig("accessToken");
        this._accessToken = null;
        this._accessExpiryMs = null;
        this._userToken = null;
    }

    async removeCurrentToken() {
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

    async requestTemporaryPassword(email) {
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

    async isSignedIn() {
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

    checkMediationSupport() {
        if (!browserSupportsWebAuthn()) {
            throw new Error("WebAuthn/Passkeys are not supported by your browser");
        }
    }

    async getAccessToken() {
        try {
            if (!(await this.isSignedIn())) {
                return null;
            }

            if (this._accessToken) {
                return this._accessToken;
            }
        } catch (_error) {
            // Silently continue without auth headers
            console.log(`Unable to obtain access token for Login API. ${_error}`);
        }

        return null;
    }
}
