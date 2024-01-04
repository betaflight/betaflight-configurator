import ShortUniqueId from 'short-unique-id';
import BuildApi from './BuildApi';
import { set as setConfig, get as getConfig } from './ConfigStorage';
import GUI from './gui';
import CONFIGURATOR from './data_storage';
import $ from 'jquery';

let tracking = null;
export { tracking };

export function createAnalytics(settings) {
    tracking = new Analytics(settings);
}


function setupAnalytics(result) {
    const uid = new ShortUniqueId();

    let userId;
    if (result.userId) {
        userId = result.userId;
    } else {
        userId = uid.randomUUID(13);
        setConfig({ 'userId': userId });
    }

    const optOut = !!result.analyticsOptOut;
    const checkForDebugVersions = !!result.checkForConfiguratorUnstableVersions;

    const settings = {
        sessionId: uid.randomUUID(16),
        userId: userId,
        appName:  CONFIGURATOR.productName,
        appVersion: CONFIGURATOR.version,
        gitRevision: CONFIGURATOR.gitRevision,
        os: GUI.operating_system,
        checkForDebugVersions: checkForDebugVersions,
        optOut: optOut,
        buildType: GUI.Mode,
    };

    createAnalytics(settings);
    window.tracking = tracking;

    function logException(exception) {
        tracking.sendException(exception.stack);
    }

    if (typeof process === "object") {
        process.on('uncaughtException', logException);
    }

    tracking.sendEvent(tracking.EVENT_CATEGORIES.APPLICATION, 'AppStart', { sessionControl: 'start' });

    $('.connect_b a.connect').removeClass('disabled');
    $('.firmware_b a.flash').removeClass('disabled');
}

export function checkSetupAnalytics(callback) {
    if (!tracking) {
        const result = getConfig(['userId', 'analyticsOptOut', 'checkForConfiguratorUnstableVersions' ]);
        setupAnalytics(result);
    }

    if (callback) {
        callback(tracking);
    }
}

class Analytics {

    constructor (settings) {

        this.setOptOut(settings.optOut);

        this._settings = settings;
        this._api = new BuildApi();

        this.EVENT_CATEGORIES = {
            APPLICATION: 'Application',
            FLIGHT_CONTROLLER: 'FlightController',
            FLASHING: 'Flashing',
        };

        this.sendSettings();
    }

    send(name, properties) {
        if (this._optOut) {
            return;
        }

        this._api.sendAnalytics(name, {
            sessionId: this._settings.sessionId,
            userId: this._settings.userId,
            [name]: properties,
        });
    }

    sendSettings() {
        this.send('settings', this._settings);
    }

    sendEvent(category, action, options) {
        this.send('event', { category: category, action: action, options: options });
    }

    sendChangeEvents(category, changeList) {
        this.sendEvent(category, 'Change', { changes: changeList });
    }

    sendSaveAndChangeEvents(category, changeList, tabName) {
        this.sendEvent(category, 'Save', { tab: tabName, changes: changeList });
    }

    sendAppView(viewName) {
        this.send('view', viewName);
    }

    sendTiming(category, timing, value) {
        this.send('timing', { category: category, timing: timing, value: value });
    }

    sendException(message) {
        this.send('exception', message);
    }

    setOptOut(optOut) {
        this._optOut = !!optOut;
    }
}
