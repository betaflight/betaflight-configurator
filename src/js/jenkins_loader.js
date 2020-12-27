'use strict';

const JenkinsLoader = function (url) {
    this._url = url;
    this._jobs = [];
    this._cacheExpirationPeriod = 3600 * 1000;

    this._jobsRequest = '/api/json?tree=jobs[name]';
    this._buildsRequest = '/api/json?tree=builds[number,result,timestamp,artifacts[relativePath],changeSet[items[commitId,msg]]]';
}

JenkinsLoader.prototype.loadJobs = function (viewName, callback) {
    const self = this;

    const viewUrl = `${self._url}/view/${viewName}`;
    const jobsDataTag = `${viewUrl}_JobsData`;
    const cacheLastUpdateTag = `${viewUrl}_JobsLastUpdate`;

    const wrappedCallback = jobs => {
        self._jobs = jobs;
        callback(jobs);
    };

    chrome.storage.local.get([cacheLastUpdateTag, jobsDataTag], function (result) {
        const jobsDataTimestamp = $.now();
        const cachedJobsData = result[jobsDataTag];
        const cachedJobsLastUpdate = result[cacheLastUpdateTag];

        const cachedCallback = () => {
            if (cachedJobsData) {
                GUI.log(i18n.getMessage('buildServerUsingCached', ['jobs']));
            }

            wrappedCallback(cachedJobsData ? cachedJobsData : []);
        };

        if (!cachedJobsData || !cachedJobsLastUpdate || jobsDataTimestamp - cachedJobsLastUpdate > self._cacheExpirationPeriod) {
            const url = `${viewUrl}${self._jobsRequest}`;

            $.get(url, jobsInfo => {
                GUI.log(i18n.getMessage('buildServerLoaded', ['jobs']));

                // remove Betaflight prefix, rename Betaflight job to Development
                const jobs = jobsInfo.jobs.map(job => {
                    return { title: job.name.replace('Betaflight ', '').replace('Betaflight', 'Development'), name: job.name };
                })

                // cache loaded info
                const object = {}
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
    const self = this;

    const jobUrl = `${self._url}/job/${jobName}`;
    const buildsDataTag = `${jobUrl}BuildsData`;
    const cacheLastUpdateTag = `${jobUrl}BuildsLastUpdate`

    chrome.storage.local.get([cacheLastUpdateTag, buildsDataTag], function (result) {
        const buildsDataTimestamp = $.now();
        const cachedBuildsData = result[buildsDataTag];
        const cachedBuildsLastUpdate = result[cacheLastUpdateTag];

        const cachedCallback = () => {
            if (cachedBuildsData) {
                GUI.log(i18n.getMessage('buildServerUsingCached', [jobName]));
            }

            self._parseBuilds(jobUrl, jobName, cachedBuildsData ? cachedBuildsData : [], callback);
        };

        if (!cachedBuildsData || !cachedBuildsLastUpdate || buildsDataTimestamp - cachedBuildsLastUpdate > self._cacheExpirationPeriod) {
            const url = `${jobUrl}${self._buildsRequest}`;

            $.get(url, function (buildsInfo) {
                GUI.log(i18n.getMessage('buildServerLoaded', [jobName]));

                // filter successful builds
                const builds = buildsInfo.builds.filter(build => build.result == 'SUCCESS')
                    .map(build => ({
                        number: build.number,
                        artifacts: build.artifacts.map(artifact => artifact.relativePath),
                        changes: build.changeSet.items.map(item => `* ${item.msg}`).join('<br>\n'),
                        timestamp: build.timestamp
                    }));

                // cache loaded info
                const object = {}
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
    const targetBuilds = {};

    const targetFromFilenameExpression = /betaflight_([\d.]+)?_?(\w+)(\-.*)?\.(.*)/;

    builds.forEach(build => {
        build.artifacts.forEach(relativePath => {
            const match = targetFromFilenameExpression.exec(relativePath);

            if (!match) {
                return;
            }

            const version = match[1];
            const target = match[2];
            const date = new Date(build.timestamp);

            const day = (`0${date.getDate()}`).slice(-2);
            const month = (`0${(date.getMonth() + 1)}`).slice(-2);
            const year = date.getFullYear();
            const hours = (`0${date.getHours()}`).slice(-2);
            const minutes = (`0${date.getMinutes()}`).slice(-2);

            const formattedDate = `${day}-${month}-${year} ${hours}:${minutes}`;

            const descriptor = {
                'releaseUrl': `${jobUrl}/${build.number}`,
                'name'      : `${jobName} #${build.number}`,
                'version'   : `${version} #${build.number}`,
                'url'       : `${jobUrl}/${build.number}/artifact/${relativePath}`,
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
