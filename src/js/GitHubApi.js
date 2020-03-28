'use strict';

const GitHubApi = function ()
{
    const self = this;

    self.GITHUB_API_URL = "https://api.github.com/";
};

GitHubApi.prototype.getFileLastCommitInfo = function (project, branch, filename, callback)
{
    const self = this;

    $.getJSON(`${self.GITHUB_API_URL}repos/${encodeURI(project)}/commits?sha=${encodeURIComponent(branch)}&path=${encodeURIComponent(filename)}`, function (commits) {
        const result = {};
        try {
            result.commitHash = commits[0].sha.substring(0, 8);
            result.date = commits[0].commit.author.date;
        } catch (exception) {
            console.log(`Error while parsing commit: ${exception}`);
        }

        console.log(`Found commit info for file ${filename}:`, result);

        callback(result);
    });
};
