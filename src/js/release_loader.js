'use strict';

class ReleaseLoader {

    constructor (url) {
        this._url = url;
        this._cacheExpirationPeriod = 3600 * 1000;
    }

    load(url, onSuccess, onFailure) {

        const dataTag = `${url}_Data`;
        const cacheLastUpdateTag = `${url}_LastUpdate`;

        const result = SessionStorage.get([cacheLastUpdateTag, dataTag]);
        const dataTimestamp = $.now();
        const cachedData = result[dataTag];
        const cachedLastUpdate = result[cacheLastUpdateTag];

        const cachedCallback = () => {
            if (cachedData) {
                GUI.log(i18n.getMessage('buildServerUsingCached', [url]));
            }

            onSuccess(cachedData);
        };

        if (!cachedData || !cachedLastUpdate || dataTimestamp - cachedLastUpdate > this._cacheExpirationPeriod) {
            $.get(url, function (info) {
                GUI.log(i18n.getMessage('buildServerLoaded', [url]));

                // cache loaded info
                const object = {};
                object[dataTag] = info;
                object[cacheLastUpdateTag] = $.now();
                SessionStorage.set(object);
                onSuccess(info);
            }).fail(xhr => {
                GUI.log(i18n.getMessage('buildServerLoadFailed', [url, `HTTP ${xhr.status}`]));
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
            GUI.log(i18n.getMessage('buildServerLoaded', [path]));
            onSuccess(data);
        }).fail(xhr => {
            GUI.log(i18n.getMessage('buildServerLoadFailed', [path, `HTTP ${xhr.status}`]));
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
            success: function(data) {
                data.url = `/api/builds/${data.key}/hex`;
                onSuccess(data);
            },
        }).fail(xhr => {
            GUI.log(i18n.getMessage('buildServerLoadFailed', [url, `HTTP ${xhr.status}`]));
            if (onFailure !== undefined) {
                onFailure();
            }
        });
    }

    requestBuildStatus(key, onSuccess, onFailure) {

        const url = `${this._url}/api/builds/${key}/status`;
        $.get(url, function (data) {
            GUI.log(i18n.getMessage('buildServerLoaded', [url]));
            onSuccess(data);
        }).fail(xhr => {
            GUI.log(i18n.getMessage('buildServerLoadFailed', [url, `HTTP ${xhr.status}`]));
            if (onFailure !== undefined) {
                onFailure();
            }
        });
    }

    loadOptions(onSuccess, onFailure) {

        const url = `${this._url}/api/options`;
        this.load(url, onSuccess, onFailure);
    }

    loadCommits(release, onSuccess, onFailure) {

        const url = `${this._url}/api/releases/${release}/commits`;
        this.load(url, onSuccess, onFailure);
    }
}
