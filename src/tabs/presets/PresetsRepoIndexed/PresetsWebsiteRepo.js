import PresetsRepoIndexed from "./PresetsRepoIndexed";

export default class PresetsWebsiteRepo extends PresetsRepoIndexed {
    constructor(url, official, name) {
        let correctUrl = url.trim();

        if (!correctUrl.endsWith("/")) {
            correctUrl += "/";
        }

        const urlRaw = correctUrl;
        const urlViewOnline = correctUrl;

        super(urlRaw, urlViewOnline);
        this._official = official;
        this._name = name;
    }

    get official() {
        return this._official;
    }

    get name() {
        return this._name;
    }
}
