import { reactive } from "vue";

export const API_VERSION_1_39 = "1.39.0";
export const API_VERSION_1_41 = "1.41.0";
export const API_VERSION_1_44 = "1.44.0";
export const API_VERSION_1_45 = "1.45.0";
export const API_VERSION_1_46 = "1.46.0";
export const API_VERSION_1_47 = "1.47.0";
export const API_VERSION_1_48 = "1.48.0";
export const API_VERSION_1_49 = "1.49.0";

export interface Configurator {
    // all versions are specified and compared using semantic versioning http://semver.org/
    API_VERSION_ACCEPTED: string;
    API_VERSION_MAX_SUPPORTED: string;

    connectionValid: boolean;
    connectionValidCliOnly: boolean;
    virtualMode: boolean;
    virtualApiVersion: string;
    cliActive: boolean;
    cliValid: boolean;
    productName: string;
    gitChangesetId: string;
    version: string;
    gitRevision: string;
    latestVersion: string;
    latestVersionReleaseUrl: string;

    getDisplayVersion(): string;
    isDevVersion(): boolean;
}

const CONFIGURATOR: Configurator = reactive({
    API_VERSION_ACCEPTED: API_VERSION_1_44,
    API_VERSION_MAX_SUPPORTED: API_VERSION_1_49,

    connectionValid: false,
    connectionValidCliOnly: false,
    virtualMode: false,
    virtualApiVersion: "0.0.1",
    cliActive: false,
    cliValid: false,
    productName: "Betaflight App",
    gitChangesetId: "unknown",
    version: "0.0.1",
    gitRevision: "norevision",
    latestVersion: "0.0.1",
    latestVersionReleaseUrl: "https://github.com/betaflight/betaflight-configurator/releases",

    getDisplayVersion(): string {
        if (this.version.indexOf(this.gitRevision) === -1) {
            return `${this.version} (${this.gitRevision})`;
        } else {
            return `${this.version}`;
        }
    },

    isDevVersion(): boolean {
        return this.version.includes("debug");
    },
});

export default CONFIGURATOR;
