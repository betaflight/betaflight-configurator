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
    _accessExpiry = null;
    _userToken = null;

    userToken() {
        const storedToken = getConfig("userToken");
        if (!storedToken || typeof storedToken !== "object") {
            return false;
        }
        if (storedToken.userToken) {
            this._userToken = storedToken.userToken;
            return true;
        }
        return false;
    }

    async accessToken() {
        const response = await fetch(`${this._url}/api/token`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this._userToken}`,
            },
        });

        if (response.status === 401) {
            console.warn("User login token invalid. Login required.");
            this.signOut();
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
        if (isNaN(expiryDate.getTime())) {
            throw new Error(`Invalid expiry date format: ${result.expiry}`);
        }

        this._accessToken = result.token;
        this._accessExpiry = expiryDate;

        if (this._accessExpiry.getTime() < Date.now()) {
            throw new Error("Received access token is already expired", this._accessExpiry.toISOString());
        }
        console.info("New access token issued, expiry:", this._accessExpiry.toISOString(), new Date().toISOString());
    }

    isAccessTokenValid() {
        if (!this._accessToken || !this._accessExpiry) {
            return false;
        }

        /* Consider token valid if it expires in more than 3 minutes */
        if (this._accessExpiry.getTime() > Date.now() + 3 * 60 * 1000) {
            return true;
        }

        console.info("Access token expired.");
        return false;
    }

    async checkToken() {
        if (this.isAccessTokenValid()) {
            return true;
        }

        if (this.userToken()) {
            console.info("User token loaded, attempting to obtain new access token.");
            try {
                await this.accessToken();
            } catch (err) {
                console.error("Failed to obtain access token:", err);
            }

            if (this.isAccessTokenValid()) {
                return true;
            }

            console.info("Unable to obtain valid access token, signing out user.");
            this.signOut();
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

        const credentialOptionsResponse = await response.json();

        return {
            options: credentialOptionsResponse.attestationOptions,
            userId: credentialOptionsResponse.userId,
        };
    }

    async createCredential(userId, options) {
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
                    attestationResponse: attestationResponse,
                    userId: userId,
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

        const assertionOptionsResponse = await response.json();

        return {
            options: assertionOptionsResponse.assertionOptions,
            userId: assertionOptionsResponse.userId,
        };
    }

    async verifyAssertion(userId, options) {
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
                    assertionResponse: assertionResponse,
                    userId: userId,
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

    signOut() {
        this._accessToken = null;
        this._accessExpiry = null;
        this._userToken = null;
        this._signedIn = false;
        removeConfig("userToken");
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
        }

        return null;
    }
}
