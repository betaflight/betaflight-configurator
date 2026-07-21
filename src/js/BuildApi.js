import { gui_log } from "./gui_log";
import { i18n } from "./localization";
import { get as getStorage, set as setStorage } from "./SessionStorage";
import CONFIGURATOR from "./data_storage.js";
import LoginApi from "./LoginApi";
import { GIGFLIGHT_CONFIG_REPOSITORY, GIGFLIGHT_REPOSITORY } from "./GigfpvCatalog";

export default class BuildApi {
    constructor(loginApi = new LoginApi()) {
        this._url = "https://build.betaflight.com";
        this._cacheExpirationPeriod = 3600 * 1000;
        this._loginApi = loginApi;
        this._gigflightTargetsPromise = null;
    }

    isSuccessCode(code) {
        return code === 200 || code === 201 || code === 202;
    }

    isGithubUrl(url) {
        const hostname = new URL(url).hostname;
        return (
            hostname === "github.com" ||
            hostname === "api.github.com" ||
            hostname.endsWith(".githubusercontent.com")
        );
    }

    isGithubReleaseAssetApiUrl(url) {
        const parsedUrl = new URL(url);
        return parsedUrl.hostname === "api.github.com" && /\/releases\/assets\/\d+$/.test(parsedUrl.pathname);
    }

    isLocalViteDevServer() {
        if (typeof globalThis.location === "undefined") {
            return false;
        }

        const { hostname, port, protocol } = globalThis.location;
        const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
        const isViteDevServer = protocol === "http:" && (port === "8080" || port === "8443");

        return isLocalHost && isViteDevServer;
    }

    shouldProxyGithubApi(url) {
        const parsedUrl = new URL(url);
        return parsedUrl.hostname === "api.github.com" && this.isLocalViteDevServer();
    }

    proxyGithubApiUrl(url, accept = "application/vnd.github+json") {
        if (!this.shouldProxyGithubApi(url)) {
            return url;
        }

        const params = new URLSearchParams({
            url,
            accept,
        });

        return `${globalThis.location.origin}/api/gigfpv/github?${params.toString()}`;
    }

    shouldProxyGithubReleaseAsset(url) {
        return this.isGithubReleaseAssetApiUrl(url) && this.isLocalViteDevServer();
    }

    proxyGithubReleaseAssetUrl(url) {
        if (!this.shouldProxyGithubReleaseAsset(url)) {
            return url;
        }

        return `${globalThis.location.origin}/api/gigfpv/github-release-asset?url=${encodeURIComponent(url)}`;
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
        const headers = {};

        if (!this.isGithubUrl(url)) {
            const authHeaders = await this._authHeaders();
            Object.assign(headers, {
                "X-CFG-VER": `${CONFIGURATOR.version}`,
                ...authHeaders,
            });
        } else if (this.isGithubReleaseAssetApiUrl(url)) {
            headers.Accept = "application/octet-stream";
        }

        const response = await fetch(url, {
            method: "GET",
            headers,
        });

        if (this.isSuccessCode(response.status)) {
            return new Uint8Array(await response.arrayBuffer());
        }

        gui_log(i18n.getMessage("buildServerFailure", [url, `HTTP ${response.status}`]));
        return null;
    }

    async fetchGithubJson(url) {
        const proxiedUrl = this.proxyGithubApiUrl(url);
        const response = await fetch(proxiedUrl, {
            method: "GET",
            headers: {
                Accept: "application/vnd.github+json",
            },
        });

        if (this.isSuccessCode(response.status)) {
            return await response.json();
        }

        if (response.status === 404) {
            return null;
        }

        gui_log(i18n.getMessage("buildServerFailure", [url, `HTTP ${response.status}`]));
        return null;
    }

    decodeGithubContent(file) {
        const content = (file?.content || "").replace(/\s/g, "");

        if (!content) {
            return "";
        }

        if (typeof atob === "function") {
            return atob(content);
        }

        if (typeof Buffer !== "undefined") {
            return Buffer.from(content, "base64").toString("utf8");
        }

        throw new Error("No base64 decoder available");
    }

    stripMarkdownCode(value) {
        return String(value || "")
            .replace(/`/g, "")
            .trim();
    }

    parseGigflightReadmeTargets(readmeText) {
        const targets = new Map();

        for (const line of String(readmeText || "").split("\n")) {
            const cells = line
                .split("|")
                .map((cell) => this.stripMarkdownCode(cell))
                .filter(Boolean);

            if (cells.length < 4 || cells[0] === "Target" || /^-+$/.test(cells[0])) {
                continue;
            }

            const target = cells[0].toUpperCase();
            if (!/^[A-Z0-9_]+$/.test(target)) {
                continue;
            }

            targets.set(target, {
                board: cells[1],
                mcu: cells[2],
                manufacturerId: cells[3],
            });
        }

        return targets;
    }

    parseConfigDefine(configText, defineName) {
        const pattern = new RegExp(`^\\s*#define\\s+${defineName}\\s+([^\\s/]+)`, "m");
        const match = String(configText || "").match(pattern);

        if (!match) {
            return "";
        }

        return match[1].replace(/^["']|["']$/g, "").trim();
    }

    manufacturerNameForId(manufacturerId) {
        if (manufacturerId === "GIGF") {
            return "GIGFPV";
        }

        return manufacturerId || "GIGFPV";
    }

    async loadGithubContentText(repository, path) {
        const file = await this.fetchGithubJson(
            `https://api.github.com/repos/${repository}/contents/${path}`,
        );

        return this.decodeGithubContent(file);
    }

    async loadGigflightReadmeMetadata() {
        try {
            const readmeText = await this.loadGithubContentText(GIGFLIGHT_CONFIG_REPOSITORY, "README.md");
            return this.parseGigflightReadmeTargets(readmeText);
        } catch (error) {
            console.warn("Failed to load GIGFlight README target metadata:", error);
            return new Map();
        }
    }

    async loadGigflightConfigTarget(entry, metadataByTarget) {
        const targetFolder = entry.name;
        const configPath = `${entry.path || `configs/${targetFolder}`}/config.h`;
        const configText = await this.loadGithubContentText(GIGFLIGHT_CONFIG_REPOSITORY, configPath);

        const configTarget = this.parseConfigDefine(configText, "BOARD_NAME") || targetFolder;
        const target = configTarget.toUpperCase();
        const metadata = metadataByTarget.get(target) || {};
        const manufacturerId =
            this.parseConfigDefine(configText, "MANUFACTURER_ID") || metadata.manufacturerId || "";
        const mcu = metadata.mcu || this.parseConfigDefine(configText, "FC_TARGET_MCU");

        return {
            target,
            group: "supported",
            manufacturer: this.manufacturerNameForId(manufacturerId),
            manufacturerId,
            board: metadata.board || target,
            mcu,
            repository: GIGFLIGHT_REPOSITORY,
            configRepository: GIGFLIGHT_CONFIG_REPOSITORY,
            configPath,
        };
    }

    async loadGigflightConfigTargets() {
        if (!this._gigflightTargetsPromise) {
            this._gigflightTargetsPromise = (async () => {
                const configEntries = await this.fetchGithubJson(
                    `https://api.github.com/repos/${GIGFLIGHT_CONFIG_REPOSITORY}/contents/configs`,
                );

                if (!Array.isArray(configEntries)) {
                    return [];
                }

                const metadataByTarget = await this.loadGigflightReadmeMetadata();
                const targetEntries = configEntries.filter((entry) => entry.type === "dir");
                const targets = await Promise.all(
                    targetEntries.map(async (entry) => {
                        try {
                            return await this.loadGigflightConfigTarget(entry, metadataByTarget);
                        } catch (error) {
                            console.warn(`Failed to load GIGFlight target ${entry.name}:`, error);
                            return null;
                        }
                    }),
                );

                return targets.filter(Boolean).sort((a, b) => a.target.localeCompare(b.target));
            })();
        }

        return this._gigflightTargetsPromise;
    }

    async findGigflightTarget(target) {
        const normalizedTarget = String(target || "").toUpperCase();
        const targets = await this.loadGigflightConfigTargets();

        return targets.find((descriptor) => descriptor.target === normalizedTarget);
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
        const targets = await this.loadGigflightConfigTargets();
        return targets.map((target) => ({ ...target }));
    }

    async loadTargetReleases(target) {
        const descriptor = await this.findGigflightTarget(target);
        if (!descriptor) {
            return { releases: [] };
        }

        const releases = await this.fetchGithubJson(
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
        const descriptor = await this.findGigflightTarget(target);
        if (!descriptor) {
            return null;
        }

        const releaseDetail = await this.fetchGithubJson(
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
            file: firmwareAsset.url,
            filename: firmwareAsset.name,
            firmwareType: "HEX",
            releaseType: releaseDetail.prerelease ? "ReleaseCandidate" : "Stable",
            cloudBuild: false,
        };
    }

    async loadTargetFirmware(path) {
        const url = new URL(path, this._url).toString();
        return await this.fetchBytes(this.proxyGithubReleaseAssetUrl(url));
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
