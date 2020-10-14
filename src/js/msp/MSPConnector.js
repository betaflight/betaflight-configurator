'use strict';

var MSPConnectorImpl = function () {
    this.baud = undefined;
    this.port = undefined;
    this.onConnectCallback = undefined;
    this.onTimeoutCallback = undefined;
    this.onDisconnectCallback = undefined;
};

MSPConnectorImpl.prototype.connect = function (port, baud, onConnectCallback, onTimeoutCallback, onFailureCallback) {

    var self = this;
    self.port = port;
    self.baud = baud;
    self.onConnectCallback = onConnectCallback;
    self.onTimeoutCallback = onTimeoutCallback;
    self.onFailureCallback = onFailureCallback;

    serial.connect(self.port, {bitrate: self.baud}, function (openInfo) {
        if (openInfo) {
            var disconnectAndCleanup = function() {
                serial.disconnect(function(result) {
                    console.log('Disconnected');
                    
                    MSP.clearListeners();
                    
                    self.onTimeoutCallback();
                });
                
                MSP.disconnect_cleanup();
            };
            
            FC.resetState();
            
            // disconnect after 10 seconds with error if we don't get IDENT data
            GUI.timeout_add('msp_connector', function () {
                if (!CONFIGURATOR.connectionValid) {
                    GUI.log(i18n.getMessage('noConfigurationReceived'));
                    
                    disconnectAndCleanup();
                }
            }, 10000);

            serial.onReceive.addListener(read_serial);
            
            mspHelper = new MspHelper();
            MSP.listen(mspHelper.process_data.bind(mspHelper));
            
            MSP.send_message(MSPCodes.MSP_API_VERSION, false, false, function () {
                CONFIGURATOR.connectionValid = true;

                GUI.timeout_remove('msp_connector');
                console.log('Connected');

                self.onConnectCallback();
            });
        } else {
            GUI.log(i18n.getMessage('serialPortOpenFail'));
            self.onFailureCallback();
        }
    });
};

MSPConnectorImpl.prototype.disconnect = function(onDisconnectCallback) {
    self.onDisconnectCallback = onDisconnectCallback;
    
    serial.disconnect(function (result) {
        MSP.clearListeners();
        console.log('Disconnected');
        
        self.onDisconnectCallback(result);
    });
    
    MSP.disconnect_cleanup();
};

