import { gui_log } from "./gui_log";
import { i18n } from "./localization";
import { get as getStorage, set as setStorage } from "./SessionStorage";
import CONFIGURATOR from "./data_storage.js";
import LoginApi from "./LoginApi";

export default class BuildApi {
    constructor(loginApi = new LoginApi()) {
        this._url = "https://build.betaflight.com";
        this._cacheExpirationPeriod = 3600 * 1000;
        this._loginApi = loginApi;
    }

    isSuccessCode(code) {
        return code === 200 || code === 201 || code === 202;
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

    async fetchBytes(url) {
        const authHeaders = await this._authHeaders();
        const response = await fetch(url, {
            method: "GET",
            headers: {
                "X-CFG-VER": `${CONFIGURATOR.version}`,
                ...authHeaders,
            },
        });

        if (this.isSuccessCode(response.status)) {
            return new Uint8Array(await response.arrayBuffer());
        }

        gui_log(i18n.getMessage("buildServerFailure", [url, `HTTP ${response.status}`]));
        return null;
    }

    async fetchText(url) {
        const authHeaders = await this._authHeaders();
        const response = await fetch(url, {
            method: "GET",
            headers: {
                "X-CFG-VER": `${CONFIGURATOR.version}`,
                ...authHeaders,
            },
        });

        if (this.isSuccessCode(response.status)) {
            return await response.text();
        }

        gui_log(i18n.getMessage("buildServerFailure", [url, `HTTP ${response.status}`]));
        return null;
    }

    async fetchJson(url) {
        const authHeaders = await this._authHeaders();
        const response = await fetch(url, {
            method: "GET",
            headers: {
                "X-CFG-VER": `${CONFIGURATOR.version}`,
                ...authHeaders,
            },
        });

        if (this.isSuccessCode(response.status)) {
            return await response.json();
        }

        gui_log(i18n.getMessage("buildServerFailure", [url, `HTTP ${response.status}`]));
        return null;
    }

    async fetchCachedJson(url) {
        const dataTag = `${url}_Data`;
        const cacheLastUpdateTag = `${url}_LastUpdate`;

        const storageResult = getStorage([cacheLastUpdateTag, dataTag]);
        const dataTimestamp = Date.now();
        const cachedData = storageResult[dataTag];
        const cachedLastUpdate = storageResult[cacheLastUpdateTag];

        if (cachedData && cachedLastUpdate && dataTimestamp - cachedLastUpdate < this._cacheExpirationPeriod) {
            gui_log(i18n.getMessage("buildServerUsingCached", [url]));
            return cachedData;
        }

        const authHeaders = await this._authHeaders();
        const response = await fetch(url, {
            method: "GET",
            headers: {
                "X-CFG-VER": `${CONFIGURATOR.version}`,
                ...authHeaders,
            },
        });

        if (response.status === 500) {
            throw new Error(await response.text());
        }

        if (response.status === 404) {
            return null;
        }

        const result = await response.json();

        const object = {};
        object[dataTag] = result;
        object[cacheLastUpdateTag] = Date.now();
        setStorage(object);
        return result;
    }

    async loadTargets() {
        const url = `${this._url}/api/targets`;
        return await this.fetchCachedJson(url);
    }

    async loadTargetReleases(target) {
        const url = `${this._url}/api/targets/${target}`;
        return await this.fetchCachedJson(url);
    }

    async loadTarget(target, release) {
        const url = `${this._url}/api/builds/${release}/${target}`;
        return await this.fetchCachedJson(url);
    }

    async loadTargetFirmware(path) {
        const url = `${this._url}${path}`;
        return await this.fetchBytes(url);
    }

    async getSupportCommands() {
        const url = `${this._url}/api/support/commands`;
        return await this.fetchJson(url);
    }

    async submitSupportData(data) {
        const url = `${this._url}/api/support`;

        const authHeaders = await this._authHeaders();
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "text/plain",
                "X-CFG-VER": `${CONFIGURATOR.version}`,
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

    async requestBuild(request) {
        const url = `${this._url}/api/builds`;

        const authHeaders = await this._authHeaders();
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-CFG-VER": `${CONFIGURATOR.version}`,
                ...authHeaders,
            },
            body: JSON.stringify(request),
        });

        if (this.isSuccessCode(response.status)) {
            return await response.json();
        }

        gui_log(i18n.getMessage("buildServerFailure", [url, `HTTP ${response.status}`]));
        return null;
    }

    async requestBuildStatus(key) {
        const url = `${this._url}/api/builds/${key}/status`;
        return await this.fetchJson(url);
    }

    async requestBuildOptions(key) {
        const url = `${this._url}/api/builds/${key}/json`;
        return await this.fetchJson(url);
    }

    async loadOptions(release) {
        const url = `${this._url}/api/options/${release}`;
        return await this.fetchJson(url);
    }

    async loadOptionsByBuildKey(release, key) {
        const url = `${this._url}/api/options/${release}/${key}`;
        return await this.fetchJson(url);
    }

    async loadCommits(release) {
        const url = `${this._url}/api/releases/${release}/commits`;
        return await this.fetchJson(url);
    }

    async loadConfiguratorRelease(type) {
        const url = `${this._url}/api/configurator/releases/${type}`;
        return await this.fetchJson(url);
    }

    async loadSponsorTile(mode, page) {
        const url = `${this._url}/api/configurator/sponsors/${mode}/${page}`;
        return await this.fetchText(url);
    }
}
