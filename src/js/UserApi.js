import LoginApi from "./LoginApi";

export default class UserApi {
    _url = "https://user.betaflight.com";
    _loginApi;

    constructor(loginApi = new LoginApi()) {
        this._loginApi = loginApi;
    }

    async _authHeaders() {
        if (!this._loginApi) {
            return {};
        }

        try {
            const token = await this._loginApi.getAccessToken();
            if (token) {
                return { Authorization: `Bearer ${token}` };
            }
        } catch (_error) {
            // Silently continue without auth headers
        }

        return {};
    }

    /* Profile Functionality */
    async profile() {
        const authHeaders = await this._authHeaders();
        const response = await fetch(`${this._url}/api/user`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                ...authHeaders,
            },
        });

        if (!response.ok) {
            throw new Error(await response.text());
        }
        return await response.json();
    }

    async updateProfile(profile) {
        const authHeaders = await this._authHeaders();
        const response = await fetch(`${this._url}/api/user`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                ...authHeaders,
            },
            body: JSON.stringify(profile),
        });

        if (!response.ok) {
            throw new Error(await response.text());
        }

        return await response.json();
    }

    /* User Token Management Functionality */
    async getTokens() {
        const authHeaders = await this._authHeaders();
        const response = await fetch(`${this._url}/api/user/tokens`, {
            method: "GET",
            headers: {
                ...authHeaders,
            },
        });

        if (!response.ok) {
            throw new Error(await response.text());
        }
        return await response.json();
    }

    async deleteToken(tokenId) {
        const authHeaders = await this._authHeaders();
        const response = await fetch(`${this._url}/api/user/tokens/${tokenId}`, {
            method: "DELETE",
            headers: {
                ...authHeaders,
            },
        });

        if (!response.ok) {
            throw new Error(await response.text());
        }
    }

    /* User Passkey Management Functionality */
    async getPasskeys() {
        const authHeaders = await this._authHeaders();
        const response = await fetch(`${this._url}/api/user/passkeys`, {
            method: "GET",
            headers: {
                ...authHeaders,
            },
        });

        if (!response.ok) {
            throw new Error(await response.text());
        }
        return await response.json();
    }

    async deletePasskey(passkeyId) {
        const authHeaders = await this._authHeaders();
        const response = await fetch(`${this._url}/api/user/passkeys/${passkeyId}`, {
            method: "DELETE",
            headers: {
                ...authHeaders,
            },
        });

        if (!response.ok) {
            throw new Error(await response.text());
        }
    }

    /* User Backup Functionality */
    async getBackups() {
        const authHeaders = await this._authHeaders();
        const response = await fetch(`${this._url}/api/backups`, {
            method: "GET",
            headers: {
                ...authHeaders,
            },
        });

        if (!response.ok) {
            throw new Error(await response.text());
        }
        return await response.json();
    }

    async deleteBackup(backupId) {
        const authHeaders = await this._authHeaders();
        const response = await fetch(`${this._url}/api/backups/${backupId}`, {
            method: "DELETE",
            headers: {
                ...authHeaders,
            },
        });

        if (!response.ok) {
            throw new Error(await response.text());
        }
    }

    async uploadBackup(data) {
        const authHeaders = await this._authHeaders();
        const response = await fetch(`${this._url}/api/backups/file`, {
            method: "POST",
            headers: {
                "Content-Type": "text/plain",
                ...authHeaders,
            },
            body: data,
        });

        if (!response.ok) {
            throw new Error(await response.text());
        }
        return await response.json();
    }

    async downloadBackupFile(backupId) {
        const authHeaders = await this._authHeaders();
        const response = await fetch(`${this._url}/api/backups/${backupId}/file`, {
            method: "GET",
            headers: {
                "Content-Type": "text/plain",
                ...authHeaders,
            },
        });

        if (!response.ok) {
            throw new Error(await response.text());
        }

        // Parse filename from Content-Disposition header safely
        const contentDisposition = response.headers.get("Content-Disposition");
        let filename = "download";

        if (contentDisposition?.includes("filename=")) {
            const parts = contentDisposition.split("filename=");
            if (parts.length > 1) {
                // Remove surrounding quotes and whitespace
                filename = parts[1].trim().replaceAll(/(^["'])|(["']$)/g, "");
            }
        }

        return {
            name: filename,
            file: await response.blob(),
        };
    }

    async updateBackup(backup) {
        const authHeaders = await this._authHeaders();
        const response = await fetch(`${this._url}/api/backups/${backup.Id}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...authHeaders,
            },
            body: JSON.stringify(backup),
        });

        if (!response.ok) {
            throw new Error(await response.text());
        }
    }
}
