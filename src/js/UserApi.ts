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

import LoginApi from "./LoginApi";

const DELETE_ACCOUNT_TIMEOUT_MS = 30000;

/*
 * Response bodies of the user API, as far as the app reads them. They are parsed JSON, so these
 * are the contract, not a runtime guarantee.
 */

/** `/api/user`. */
export interface UserProfile {
    name?: string;
    email?: string;
    address?: string;
    country?: string;
    avatar?: string;
}

/** The client a token or passkey was issued to. */
export interface UserClient {
    address?: string;
}

/** One entry of `/api/user/tokens`. */
export interface UserToken {
    id: string | number;
    created?: string;
    expiry?: string;
    details?: string;
    client?: UserClient;
}

/** One entry of `/api/user/passkeys`. */
export interface UserPasskey {
    id: string | number;
    createdAtUtc?: string;
    updatedAtUtc?: string;
    client?: UserClient;
}

/** A cloud backup as `/api/backups` lists it. */
export interface Backup {
    id: number | string;
    name?: string;
    description?: string;
    created?: string;
    key?: string;
}

/** `/api/backups`. */
export interface BackupList {
    backups?: Backup[];
    message?: string;
}

/**
 * The body of `PUT /api/backups/{Id}`. `Id` is capitalised because the server reads it that way.
 * It admits `null` because BackupsTab's edit form starts out with no backup selected.
 */
export interface BackupUpdate {
    Id: Backup["id"] | null;
    name?: string;
    description?: string;
}

/** A downloaded backup file: the name from Content-Disposition, and its text. */
export interface BackupFile {
    name: string;
    file: string;
}

/** What UserApi needs from LoginApi. */
export type AccessTokenSource = Pick<LoginApi, "getAccessToken" | "signOut">;

export default class UserApi {
    readonly _url = "https://user.betaflight.com";
    _loginApi: AccessTokenSource;

    constructor(loginApi: AccessTokenSource = new LoginApi()) {
        this._loginApi = loginApi;
    }

    async _authHeaders(): Promise<{ Authorization: string }> {
        // Still checked: a JavaScript caller can pass null, which the default does not replace.
        if (!this._loginApi) {
            throw new Error("Login API is not initialized.");
        }

        try {
            const token = await this._loginApi.getAccessToken();
            if (token) {
                return { Authorization: `Bearer ${token}` };
            }
        } catch (error) {
            console.warn(`Unable to obtain access token for User API. ${error}`);
        }
        throw new Error("Unable to obtain access token for User API.");
    }

    /* Profile Functionality */
    async profile(): Promise<UserProfile> {
        const authHeaders = await this._authHeaders();
        const response = await fetch(`${this._url}/api/user`, {
            method: "GET",
            headers: {
                ...authHeaders,
            },
        });

        if (response.status === 401) {
            // token is bad - logout
            void this._loginApi.signOut();
            throw new Error("Unauthorized access to User API.");
        }

        if (!response.ok) {
            throw new Error(await response.text());
        }
        return await response.json();
    }

    /** Resolves to the server's parsed reply, which no caller reads. */
    async updateProfile(profile: UserProfile): Promise<unknown> {
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

    async deleteAccount(): Promise<void> {
        const authHeaders = await this._authHeaders();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), DELETE_ACCOUNT_TIMEOUT_MS);
        try {
            const response = await fetch(`${this._url}/api/user`, {
                method: "DELETE",
                headers: {
                    ...authHeaders,
                },
                signal: controller.signal,
            });

            if (!response.ok) {
                throw new Error(await response.text());
            }
        } finally {
            clearTimeout(timer);
        }
    }

    /* User Token Management Functionality */
    async getTokens(): Promise<UserToken[]> {
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

    async deleteToken(tokenId: UserToken["id"]): Promise<void> {
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
    async getPasskeys(): Promise<UserPasskey[]> {
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

    async deletePasskey(passkeyId: UserPasskey["id"]): Promise<void> {
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
    async getBackups(): Promise<BackupList> {
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

    async deleteBackup(backupId: Backup["id"]): Promise<void> {
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

    /**
     * @param data the CLI dump, as plain text
     * @returns the server's parsed reply, which no caller reads
     */
    async uploadBackup(data: string): Promise<unknown> {
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

    async downloadBackupFile(backupId: Backup["id"]): Promise<BackupFile> {
        const authHeaders = await this._authHeaders();
        const response = await fetch(`${this._url}/api/backups/${backupId}/file`, {
            method: "GET",
            headers: {
                Accept: "text/plain",
                ...authHeaders,
            },
        });

        if (!response.ok) {
            throw new Error(await response.text());
        }

        // Parse filename from Content-Disposition header safely
        const contentDisposition = response.headers.get("Content-Disposition");
        let filename = "backup.txt";

        if (contentDisposition?.includes("filename=")) {
            const parts = contentDisposition.split("filename=");
            if (parts.length > 1) {
                // Remove surrounding quotes and whitespace
                filename = parts[1].trim().replaceAll(/^["']|["']$/g, "");
            }
        }

        // Return raw text content
        const text = await response.text();

        return {
            name: filename,
            file: text,
        };
    }

    async updateBackup(backup: BackupUpdate): Promise<void> {
        const authHeaders = await this._authHeaders();
        const response = await fetch(`${this._url}/api/backups/${backup.Id}`, {
            method: "PUT",
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
