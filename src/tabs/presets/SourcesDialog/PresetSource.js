'use strict';

class PresetSource {
    constructor(name, url, gitHubBranch = "") {
        this.name = name;
        this.url = url;
        this.gitHubBranch = gitHubBranch;
        this.official = false;
    }

    static isUrlGithubRepo(url) {
        return url.trim().toLowerCase().startsWith("https://github.com/");
    }
}
