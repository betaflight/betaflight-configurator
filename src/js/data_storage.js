'use strict';

const API_VERSION_1_43 = '1.43.0';

var CONFIGURATOR = {
    // all versions are specified and compared using semantic versioning http://semver.org/
    API_VERSION_ACCEPTED: '1.2.1',
    API_VERSION_MIN_SUPPORTED_BACKUP_RESTORE: '1.5.0',
    API_VERSION_MIN_SUPPORTED_PID_CONTROLLER_CHANGE: '1.5.0',
    BACKUP_FILE_VERSION_MIN_SUPPORTED: '0.55.0', // chrome.runtime.getManifest().version is stored as string, so does this one
    API_VERSION_MAX_SUPPORTED: API_VERSION_1_43,

    connectionValid: false,
    connectionValidCliOnly: false,
    cliActive: false,
    cliValid: false,
    gitChangesetId: 'unknown',
    version: '0.0.1',
    latestVersion: '0.0.1',
    latestVersionReleaseUrl: 'https://github.com/betaflight/betaflight-configurator/releases',
};
