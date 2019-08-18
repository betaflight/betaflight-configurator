 'use strict;'

var JenkinsLoader = function (url) {
    this._url = url;
    this._jobs = [];
    this._cacheExpirationPeriod = 3600 * 1000;

    this._jobsRequest = '/api/json?tree=jobs[name]';
    this._buildsRequest = '/api/json?tree=builds[number,result,timestamp,artifacts[relativePath],changeSet[items[commitId,msg]]]';
}

JenkinsLoader.prototype.loadJobs = function (viewName, callback) {
    var self = this;

    var viewUrl = `${self._url}/view/${viewName}`;
    var jobsDataTag = `${viewUrl}_JobsData`;
    var cacheLastUpdateTag = `${viewUrl}_JobsLastUpdate`;

    var wrappedCallback = jobs => {
        self._jobs = jobs;
        callback(jobs);
    };

    chrome.storage.local.get([cacheLastUpdateTag, jobsDataTag], function (result) {
        var jobsDataTimestamp = $.now();
        var cachedJobsData = result[jobsDataTag];
        var cachedJobsLastUpdate = result[cacheLastUpdateTag];

        var cachedCallback = () => {
            if (cachedJobsData) {
                GUI.log(i18n.getMessage('buildServerUsingCached', ['jobs']));
            }

            wrappedCallback(cachedJobsData ? cachedJobsData : []);
        };

        if (!cachedJobsData || !cachedJobsLastUpdate || jobsDataTimestamp - cachedJobsLastUpdate > self._cacheExpirationPeriod) {
            var url = `${viewUrl}${self._jobsRequest}`;

            $.get(url, jobsInfo => {
                GUI.log(i18n.getMessage('buildServerLoaded', ['jobs']));

                // remove Betaflight prefix, rename Betaflight job to Development
                var jobs = jobsInfo.jobs.map(job => {
                    return { title: job.name.replace('Betaflight ', '').replace('Betaflight', 'Development'), name: job.name };
                })

                // cache loaded info
                object = {}
                object[jobsDataTag] = jobs;
                object[cacheLastUpdateTag] = $.now();
                chrome.storage.local.set(object);

                wrappedCallback(jobs);
            }).fail(xhr => {
                GUI.log(i18n.getMessage('buildServerLoadFailed', ['jobs', `HTTP ${xhr.status}`]));
                cachedCallback();
            });
        } else {
            cachedCallback();
        }
    });
}

JenkinsLoader.prototype.loadBuilds = function (jobName, callback) {
    var self = this;

    var jobUrl = `${self._url}/job/${jobName}`;
    var buildsDataTag = `${jobUrl}BuildsData`;
    var cacheLastUpdateTag = `${jobUrl}BuildsLastUpdate`

    chrome.storage.local.get([cacheLastUpdateTag, buildsDataTag], function (result) {
        var buildsDataTimestamp = $.now();
        var cachedBuildsData = result[buildsDataTag];
        var cachedBuildsLastUpdate = result[cacheLastUpdateTag];

        var cachedCallback = () => {
            if (cachedBuildsData) {
                GUI.log(i18n.getMessage('buildServerUsingCached', [jobName]));
            }

            self._parseBuilds(jobUrl, jobName, cachedBuildsData ? cachedBuildsData : [], callback);
        };

        if (!cachedBuildsData || !cachedBuildsLastUpdate || buildsDataTimestamp - cachedBuildsLastUpdate > self._cacheExpirationPeriod) {
            var url = `${jobUrl}${self._buildsRequest}`;

            $.get(url, function (buildsInfo) {
                GUI.log(i18n.getMessage('buildServerLoaded', [jobName]));

                // filter successful builds
                var builds = buildsInfo.builds.filter(build => build.result == 'SUCCESS')
                    .map(build => ({
                        number: build.number,
                        artifacts: build.artifacts.map(artifact => artifact.relativePath),
                        changes: build.changeSet.items.map(item => '* ' + item.msg).join('<br>\n'),
                        timestamp: build.timestamp
                    }));

                // cache loaded info
                object = {}
                object[buildsDataTag] = builds;
                object[cacheLastUpdateTag] = $.now();
                chrome.storage.local.set(object);

                self._parseBuilds(jobUrl, jobName, builds, callback);
            }).fail(xhr => {
                GUI.log(i18n.getMessage('buildServerLoadFailed', [jobName, `HTTP ${xhr.status}`]));
                cachedCallback();
            });
        } else {
            cachedCallback();
        }
    });
}

JenkinsLoader.prototype._parseBuilds = function (jobUrl, jobName, builds, callback) {
    // convert from `build -> targets` to `target -> builds` mapping
    var targetBuilds = {};

    var targetFromFilenameExpression = /betaflight_([\d.]+)?_?(\w+)(\-.*)?\.(.*)/;

    builds.forEach(build => {
        build.artifacts.forEach(relativePath => {
            var match = targetFromFilenameExpression.exec(relativePath);

            if (!match) {
                return;
            }

            var version = match[1];
            var target = match[2];
            var date = new Date(build.timestamp);

            var formattedDate = ("0" + date.getDate()).slice(-2) + "-" + ("0" + (date.getMonth()+1)).slice(-2) + "-" +
                date.getFullYear() + " " + ("0" + date.getHours()).slice(-2) + ":" + ("0" + date.getMinutes()).slice(-2);

            var descriptor = {
                'releaseUrl': jobUrl + '/' + build.number,
                'name'      : jobName + ' #' + build.number,
                'version'   : version + ' #' + build.number,
                'url'       : jobUrl + '/' + build.number + '/artifact/' + relativePath,
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
