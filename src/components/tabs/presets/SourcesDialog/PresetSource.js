export default class PresetSource {
    constructor(name, url, gitHubBranch = "", id = "") {
        this.name = name;
        this.url = url;
        this.gitHubBranch = gitHubBranch;
        this.id = id;
        this.official = false;
    }

    static isUrlGithubRepo(url) {
        return (url ?? "").trim().toLowerCase().startsWith("https://github.com/");
    }

    static containsBranchName(url) {
        return (url ?? "").includes("/tree/");
    }

    static getBranchName(url) {
        const pattern = /https:\/\/github\.com\/[^\/]+\/[^\/]+\/tree\/([^\/]+)/;
        const match = url.match(pattern);

        return match ? match[1] : null;
    }
}
