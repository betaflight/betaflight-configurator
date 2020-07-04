'use strict';

const cordovaUI = {
    uiZoom: 1,
    canChangeUI: true,
    init: async function() {
        const self = this;
        const screenWidth = $(window).width();
        const screenHeight = $(window).height();
        let length;
        let orientation;
        if (screenWidth > screenHeight) {
            length = screenWidth;
            orientation = 'landscape';
        } else {
            length = screenHeight;
            orientation = 'portrait';
        }
        if (length < 1024) {
            self.uiZoom = length/1024;
        }
        if (screenWidth > 575 && screenHeight > 575) {
            self.canChangeUI = false;
        }
        ConfigStorage.get('cordovaForceComputerUI', function (result) {
            if (result.cordovaForceComputerUI === undefined) {
                if ((orientation === 'landscape' && screenHeight <= 575)
                    || (orientation === 'portrait' && screenWidth <= 575)) {
                    ConfigStorage.set({'cordovaForceComputerUI': false});
                } else {
                    ConfigStorage.set({'cordovaForceComputerUI': true});
                }
            }
        });
        self.set();
    },
    set: function() {
        const self = this;
        ConfigStorage.get('cordovaForceComputerUI', function (result) {
            if (result.cordovaForceComputerUI) {
                window.screen.orientation.lock('landscape');
                $('body').css('zoom', self.uiZoom);
            } else {
                window.screen.orientation.lock('portrait');
                $('body').css('zoom', 1);
            }
        });
    },
};

const cordovaApp = {
    initialize: function() {
        this.bindEvents();
    },
    bindEvents: function() {
        document.addEventListener('deviceready', this.onDeviceReady, false);
    },
    onDeviceReady: function() {
        $('.open_firmware_flasher, .tab_firmware_flasher').hide();
        cordovaUI.init();
        navigator.splashscreen.hide();
        cordovaChromeapi.init();
        appReady();
    },
};

cordovaApp.initialize();
