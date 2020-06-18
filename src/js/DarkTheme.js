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

DarkTheme.apply = function() {
    if (this.isDarkThemeEnabled(this.configEnabled)) {
        this.applyDark();
    } else {
        this.applyNormal();
    }

    if (chrome.app.window !== undefined) {
        windowWatcherUtil.passValue(chrome.app.window.get("receiver_msp"), 'darkTheme', this.isDarkThemeEnabled(this.configEnabled));
    }
};

DarkTheme.autoSet = function() {
    if (this.configEnabled === 2) {
        this.apply();
    }
};

DarkTheme.setConfig = function (result) {
    if (this.configEnabled != result) {
        this.configEnabled = result;
        this.apply();
    }
};

DarkTheme.applyDark = function () {
    css_dark.forEach((el) => $('link[href="' + el + '"]').prop('disabled', false));
};

DarkTheme.applyNormal = function () {
    css_dark.forEach((el) => $('link[href="' + el + '"]').prop('disabled', true));
};
