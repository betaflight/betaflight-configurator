import PresetsRepoIndexed from "./PresetsRepoIndexed";

export default class PresetsWebsiteRepo extends PresetsRepoIndexed {
    constructor(url) {
        let correctUrl = url.trim();

        if (!correctUrl.endsWith("/")) {
            correctUrl += "/";
        }

        const urlRaw = correctUrl;
        const urlViewOnline = correctUrl;

        super(urlRaw, urlViewOnline);
    }
}
