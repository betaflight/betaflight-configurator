import { gui_log } from "./gui_log";
import { i18n } from "./localization";
import { get as getStorage, set as setStorage } from "./SessionStorage";
import CONFIGURATOR from "./data_storage.js";

export default class BuildApi {
    constructor() {
        this._url = "https://build.betaflight.com";
        this._cacheExpirationPeriod = 3600 * 1000;
    }

    async fetchJson(url) {
        const response = await fetch(url, {
            method: "GET",
            headers: {
                "User-Agent": navigator.userAgent,
                "X-CFG-VER": `${CONFIGURATOR.version}`,
            },
        });

        if (response.status === 200 || response.status === 201 || response.status === 202) {
            return await response.json();
        }

        gui_log(i18n.getMessage("buildServerFailure", [url, `HTTP ${response.status}`]));
        return null;
    }

    async fetchCachedJson(url) {
        const self = this;
        const dataTag = `${url}_Data`;
        const cacheLastUpdateTag = `${url}_LastUpdate`;

        const storageResult = getStorage([cacheLastUpdateTag, dataTag]);
        const dataTimestamp = Date.now();
        const cachedData = storageResult[dataTag];
        const cachedLastUpdate = storageResult[cacheLastUpdateTag];

        if (cachedData && cachedLastUpdate && dataTimestamp - cachedLastUpdate < self._cacheExpirationPeriod) {
            if (cachedData) {
                gui_log(i18n.getMessage("buildServerUsingCached", [url]));
            }

            return cachedData;
        }

        const response = await fetch(url, {
            method: "GET",
            headers: {
                "User-Agent": navigator.userAgent,
                "X-CFG-VER": `${CONFIGURATOR.version}`,
            },
        });

        if (response.status == 500) {
            throw new Error(await response.text());
        }

        if (response.status == 404) {
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

    async loadTargetHex(path) {
        const url = `${this._url}${path}`;

        const response = await fetch(url, {
            method: "GET",
            headers: {
                "User-Agent": navigator.userAgent,
                "X-CFG-VER": `${CONFIGURATOR.version}`,
            },
        });

        if (response.status === 200) {
            return await response.text();
        }

        gui_log(i18n.getMessage("buildServerFailure", [path, `HTTP ${xhr.status}`]));
        return null;
    }

    async getSupportCommands() {
        const url = `${this._url}/api/support/commands`;

        const response = await fetch(url, {
            method: "GET",
            headers: {
                "User-Agent": navigator.userAgent,
                "X-CFG-VER": `${CONFIGURATOR.version}`,
            },
        });

        if (response.status === 200) {
            return await response.json();
        }

        gui_log(i18n.getMessage("buildServerFailure", [url, `HTTP ${response.status}`]));
        return null;
    }

    async submitSupportData(data) {
        const url = `${this._url}/api/support`;

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "text/plain",
                "User-Agent": navigator.userAgent,
                "X-CFG-VER": `${CONFIGURATOR.version}`,
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

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "User-Agent": navigator.userAgent,
                "X-CFG-VER": `${CONFIGURATOR.version}`,
            },
            body: JSON.stringify(request),
        });

        if (response.status === 200 || response.status === 201 || response.status === 202) {
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
        const response = await fetch(url, {
            method: "GET",
            headers: {
                "User-Agent": navigator.userAgent,
                "X-CFG-VER": `${CONFIGURATOR.version}`,
            },
        });

        if (response.status === 200 || response.status === 201 || response.status === 202) {
            return await response.text();
        }

        gui_log(i18n.getMessage("buildServerFailure", [url, `HTTP ${response.status}`]));
        return null;
    }
}
