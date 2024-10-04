export const API_VERSION_1_39 = '1.39.0';
export const API_VERSION_1_44 = '1.44.0';
export const API_VERSION_1_45 = '1.45.0';
export const API_VERSION_1_46 = '1.46.0';
export const API_VERSION_1_47 = '1.47.0';

const CONFIGURATOR = {
    // all versions are specified and compared using semantic versioning http://semver.org/
    API_VERSION_ACCEPTED: API_VERSION_1_44,
    API_VERSION_MAX_SUPPORTED: API_VERSION_1_47,

    connectionValid: false,
    connectionValidCliOnly: false,
    bluetoothMode: false,
    manualMode: false,
    virtualMode: false,
    virtualApiVersion: '0.0.1',
    cliActive: false,
    cliValid: false,
    productName: 'Betaflight Configurator',
    cliEngineActive: false,
    cliEngineValid: false,
    gitChangesetId: 'unknown',
    version: '0.0.1',
    gitRevision: 'norevision',
    latestVersion: '0.0.1',
    latestVersionReleaseUrl: 'https://github.com/betaflight/betaflight-configurator/releases',

    getDisplayVersion: function () {
        if (this.version.indexOf(this.gitRevision) === -1) {
            return `${this.version} (${this.gitRevision})`;
        } else {
            return `${this.version}`;
        }
    },

    isDevVersion: function() {
        return this.version.includes('debug');
    },
};

export default CONFIGURATOR;
