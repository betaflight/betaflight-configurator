'use strict';

var Analytics = function (trackingId, userId, appName, appVersion, buildType, optOut, debugMode) {
    this._trackingId = trackingId;

    this.setOptOut(optOut);

    this._analytics = analytics;

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
    };

    this.DATA = {
        BOARD_TYPE: 'boardType',
        FIRMWARE_TYPE: 'firmwareType',
        FIRMWARE_VERSION: 'firmwareVersion',
        API_VERSION: 'apiVersion',
        MCU_ID: 'mcuId',
    };

    this.DIMENSIONS = {
        BUILD_TYPE: 1,
        BOARD_TYPE: 2,
        FIRMWARE_TYPE: 3,
        FIRMWARE_VERSION: 4,
        API_VERSION: 5,
    };

    this.setDimension(this.DIMENSIONS.BUILD_TYPE, buildType);

    this.resetFlightControllerData();
};

Analytics.prototype.setDimension = function (dimension, value) {
    var dimensionName = 'dimension' + dimension;
    this._analytics.custom(dimensionName, value);
}

Analytics.prototype.sendEvent = function (category, action, options) {
    options = options || {};
    options.eventLabel = options.eventLabel || this.flightControllerData[this.DATA.MCU_ID];
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
    this.setDimension(this.DIMENSIONS.BOARD_TYPE, this.flightControllerData[this.DATA.BOARD_TYPE]);
    this.setDimension(this.DIMENSIONS.FIRMWARE_TYPE, this.flightControllerData[this.DATA.FIRMWARE_TYPE]);
    this.setDimension(this.DIMENSIONS.FIRMWARE_VERSION, this.flightControllerData[this.DATA.FIRMWARE_VERSION]);
    this.setDimension(this.DIMENSIONS.API_VERSION, this.flightControllerData[this.DATA.API_VERSION]);
}

Analytics.prototype.setFlightControllerData = function (property, value) {
    this.flightControllerData[property] = value;

    this._rebuildFlightControllerEvent();
}

Analytics.prototype.resetFlightControllerData = function () {
    this.flightControllerData = {};

    this._rebuildFlightControllerEvent();
}
