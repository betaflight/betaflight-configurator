const DarkTheme = {};

/** @type {number | undefined} 0 = dark, 1 = light, 2 = follow the OS */
DarkTheme.configSetting = undefined;
DarkTheme.enabled = false;

DarkTheme.isDarkThemeEnabled = function (callback) {
    if (this.configSetting === 0) {
        callback(true);
    } else if (this.configSetting === 2) {
        const isEnabled = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
        callback(isEnabled);
    } else {
        callback(false);
    }
};

DarkTheme.apply = function () {
    this.isDarkThemeEnabled((isEnabled) => {
        if (isEnabled) {
            this.applyDark();
        } else {
            this.applyNormal();
        }
    });
};

DarkTheme.autoSet = function () {
    if (this.configSetting === 2) {
        this.apply();
    }
};

DarkTheme.setConfig = function (result) {
    if (this.configSetting !== result) {
        this.configSetting = result;
        this.apply();
    }
};

DarkTheme.applyDark = function () {
    document.documentElement.classList.add("dark");
    this.enabled = true;
};

DarkTheme.applyNormal = function () {
    document.documentElement.classList.remove("dark");
    this.enabled = false;
};

/** @param {number | undefined} enabled 0 = dark, 1 = light, 2 = follow the OS */
export function setDarkTheme(enabled) {
    DarkTheme.setConfig(enabled);
}

export default DarkTheme;
