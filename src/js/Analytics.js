'use strict';

var Analytics = function (serviceName, trackingId, operatingSystem) {
    this.eventBuilder = analytics.EventBuilder;
    this.service = analytics.getService(serviceName);
    this.tracker = this.service.getTracker(trackingId);

    this.DATA = {
        BOARD_TYPE: 'boardType',
        FIRMWARE_TYPE: 'firmwareType',
        FIRMWARE_VERSION: 'firmwareVersion',
        API_VERSION: 'apiVersion',
        MCU_ID: 'mcuId',
    };

    this.DIMENSIONS = {
        OS: 1,
        BOARD_TYPE: 2,
        FIRMWARE_TYPE: 3,
        FIRMWARE_VERSION: 4,
        API_VERSION: 5,
    };

    this.APPLICATION_EVENT = this.eventBuilder.builder()
    .category('Application')
    .dimension(this.DIMENSIONS.OS, operatingSystem);

    this.resetFlightControllerData();
};

Analytics.prototype.setTrackingPermitted = function (permitted) {
    this.service.getConfig().addCallback(function(config) {
        config.setTrackingPermitted(permitted);
    });
}

Analytics.prototype.send = function (event) {
    this.tracker.send(event);
}

Analytics.prototype.sendAppView = function (viewName) {
    this.tracker.sendAppView(viewName);
}

Analytics.prototype.rebuildFlightControllerEvent = function () {
    this.FLIGHT_CONTROLLER_EVENT = this.eventBuilder.builder()
    .category('FlightController')
    .dimension(this.DIMENSIONS.BOARD_TYPE, this.flightControllerData[this.DATA.BOARD_TYPE])
    .dimension(this.DIMENSIONS.FIRMWARE_TYPE, this.flightControllerData[this.DATA.FIRMWARE_TYPE])
    .dimension(this.DIMENSIONS.FIRMWARE_VERSION, this.flightControllerData[this.DATA.FIRMWARE_VERSION])
    .dimension(this.DIMENSIONS.API_VERSION, this.flightControllerData[this.DATA.API_VERSION]);
}

Analytics.prototype.setFlightControllerData = function (property, value) {
    this.flightControllerData[property] = value;

    this.rebuildFlightControllerEvent();
}

Analytics.prototype.resetFlightControllerData = function () {
    this.flightControllerData = {};

    this.rebuildFlightControllerEvent();
}
