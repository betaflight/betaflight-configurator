'use strict';

var css_dark = [
    './css/dark-theme.css',
];

var DarkTheme = {
    configEnabled: undefined,
};

DarkTheme.isDarkThemeEnabled = function (val) {
    return val === 0 || val === 2 && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
};

DarkTheme.setConfig = function (result) {
    if (this.configEnabled != result) {
        this.configEnabled = result;

        if (this.isDarkThemeEnabled(this.configEnabled)) {
            this.applyDark();
        } else {
            this.applyNormal();
        }

        windowWatcherUtil.passValue(chrome.app.window.get("receiver_msp"), 'darkTheme', this.isDarkThemeEnabled(this.configEnabled));

    }
};

DarkTheme.applyDark = function () {
    css_dark.forEach((el) => $('link[href="' + el + '"]').prop('disabled', false));
};

DarkTheme.applyNormal = function () {
    css_dark.forEach((el) => $('link[href="' + el + '"]').prop('disabled', true));
};
