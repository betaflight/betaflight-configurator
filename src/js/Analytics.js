'use strict';

var Analytics = function (trackingId, userId, appName, appVersion, buildType, optOut, debugMode) {
    this._trackingId = trackingId;

    this.setOptOut(optOut);

    this._googleAnalytics = googleAnalytics;

    this._googleAnalytics.initialize(this._trackingId, {
        storage: 'none',
        clientId: userId,
        debug: !!debugMode
    });

    // Make it work for the Chrome App:
    this._googleAnalytics.set('forceSSL', true);
    this._googleAnalytics.set('transport', 'xhr');

    // Make it work for NW.js:
    this._googleAnalytics.set('checkProtocolTask', null);

    this._googleAnalytics.set('appName', appName);
    this._googleAnalytics.set('appVersion', debugMode ? appVersion + '-debug' : appVersion);

    this.EVENT_CATEGORIES = {
        APPLICATION: 'Application',
        FLIGHT_CONTROLLER: 'FlightController',
        FIRMWARE: 'Firmware',
    };

    this.DATA = {
        BOARD_TYPE: 'boardType',
        FIRMWARE_TYPE: 'firmwareType',
        FIRMWARE_VERSION: 'firmwareVersion',
        API_VERSION: 'apiVersion',
        MCU_ID: 'mcuId',
        FIRMWARE_NAME: 'firmwareName',
        FIRMWARE_CHECKSUM: 'firmwareChecksum',
        FIRMWARE_SOURCE: 'firmwareSource',
        FIRMWARE_CHANNEL: 'firmwareChannel',
        FIRMWARE_ERASE_ALL: 'firmwareEraseAll',
    };

    this.DIMENSIONS = {
        CONFIGURATOR_BUILD_TYPE: 1,
        BOARD_TYPE: 2,
        FIRMWARE_TYPE: 3,
        FIRMWARE_VERSION: 4,
        API_VERSION: 5,
        FIRMWARE_NAME: 6,
        FIRMWARE_SOURCE: 7,
        FIRMWARE_ERASE_ALL: 8,
        CONFIGURATOR_EXPERT_MODE: 9,
        FIRMWARE_CHANNEL: 10,
    };

    this.setDimension(this.DIMENSIONS.CONFIGURATOR_BUILD_TYPE, buildType);

    this.resetFlightControllerData();
    this.resetFirmwareData();
};

Analytics.prototype.setDimension = function (dimension, value) {
    var dimensionName = 'dimension' + dimension;
    this._googleAnalytics.custom(dimensionName, value);
}

Analytics.prototype.sendEvent = function (category, action, options) {
    this._googleAnalytics.event(category, action, options);
}

Analytics.prototype.sendChangeEvents = function (category, changeList) {
    for (var actionName in changeList) {
        if (changeList.hasOwnProperty(actionName)) {
            var actionValue = changeList[actionName];
            if (actionValue !== undefined) {
                this.sendEvent(category, actionName, { eventLabel: actionValue });
            }
        }
    }
}

Analytics.prototype.sendAppView = function (viewName) {
    this._googleAnalytics.screenview(viewName);
}

Analytics.prototype.sendTiming = function (category, timing, value) {
    this._googleAnalytics.timing(category, timing, value);
}

Analytics.prototype.sendException = function (message) {
    this._googleAnalytics.exception(message);
}

Analytics.prototype.setOptOut = function (optOut) {
    window['ga-disable-' + this._trackingId] = !!optOut;
}

Analytics.prototype._rebuildFlightControllerEvent = function () {
    this.setDimension(this.DIMENSIONS.BOARD_TYPE, this._flightControllerData[this.DATA.BOARD_TYPE]);
    this.setDimension(this.DIMENSIONS.FIRMWARE_TYPE, this._flightControllerData[this.DATA.FIRMWARE_TYPE]);
    this.setDimension(this.DIMENSIONS.FIRMWARE_VERSION, this._flightControllerData[this.DATA.FIRMWARE_VERSION]);
    this.setDimension(this.DIMENSIONS.API_VERSION, this._flightControllerData[this.DATA.API_VERSION]);
    this._googleAnalytics.set('eventLabel', this._flightControllerData[this.DATA.MCU_ID]);
}

Analytics.prototype.setFlightControllerData = function (property, value) {
    this._flightControllerData[property] = value;

    this._rebuildFlightControllerEvent();
}

Analytics.prototype.resetFlightControllerData = function () {
    this._flightControllerData = {};

    this._rebuildFlightControllerEvent();
}

Analytics.prototype._rebuildFirmwareEvent = function () {
    this.setDimension(this.DIMENSIONS.FIRMWARE_NAME, this._firmwareData[this.DATA.FIRMWARE_NAME]);
    this.setDimension(this.DIMENSIONS.FIRMWARE_SOURCE, this._firmwareData[this.DATA.FIRMWARE_SOURCE]);
    this.setDimension(this.DIMENSIONS.FIRMWARE_ERASE_ALL, this._firmwareData[this.DATA.FIRMWARE_ERASE_ALL]);
    this.setDimension(this.DIMENSIONS.FIRMWARE_CHANNEL, this._firmwareData[this.DATA.FIRMWARE_CHANNEL]);
    this._googleAnalytics.set('eventLabel', this._firmwareData[this.DATA.FIRMWARE_CHECKSUM]);
}

Analytics.prototype.setFirmwareData = function (property, value) {
    this._firmwareData[property] = value;

    this._rebuildFirmwareEvent();
}

Analytics.prototype.resetFirmwareData = function () {
    this._firmwareData = {};

    this._rebuildFirmwareEvent();
}
