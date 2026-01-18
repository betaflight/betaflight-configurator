import BuildApi from "./BuildApi";
import DarkTheme from "./DarkTheme";
import GUI from "./gui";
import { ispConnected } from "./utils/connection";

export default class Sponsor {
    constructor() {
        this._api = new BuildApi();
    }

    async Refresh() {
        if (!ispConnected()) {
            return;
        }

        if (!this._div) {
            return;
        }

        try {
            let content = await this._api.loadSponsorTile(DarkTheme.enabled ? "dark" : "light", this._name);
            if (content) {
                this._div.fadeOut(500, () => {
                    this._div.html(content);
                    this._div.fadeIn(500);
                });
                this._div.show();
                return;
            }
        } catch (error) {
            console.error("[Sponsor] Failed to load sponsor tile: ", error);
        }
        this._div.hide();
    }

    async loadSponsorTile(name, div) {
        this._name = name;
        // Ensure we have a jQuery object for DOM manipulation
        this._div = div instanceof jQuery ? div : $(div);

        GUI.interval_add(
            "sponsor",
            async () => {
                await this.Refresh();
            },
            15000,
            true,
        );
    }
}
