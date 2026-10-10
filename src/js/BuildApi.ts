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

import { gui_log } from "./gui_log";
import { i18n } from "./localization";
import { get as getStorage, set as setStorage } from "./SessionStorage";
import LoginApi from "./LoginApi";
import { useAppInfoStore } from "../stores/appInfo";
import type { BuildOptionsResponse, TargetDetail } from "../components/tabs/firmware-flasher/flasherState";
import type { FirmwareRelease, TargetDescriptor } from "../composables/useBoardSelection";
import type { BuildResponse, BuildStatusResponse, CloudBuildRequest } from "../composables/useCloudBuild";

/** One commit of a release branch, as `/api/releases/<release>/commits` lists it. */
export interface ReleaseCommit {
    sha: string;
    message: string;
}

/** A requested build, as `/api/builds/<key>/json` returns it. */
export interface BuildRequestDetail {
    request?: {
        options?: string[];
    };
}

/**
 * Client for build.betaflight.com. The JSON readers return the parsed body as the type the
 * endpoint is documented to send; nothing is validated, so callers that need to trust a field
 * still check it. A failed request is logged and returns `null`.
 */
export default class BuildApi {
    private readonly _url = "https://build.betaflight.com";
    private readonly _cacheExpirationPeriod = 3600 * 1000;
    private readonly _loginApi: LoginApi | null;

    constructor(loginApi: LoginApi | null = new LoginApi()) {
        this._loginApi = loginApi;
    }

    isSuccessCode(code: number): boolean {
        return code === 200 || code === 201 || code === 202;
    }

    async _authHeaders(): Promise<Record<string, string>> {
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
            console.log(`Unable to obtain access token for Build API. ${_error}`);
        }

        return {};
    }

    async fetchBytes(url: string): Promise<Uint8Array | null> {
        const authHeaders = await this._authHeaders();
        const response = await fetch(url, {
            method: "GET",
            headers: {
                "X-CFG-VER": useAppInfoStore().version,
                ...authHeaders,
            },
        });

        if (this.isSuccessCode(response.status)) {
            return new Uint8Array(await response.arrayBuffer());
        }

        gui_log(i18n.getMessage("buildServerFailure", [url, `HTTP ${response.status}`]));
        return null;
    }

    async fetchText(url: string): Promise<string | null> {
        const authHeaders = await this._authHeaders();
        const response = await fetch(url, {
            method: "GET",
            headers: {
                "X-CFG-VER": useAppInfoStore().version,
                ...authHeaders,
            },
        });

        if (this.isSuccessCode(response.status)) {
            return await response.text();
        }

        gui_log(i18n.getMessage("buildServerFailure", [url, `HTTP ${response.status}`]));
        return null;
    }

    async fetchJson<T>(url: string): Promise<T | null> {
        const authHeaders = await this._authHeaders();
        const response = await fetch(url, {
            method: "GET",
            headers: {
                "X-CFG-VER": useAppInfoStore().version,
                ...authHeaders,
            },
        });

        if (this.isSuccessCode(response.status)) {
            return (await response.json()) as T;
        }

        gui_log(i18n.getMessage("buildServerFailure", [url, `HTTP ${response.status}`]));
        return null;
    }

    async fetchCachedJson<T>(url: string): Promise<T | null> {
        const dataTag = `${url}_Data`;
        const cacheLastUpdateTag = `${url}_LastUpdate`;

        const storageResult = getStorage([cacheLastUpdateTag, dataTag]);
        const dataTimestamp = Date.now();
        const cachedData = storageResult[dataTag] as T | undefined;
        const cachedLastUpdate = storageResult[cacheLastUpdateTag] as number | undefined;

        if (cachedData && cachedLastUpdate && dataTimestamp - cachedLastUpdate < this._cacheExpirationPeriod) {
            gui_log(i18n.getMessage("buildServerUsingCached", [url]));
            return cachedData;
        }

        const authHeaders = await this._authHeaders();
        const response = await fetch(url, {
            method: "GET",
            headers: {
                "X-CFG-VER": useAppInfoStore().version,
                ...authHeaders,
            },
        });

        if (response.status === 500) {
            throw new Error(await response.text());
        }

        if (response.status === 404) {
            return null;
        }

        const result = (await response.json()) as T;

        setStorage({ [dataTag]: result, [cacheLastUpdateTag]: Date.now() });
        return result;
    }

    async loadTargets(): Promise<TargetDescriptor[] | null> {
        const url = `${this._url}/api/targets`;
        return await this.fetchCachedJson<TargetDescriptor[]>(url);
    }

    async loadTargetReleases(target: string): Promise<{ releases: FirmwareRelease[] } | null> {
        const url = `${this._url}/api/targets/${target}`;
        return await this.fetchCachedJson<{ releases: FirmwareRelease[] }>(url);
    }

    async loadTarget(target: string, release: string): Promise<TargetDetail | null> {
        const url = `${this._url}/api/builds/${release}/${target}`;
        return await this.fetchCachedJson<TargetDetail>(url);
    }

    async loadTargetFirmware(path: string): Promise<Uint8Array | null> {
        const url = `${this._url}${path}`;
        return await this.fetchBytes(url);
    }

    async getSupportCommands(): Promise<string[] | null> {
        const url = `${this._url}/api/support/commands`;
        return await this.fetchJson<string[]>(url);
    }

    async submitSupportData(data: string): Promise<string | null> {
        const url = `${this._url}/api/support`;

        const authHeaders = await this._authHeaders();
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "text/plain",
                "X-CFG-VER": useAppInfoStore().version,
                ...authHeaders,
            },
            body: data,
        });

        if (response.status === 200) {
            return await response.text();
        }

        gui_log(i18n.getMessage("buildServerFailure", [url, `HTTP ${response.status}`]));
        return null;
    }

    async requestBuild(request: CloudBuildRequest): Promise<BuildResponse | null> {
        const url = `${this._url}/api/builds`;

        const authHeaders = await this._authHeaders();
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-CFG-VER": useAppInfoStore().version,
                ...authHeaders,
            },
            body: JSON.stringify(request),
        });

        if (this.isSuccessCode(response.status)) {
            return (await response.json()) as BuildResponse;
        }

        gui_log(i18n.getMessage("buildServerFailure", [url, `HTTP ${response.status}`]));
        return null;
    }

    async requestBuildStatus(key: string): Promise<BuildStatusResponse | null> {
        const url = `${this._url}/api/builds/${key}/status`;
        return await this.fetchJson<BuildStatusResponse>(url);
    }

    async requestBuildOptions(key: string): Promise<BuildRequestDetail | null> {
        const url = `${this._url}/api/builds/${key}/json`;
        return await this.fetchJson<BuildRequestDetail>(url);
    }

    async loadOptions(release: string): Promise<BuildOptionsResponse | null> {
        const url = `${this._url}/api/options/${release}`;
        return await this.fetchJson<BuildOptionsResponse>(url);
    }

    async loadOptionsByBuildKey(release: string, key: string): Promise<BuildOptionsResponse | null> {
        const url = `${this._url}/api/options/${release}/${key}`;
        return await this.fetchJson<BuildOptionsResponse>(url);
    }

    async loadCommits(release: string): Promise<ReleaseCommit[] | null> {
        const url = `${this._url}/api/releases/${release}/commits`;
        return await this.fetchJson<ReleaseCommit[]>(url);
    }

    async loadConfiguratorRelease(type: string): Promise<unknown> {
        const url = `${this._url}/api/app/releases/${type}`;
        return await this.fetchJson<unknown>(url);
    }

    async loadDeviceFilters(): Promise<unknown> {
        try {
            return await this.fetchJson<unknown>(`${this._url}/api/app/devices`);
        } catch {
            // offline or network error — caller falls back to cache
            return null;
        }
    }

    async loadSponsorTile(mode: string, page: string): Promise<string | null> {
        const url = `${this._url}/api/app/sponsors/${mode}/${page}`;
        return await this.fetchText(url);
    }
}
