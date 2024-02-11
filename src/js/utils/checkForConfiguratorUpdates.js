import BuildApi from "../BuildApi";
import { get as getConfig } from "../ConfigStorage";
import CONFIGURATOR from "../data_storage";
import { i18n } from "../localization";
import { gui_log } from "../gui_log";
import $ from 'jquery';

function notifyOutdatedVersion(data) {

    if (data === undefined) {
        console.log('No releaseData');
        return false;
    }

    if (data.isCurrent === false && data.updatedVersion !== undefined) {

        CONFIGURATOR.latestVersion = data.updatedVersion.version;
        CONFIGURATOR.latestVersionReleaseUrl = data.updatedVersion.url;

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
    } else {
        CONFIGURATOR.latestVersion = data.version;
    }
}

export function checkForConfiguratorUpdates() {

    const result = getConfig('checkForConfiguratorUnstableVersions');
    let type = "Stable";
    if (result.checkForConfiguratorUnstableVersions) {
        type = "Unstable";
    }

    const buildApi = new BuildApi();
    buildApi.loadConfiguratorRelease(type, notifyOutdatedVersion);
}
