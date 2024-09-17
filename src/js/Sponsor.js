import BuildApi from './BuildApi';
import DarkTheme from './DarkTheme';
import { ispConnected } from './utils/connection';

export default class Sponsor {

    constructor () {
        this._api = new BuildApi();
        this._timer = ispConnected() ? setInterval(() => { this.Refresh(); }, 30000) : null;
    }

    Refresh() {
        if (!ispConnected()) {
            return;
        }

        if (!this._div) {
            return;
        }

        this._api.loadSponsorTile(DarkTheme.enabled ? 'dark' : 'light', this._name,
            (content) => {
                if (content) {
                    this._div.fadeOut(500, () => {
                        this._div.html(content);
                        this._div.fadeIn(500);
                    });
                    this._div.show();
                } else {
                    this._div.hide();
                }
            },
        );
    }

    loadSponsorTile(name, div) {
        this._name = name;
        this._div = div;
        this.Refresh();
    }
}
