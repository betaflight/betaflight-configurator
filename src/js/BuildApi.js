import { gui_log } from './gui_log';
import { i18n } from "./localization";
import { get as getStorage, set as setStorage } from "./SessionStorage";
import $ from 'jquery';

export default class BuildApi {

    constructor () {
        this._url = 'https://build.betaflight.com';
        this._cacheExpirationPeriod = 3600 * 1000;
    }

    load(url, onSuccess, onFailure) {
        const dataTag = `${url}_Data`;
        const cacheLastUpdateTag = `${url}_LastUpdate`;

        const result = getStorage([cacheLastUpdateTag, dataTag]);
        const dataTimestamp = $.now();
        const cachedData = result[dataTag];
        const cachedLastUpdate = result[cacheLastUpdateTag];

        const cachedCallback = () => {
            if (cachedData) {
                gui_log(i18n.getMessage('buildServerUsingCached', [url]));
            }

            onSuccess(cachedData);
        };

        if (!cachedData || !cachedLastUpdate || dataTimestamp - cachedLastUpdate > this._cacheExpirationPeriod) {
            $.get(url, function (info) {
                // cache loaded info
                const object = {};
                object[dataTag] = info;
                object[cacheLastUpdateTag] = $.now();
                setStorage(object);
                onSuccess(info);
            }).fail(xhr => {
                gui_log(i18n.getMessage('buildServerFailure', [url, `HTTP ${xhr.status}`]));
                if (onFailure !== undefined) {
                    onFailure();
                } else {
                    cachedCallback();
                }
            });
        } else {
            cachedCallback();
        }
    }

    loadTargets(callback) {
        const url = `${this._url}/api/targets`;
        this.load(url, callback);
    }

    loadTargetReleases(target, callback) {
        const url = `${this._url}/api/targets/${target}`;
        this.load(url, callback);
    }

    loadTarget(target, release, onSuccess, onFailure) {
        const url = `${this._url}/api/builds/${release}/${target}`;
        this.load(url, onSuccess, onFailure);
    }

    loadTargetHex(path, onSuccess, onFailure) {
        const url = `${this._url}${path}`;
        $.get(url, function (data) {
            gui_log(i18n.getMessage('buildServerSuccess', [path]));
            onSuccess(data);
        }).fail(xhr => {
            gui_log(i18n.getMessage('buildServerFailure', [path, `HTTP ${xhr.status}`]));
            if (onFailure !== undefined) {
                onFailure();
            }
        });
    }

    getSupportCommands(onSuccess, onFailure) {
        const url = `${this._url}/api/support/commands`;
        $.get(url, function (data) {
            onSuccess(data);
        }).fail(xhr => {
            gui_log(i18n.getMessage('buildServerFailure', [url, `HTTP ${xhr.status}`]));
            if (onFailure !== undefined) {
                onFailure();
            }
        });
    }

    submitSupportData(data, onSuccess, onFailure) {
        const url = `${this._url}/api/support`;
        $.ajax({
            url: url,
            type: "POST",
            data: data,
            contentType: "text/plain",
            dataType: "text",

            success: function(response) {
                onSuccess(response);
            },
        }).fail(xhr => {
            gui_log(i18n.getMessage('buildServerFailure', [`HTTP ${xhr.status}`]));
            if (onFailure !== undefined) {
                onFailure();
            }
        });
    }

    requestBuild(request, onSuccess, onFailure) {
        const url = `${this._url}/api/builds`;
        $.ajax({
            url: url,
            type: "POST",
            data: JSON.stringify(request),
            contentType: "application/json",
            dataType: "json",

            success: function(response) {
                onSuccess(response);
            },
        }).fail(xhr => {
            gui_log(i18n.getMessage('buildServerFailure', [url, `HTTP ${xhr.status}`]));
            if (onFailure !== undefined) {
                onFailure();
            }
        });
    }

    requestBuildStatus(key, onSuccess, onFailure) {
        const url = `${this._url}/api/builds/${key}/status`;
        $.get(url, function (data) {
            gui_log(i18n.getMessage('buildServerSuccess', [url]));
            onSuccess(data);
        }).fail(xhr => {
            gui_log(i18n.getMessage('buildServerFailure', [url, `HTTP ${xhr.status}`]));
            if (onFailure !== undefined) {
                onFailure();
            }
        });
    }

    requestBuildOptions(key, onSuccess, onFailure) {
        const url = `${this._url}/api/builds/${key}/json`;
        $.get(url, function (data) {
            onSuccess(data);
        }).fail(xhr => {
            if (onFailure !== undefined) {
                onFailure();
            }
        });
    }

    loadOptions(release, onSuccess, onFailure) {
        const url = `${this._url}/api/options/${release}`;
        this.load(url, onSuccess, onFailure);
    }

    loadOptionsByBuildKey(release, key, onSuccess, onFailure) {
        const url = `${this._url}/api/options/${release}/${key}`;
        this.load(url, onSuccess, onFailure);
    }

    loadCommits(release, onSuccess, onFailure) {
        const url = `${this._url}/api/releases/${release}/commits`;
        this.load(url, onSuccess, onFailure);
    }

    loadConfiguratorRelease(type, onSuccess, onFailure) {
        const url = `${this._url}/api/configurator/releases/${type}`;
        this.load(url, onSuccess, onFailure);
    }

    loadSponsorTile(mode, page, onSuccess, onFailure) {
        const url = `${this._url}/api/configurator/sponsors/${mode}/${page}`;
        this.load(url, onSuccess, onFailure);
    }
}
