function GUI_checkOperatingSystem() {
    if (navigator.appVersion.indexOf("Win") !== -1) {
        return "Windows";
    } else if (navigator.appVersion.indexOf("Mac") !== -1) {
        return "MacOS";
    } else if (navigator.appVersion.indexOf("Android") !== -1) {
        return "Android";
    } else if (navigator.appVersion.indexOf("Linux") !== -1) {
        return "Linux";
    } else if (navigator.appVersion.indexOf("X11") !== -1) {
        return "UNIX";
    } else {
        return "Unknown";
    }
}
