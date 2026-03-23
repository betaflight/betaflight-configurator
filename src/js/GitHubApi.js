// NOTE: this files seems to be unused anywhere
const GitHubApi = function () {
    this.GITHUB_API_URL = "https://api.github.com/";
};

GitHubApi.prototype.getFileLastCommitInfo = function (project, branch, filename, callback) {
    const url = `${this.GITHUB_API_URL}repos/${encodeURI(project)}/commits?sha=${encodeURIComponent(
        branch,
    )}&path=${encodeURIComponent(filename)}`;

    fetch(url)
        .then((response) => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return response.json();
        })
        .then((commits) => {
            const result = {};
            try {
                result.commitHash = commits[0].sha.substring(0, 8);
                result.date = commits[0].commit.author.date;
            } catch (exception) {
                console.log(`Error while parsing commit: ${exception}`);
            }

            console.log(`Found commit info for file ${filename}:`, result);

            callback(result);
        })
        .catch((error) => console.log(`Error fetching commit info: ${error}`));
};

export default GitHubApi;
