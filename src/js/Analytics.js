'use strict';

var Analytics = function (trackingId, userId, appName, appVersion, buildType, optOut, debugMode) {
    this._trackingId = trackingId;

    this.setOptOut(optOut);

    this._analytics = googleAnalytics;

    this._analytics.initialize(this._trackingId, {
        storage: 'none',
        clientId: userId,
        debug: !!debugMode
    });

    // Make it work for the Chrome App:
    this._analytics.set('forceSSL', true);
    this._analytics.set('transport', 'xhr');

    // Make it work for NW.js:
    this._analytics.set('checkProtocolTask', null);

    this._analytics.set('appName', appName);
    this._analytics.set('appVersion', debugMode ? appVersion + '-debug' : appVersion);

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
        FIRMWARE_CHANNEL: 7,
        FIRMWARE_ERASE_ALL: 8,
        CONFIGURATOR_EXPERT_MODE: 9,
    };

    this.setDimension(this.DIMENSIONS.CONFIGURATOR_BUILD_TYPE, buildType);

    this.resetFlightControllerData();
    this.resetFirmwareData();
};

Analytics.prototype.setDimension = function (dimension, value) {
    var dimensionName = 'dimension' + dimension;
    this._analytics.custom(dimensionName, value);
}

Analytics.prototype.sendEvent = function (category, action, options) {
//    options.eventLabel = options.eventLabel || this._flightControllerData[this.DATA.MCU_ID];
    this._analytics.event(category, action, options);
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
    this._analytics.screenview(viewName);
}

Analytics.prototype.sendTiming = function (category, timing, value) {
    this._analytics.timing(category, timing, value);
}

Analytics.prototype.sendException = function (message) {
    this._analytics.exception(message);
}

Analytics.prototype.setOptOut = function (optOut) {
    window['ga-disable-' + this._trackingId] = !!optOut;
}

Analytics.prototype._rebuildFlightControllerEvent = function () {
    this.setDimension(this.DIMENSIONS.BOARD_TYPE, this._flightControllerData[this.DATA.BOARD_TYPE]);
    this.setDimension(this.DIMENSIONS.FIRMWARE_TYPE, this._flightControllerData[this.DATA.FIRMWARE_TYPE]);
    this.setDimension(this.DIMENSIONS.FIRMWARE_VERSION, this._flightControllerData[this.DATA.FIRMWARE_VERSION]);
    this.setDimension(this.DIMENSIONS.API_VERSION, this._flightControllerData[this.DATA.API_VERSION]);
    this._analytics.set('eventLabel', this._flightControllerData[this.DATA.MCU_ID]);
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
    this.setDimension(this.DIMENSIONS.FIRMWARE_CHANNEL, this._firmwareData[this.DATA.FIRMWARE_CHANNEL]);
    this.setDimension(this.DIMENSIONS.FIRMWARE_ERASE_ALL, this._firmwareData[this.DATA.FIRMWARE_ERASE_ALL]);
    this._analytics.set('eventLabel', this._firmwareData[this.DATA.FIRMWARE_CHECKSUM]);
}

Analytics.prototype.setFirmwareData = function (property, value) {
    this._firmwareData[property] = value;

    this._rebuildFirmwareEvent();
}

Analytics.prototype.resetFirmwareData = function () {
    this._firmwareData = {};

    this._rebuildFirmwareEvent();
}
