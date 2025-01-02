import BuildApi from "./BuildApi";
import DarkTheme from "./DarkTheme";
import GUI from "./gui";
import { ispConnected } from "./utils/connection";

export default class Sponsor {
    constructor() {
        this._api = new BuildApi();
    }

    Refresh() {
        if (!ispConnected()) {
            return;
        }

        if (!this._div) {
            return;
        }

        this._api.loadSponsorTile(DarkTheme.enabled ? "dark" : "light", this._name, (content) => {
            if (content) {
                this._div.fadeOut(500, () => {
                    this._div.html(content);
                    this._div.fadeIn(500);
                });
                this._div.show();
            } else {
                this._div.hide();
            }
        });
    }

    loadSponsorTile(name, div) {
        this._name = name;
        this._div = div;

        GUI.interval_add(
            "sponsor",
            () => {
                this.Refresh();
            },
            15000,
            true,
        );
    }
}
