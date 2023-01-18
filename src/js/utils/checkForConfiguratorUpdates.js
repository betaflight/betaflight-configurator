import semver from "semver";
import ReleaseChecker from "../release_checker";
import { get as getConfig } from "../ConfigStorage";
import CONFIGURATOR from "../data_storage";
import { i18n } from "../localization";
import { gui_log } from "../gui_log";

function notifyOutdatedVersion(releaseData) {
    const result = getConfig('checkForConfiguratorUnstableVersions');
    let showUnstableReleases = false;
    if (result.checkForConfiguratorUnstableVersions) {
        showUnstableReleases = true;
    }

    if (releaseData === undefined) {
        console.log('No releaseData');
        return false;
    }

    const versions = releaseData.filter(function (version) {
        const semVerVersion = semver.parse(version.tag_name);
        if (semVerVersion && (showUnstableReleases || semVerVersion.prerelease.length === 0)) {
            return version;
        } else {
            return null;
        }
        }).sort(function (v1, v2) {
        try {
            return semver.compare(v2.tag_name, v1.tag_name);
        } catch (e) {
            return false;
        }
    });

    if (versions.length > 0) {
        CONFIGURATOR.latestVersion = versions[0].tag_name;
        CONFIGURATOR.latestVersionReleaseUrl = versions[0].html_url;
    }

    if (semver.lt(CONFIGURATOR.version, CONFIGURATOR.latestVersion)) {
        const message = i18n.getMessage('configuratorUpdateNotice', [CONFIGURATOR.latestVersion, CONFIGURATOR.latestVersionReleaseUrl]);
        gui_log(message);

        const dialog = $('.dialogConfiguratorUpdate')[0];

        $('.dialogConfiguratorUpdate-content').html(message);

        $('.dialogConfiguratorUpdate-closebtn').click(function() {
            dialog.close();
        });

        $('.dialogConfiguratorUpdate-websitebtn').click(function() {
            dialog.close();

            window.open(CONFIGURATOR.latestVersionReleaseUrl, '_blank');
        });

        dialog.showModal();
    }
}

export function checkForConfiguratorUpdates() {
    const releaseChecker = new ReleaseChecker('configurator', 'https://api.github.com/repos/betaflight/betaflight-configurator/releases');

    releaseChecker.loadReleaseData(notifyOutdatedVersion);
}
