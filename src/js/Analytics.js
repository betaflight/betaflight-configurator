import ShortUniqueId from 'short-unique-id';
import googleAnalytics from 'universal-ga';
import { set as setConfig, get as getConfig } from './ConfigStorage';
import GUI from './gui';
import CONFIGURATOR from './data_storage';
import $ from 'jquery';

let tracking = null;
export { tracking };

export function createAnalytics(ga, settings) {
    tracking = new Analytics(ga, settings);
}

function getBuildType() {
    return GUI.Mode;
}

function setupAnalytics(result) {
    let userId;
    if (result.userId) {
        userId = result.userId;
    } else {
        const uid = new ShortUniqueId();
        userId = uid.randomUUID(13);

        setConfig({ 'userId': userId });
    }

    const optOut = !!result.analyticsOptOut;
    const checkForDebugVersions = !!result.checkForConfiguratorUnstableVersions;

    const debugMode = typeof process === "object" && process.versions['nw-flavor'] === 'sdk';

    const settings = {
        trackingId: 'UA-123002063-1',
        userId: userId,
        appName:  CONFIGURATOR.productName,
        appVersion: CONFIGURATOR.version,
        gitRevision: CONFIGURATOR.gitRevision,
        os: GUI.operating_system,
        checkForDebugVersions: checkForDebugVersions,
        optOut: optOut,
        // debugMode: debugMode,         // enable when debugging GA
        buildType: getBuildType(),
    };
    createAnalytics(googleAnalytics, settings);
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

    constructor (ga, settings) {
        // trackingId, userId, appName, appVersion, gitRevision, os, checkForDebugVersions, optOut, debugMode, buildType
        this._trackingId = settings.trackingId;

        this.setOptOut(settings.optOut);

        this._googleAnalytics = ga;

        this._googleAnalytics.initialize(this._trackingId, {
            storage: 'none',
            clientId: settings.userId,
            debug: !!settings.debugMode,
        });

        // Make it work for the Chrome App:
        this._googleAnalytics.set('forceSSL', true);
        this._googleAnalytics.set('transport', 'xhr');

        // Make it work for NW.js:
        this._googleAnalytics.set('checkProtocolTask', null);

        this._googleAnalytics.set('appName', settings.appName);
        this._googleAnalytics.set('appVersion', settings.debugMode ? `${settings.appVersion}-debug` : settings.appVersion);

        this.EVENT_CATEGORIES = {
            APPLICATION: 'Application',
            FLIGHT_CONTROLLER: 'FlightController',
            FLASHING: 'Flashing',
        };

        this.DATA = {
            BOARD_TYPE: 'boardType',
            API_VERSION: 'apiVersion',
            FIRMWARE_TYPE: 'firmwareType',
            FIRMWARE_VERSION: 'firmwareVersion',
            FIRMWARE_NAME: 'firmwareName',
            FIRMWARE_SOURCE: 'firmwareSource',
            FIRMWARE_CHANNEL: 'firmwareChannel',
            FIRMWARE_ERASE_ALL: 'firmwareEraseAll',
            FIRMWARE_SIZE: 'firmwareSize',
            MCU_ID: 'mcuId',
            LOGGING_STATUS: 'loggingStatus',
            LOG_SIZE: 'logSize',
            TARGET_NAME: 'targetName',
            BOARD_NAME: 'boardName',
            MANUFACTURER_ID: 'manufacturerId',
            MCU_TYPE: 'mcuType',
        };

        this.DIMENSIONS = {
            CONFIGURATOR_OS: 1,
            BOARD_TYPE: 2,
            FIRMWARE_TYPE: 3,
            FIRMWARE_VERSION: 4,
            API_VERSION: 5,
            FIRMWARE_NAME: 6,
            FIRMWARE_SOURCE: 7,
            FIRMWARE_ERASE_ALL: 8,
            CONFIGURATOR_EXPERT_MODE: 9,
            FIRMWARE_CHANNEL: 10,
            LOGGING_STATUS: 11,
            MCU_ID: 12,
            CONFIGURATOR_CHANGESET_ID: 13,
            CONFIGURATOR_USE_DEBUG_VERSIONS: 14,
            TARGET_NAME: 15,
            BOARD_NAME: 16,
            MANUFACTURER_ID: 17,
            MCU_TYPE: 18,
            CONFIGURATOR_BUILD_TYPE: 19,
        };

        this.METRICS = {
            FIRMWARE_SIZE: 1,
            LOG_SIZE: 2,
        };

        this.setDimension(this.DIMENSIONS.CONFIGURATOR_OS, settings.os);
        this.setDimension(this.DIMENSIONS.CONFIGURATOR_CHANGESET_ID, settings.gitRevision);
        this.setDimension(this.DIMENSIONS.CONFIGURATOR_USE_DEBUG_VERSIONS, settings.checkForDebugVersions);
        this.setDimension(this.DIMENSIONS.CONFIGURATOR_BUILD_TYPE, settings.buildType);

        this.resetFlightControllerData();
        this.resetFirmwareData();
    }

    setDimension(dimension, value) {
        const dimensionName = `dimension${dimension}`;
        this._googleAnalytics.custom(dimensionName, value);
    }

    setMetric(metric, value) {
        const metricName = `metric${metric}`;
        this._googleAnalytics.custom(metricName, value);
    }

    sendEvent(category, action, options) {
        this._googleAnalytics.event(category, action, options);
    }

    sendChangeEvents(category, changeList) {
        for (const actionName in changeList) {
            if (changeList.hasOwnProperty(actionName)) {
                const actionValue = changeList[actionName];
                if (actionValue !== undefined) {
                    this.sendEvent(category, actionName, { eventLabel: actionValue });
                }
            }
        }
    }

    sendSaveAndChangeEvents(category, changeList, tabName) {
        this.sendEvent(category, 'Save', {
            eventLabel: tabName,
            eventValue: Object.keys(changeList).length,
        });
        this.sendChangeEvents(category, changeList);
    }

    sendAppView(viewName) {
        this._googleAnalytics.screenview(viewName);
    }

    sendTiming(category, timing, value) {
        this._googleAnalytics.timing(category, timing, value);
    }

    sendException(message) {
        this._googleAnalytics.exception(message);
    }

    setOptOut(optOut) {
        window[`ga-disable-${this._trackingId}`] = !!optOut;
    }

    _rebuildFlightControllerEvent() {
        this.setDimension(this.DIMENSIONS.BOARD_TYPE, this._flightControllerData[this.DATA.BOARD_TYPE]);
        this.setDimension(this.DIMENSIONS.FIRMWARE_TYPE, this._flightControllerData[this.DATA.FIRMWARE_TYPE]);
        this.setDimension(this.DIMENSIONS.FIRMWARE_VERSION, this._flightControllerData[this.DATA.FIRMWARE_VERSION]);
        this.setDimension(this.DIMENSIONS.API_VERSION, this._flightControllerData[this.DATA.API_VERSION]);
        this.setDimension(this.DIMENSIONS.LOGGING_STATUS, this._flightControllerData[this.DATA.LOGGING_STATUS]);
        this.setDimension(this.DIMENSIONS.MCU_ID, this._flightControllerData[this.DATA.MCU_ID]);
        this.setMetric(this.METRICS.LOG_SIZE, this._flightControllerData[this.DATA.LOG_SIZE]);
        this.setDimension(this.DIMENSIONS.TARGET_NAME, this._flightControllerData[this.DATA.TARGET_NAME]);
        this.setDimension(this.DIMENSIONS.BOARD_NAME, this._flightControllerData[this.DATA.BOARD_NAME]);
        this.setDimension(this.DIMENSIONS.MANUFACTURER_ID, this._flightControllerData[this.DATA.MANUFACTURER_ID]);
        this.setDimension(this.DIMENSIONS.MCU_TYPE, this._flightControllerData[this.DATA.MCU_TYPE]);
    }

    setFlightControllerData(property, value) {
        this._flightControllerData[property] = value;
        this._rebuildFlightControllerEvent();
    }

    resetFlightControllerData() {
        this._flightControllerData = {};
        this._rebuildFlightControllerEvent();
    }

    _rebuildFirmwareEvent() {
        this.setDimension(this.DIMENSIONS.FIRMWARE_NAME, this._firmwareData[this.DATA.FIRMWARE_NAME]);
        this.setDimension(this.DIMENSIONS.FIRMWARE_SOURCE, this._firmwareData[this.DATA.FIRMWARE_SOURCE]);
        this.setDimension(this.DIMENSIONS.FIRMWARE_ERASE_ALL, this._firmwareData[this.DATA.FIRMWARE_ERASE_ALL]);
        this.setDimension(this.DIMENSIONS.FIRMWARE_CHANNEL, this._firmwareData[this.DATA.FIRMWARE_CHANNEL]);
        this.setMetric(this.METRICS.FIRMWARE_SIZE, this._firmwareData[this.DATA.FIRMWARE_SIZE]);
    }

    setFirmwareData(property, value) {
        this._firmwareData[property] = value;
        this._rebuildFirmwareEvent();
    }

    resetFirmwareData() {
        this._firmwareData = {};
        this._rebuildFirmwareEvent();
    }
}
