import BuildApi from './BuildApi';
import DarkTheme from './DarkTheme';

export default class Sponsor {

    constructor () {
        this._api = new BuildApi();
    }

    loadSponsorTile(name, div) {
        if (!navigator.onLine) {
            return;
        }

        this._api.loadSponsorTile(DarkTheme.enabled ? 'dark' : 'light', name,
            (content) => {
                if (content) {
                    div.html(content);
                    div.show();
                } else {
                    div.hide();
                }
            },
        );
    }
}
