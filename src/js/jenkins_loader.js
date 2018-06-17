 'use strict;'

var JenkinsLoader = function (url, jobName) {
    var self = this;
    
    self._url = url;
    self._jobName = jobName;
    self._jobUrl = self._url + '/job/' + self._jobName;
    self._buildsRequest = '/api/json?tree=builds[number,result,timestamp,artifacts[relativePath],changeSet[items[commitId,msg]]]';
    self._builds = {};

    self._buildsDataTag = `${self._jobUrl}BuildsData`;
    self._cacheLastUpdateTag = `${self._jobUrl}BuildsLastUpdate`
}

JenkinsLoader.prototype.loadBuilds = function (callback) {
    var self = this;

    chrome.storage.local.get([self._cacheLastUpdateTag, self._buildsDataTag], function (result) {
        var buildsDataTimestamp = $.now();
        var cachedBuildsData = result[self._buildsDataTag];
        var cachedBuildsLastUpdate = result[self._cacheLastUpdateTag];

        if (!cachedBuildsData || !cachedBuildsLastUpdate || buildsDataTimestamp - cachedBuildsLastUpdate > 3600 * 1000) {
            var request = self._jobUrl + self._buildsRequest;

            $.get(request, function (buildsInfo) {
                // filter successful builds
                self._builds = buildsInfo.builds.filter(build => build.result == 'SUCCESS')
                    .map(build => ({
                        number: build.number,
                        artifacts: build.artifacts.map(artifact => artifact.relativePath),
                        changes: build.changeSet.items.map(item => '* ' + item.msg).join('<br>\n'),
                        date: new Date(build.timestamp)
                    }));

                self._parseBuilds(callback);
            }).fail(function (data) {
                GUI.log(i18n.getMessage('releaseCheckFailed', [self._jobName, 'failed to load builds']));
            
                self._builds = cachedBuildsData;
                self._parseBuilds(callback);
            });
        } else {
            if (cachedBuildsData) {
                GUI.log(i18n.getMessage('releaseCheckCached', [self._jobName]));
            }

            self._builds = cachedBuildsData;
            self._parseBuilds(callback);
        }
    });
}

JenkinsLoader.prototype._parseBuilds = function (callback) {
    var self = this;

    // convert from `build -> targets` to `target -> builds` mapping
    var targetBuilds = {};

    var targetFromFilenameExpression = /betaflight_([\d.]+)?_?(\w+)(\-.*)?\.(.*)/;

    self._builds.forEach(build => {
        build.artifacts.forEach(relativePath => {
            var match = targetFromFilenameExpression.exec(relativePath);

            if (!match) {
                return;
            }

            var version = match[1];
            var target = match[2];

            var formattedDate = ("0" + build.date.getDate()).slice(-2) + "-" + ("0" + (build.date.getMonth()+1)).slice(-2) + "-" +
                build.date.getFullYear() + " " + ("0" + build.date.getHours()).slice(-2) + ":" + ("0" + build.date.getMinutes()).slice(-2);

            var descriptor = {
                'releaseUrl': self._jobUrl + '/' + build.number,
                'name'      : self._jobName + ' #' + build.number,
                'version'   : version + ' #' + build.number,
                'url'       : self._jobUrl + '/' + build.number + '/artifact/' + relativePath,
                'file'      : relativePath.split('/').slice(-1)[0],
                'target'    : target,
                'date'      : formattedDate,
                'notes'     : build.changes
            };

            if (targetBuilds[target]) {
                targetBuilds[target].push(descriptor);
            } else {
                targetBuilds[target] = [ descriptor ];
            }
        });
    });

    callback(targetBuilds);
}
