import { gui_log } from "./gui_log";
import { i18n } from "./localization";
import { get as getStorage, set as setStorage } from "./SessionStorage";
import CONFIGURATOR from "./data_storage.js";
import LoginApi from "./LoginApi";
import { GIGFLIGHT_TARGETS, findGigflightTarget } from "./GigfpvCatalog";

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
            console.log(`Unable to obtain access token for Build API. ${_error}`);
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
        // GIGFPV Station deliberately exposes only GIGFlight targets.  Do not
        // fall back to the upstream catalogue: that would make an unrelated
        // firmware target appear flashable in this product.
        return GIGFLIGHT_TARGETS.map((target) => ({ ...target }));
    }

    async loadTargetReleases(target) {
        const descriptor = findGigflightTarget(target);
        if (!descriptor) {
            return { releases: [] };
        }

        const releases = await this.fetchCachedJson(
            `https://api.github.com/repos/${descriptor.repository}/releases`,
        );

        return {
            releases: (releases || [])
                .filter((release) => !release.draft)
                .map((release) => ({
                    release: release.tag_name,
                    label: "GIGFlight",
                    type: release.prerelease ? "ReleaseCandidate" : "Stable",
                })),
        };
    }

    async loadTarget(target, release) {
        const descriptor = findGigflightTarget(target);
        if (!descriptor) {
            return null;
        }

        const releaseDetail = await this.fetchCachedJson(
            `https://api.github.com/repos/${descriptor.repository}/releases/tags/${encodeURIComponent(release)}`,
        );
        if (!releaseDetail) {
            return null;
        }

        const hexAssets = (releaseDetail.assets || []).filter((asset) => /\.hex$/i.test(asset.name));
        const firmwareAsset =
            hexAssets.find((asset) => asset.name.toUpperCase().includes(descriptor.target)) || hexAssets[0];

        if (!firmwareAsset) {
            return null;
        }

        return {
            target: descriptor.target,
            release: releaseDetail.tag_name,
            releaseUrl: releaseDetail.html_url,
            date: releaseDetail.published_at,
            manufacturer: descriptor.manufacturer,
            mcu: descriptor.mcu,
            file: firmwareAsset.browser_download_url,
            firmwareType: "HEX",
            releaseType: releaseDetail.prerelease ? "ReleaseCandidate" : "Stable",
            cloudBuild: false,
        };
    }

    async loadTargetFirmware(path) {
        const url = new URL(path, this._url).toString();
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
        const url = `${this._url}/api/app/releases/${type}`;
        return await this.fetchJson(url);
    }

    async loadDeviceFilters() {
        try {
            return await this.fetchJson(`${this._url}/api/app/devices`);
        } catch {
            // offline or network error — caller falls back to cache
            return null;
        }
    }

    async loadSponsorTile(mode, page) {
        const url = `${this._url}/api/app/sponsors/${mode}/${page}`;
        return await this.fetchText(url);
    }
}
