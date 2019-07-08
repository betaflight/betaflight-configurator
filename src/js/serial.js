'use strict';

var serial = {
    connected:       false,
    connectionId:    false,
    openRequested:   false,
    openCanceled:    false,
    bitrate:         0,
    bytesReceived:   0,
    bytesSent:       0,
    failed:          0,
    connectionType:  'serial', // 'serial' or 'tcp'
    connectionIP:    '127.0.0.1',
    connectionPort:  2323,

    transmitting:   false,
    outputBuffer:  [],

    logHead: 'SERIAL: ',

    connect: function (path, options, callback) {
        var self = this;
        var testUrl = path.match(/^tcp:\/\/([A-Za-z0-9\.-]+)(?:\:(\d+))?$/)
        if (testUrl) {
            self.connectTcp(testUrl[1], testUrl[2], options, callback);
        } else {
            self.connectSerial(path, options, callback);
        }
    },
    connectSerial: function (path, options, callback) {
        var self = this;
        self.openRequested = true;
        self.connectionType = 'serial';
        self.logHead = 'SERIAL: ';

        chrome.serial.connect(path, options, function (connectionInfo) {
            if (chrome.runtime.lastError) {
                console.error(chrome.runtime.lastError.message);
            }

            if (connectionInfo && !self.openCanceled) {
                self.connected = true;
                self.connectionId = connectionInfo.connectionId;
                self.bitrate = connectionInfo.bitrate;
                self.bytesReceived = 0;
                self.bytesSent = 0;
                self.failed = 0;
                self.openRequested = false;

                self.onReceive.addListener(function log_bytesReceived(info) {
                    self.bytesReceived += info.data.byteLength;
                });

                self.onReceiveError.addListener(function watch_for_on_receive_errors(info) {
                    switch (info.error) {
                        case 'system_error': // we might be able to recover from this one
                            if (!self.failed++) {
                                chrome.serial.setPaused(self.connectionId, false, function () {
                                    self.getInfo(function (info) {
                                        if (info) {
                                            if (!info.paused) {
                                                console.log('SERIAL: Connection recovered from last onReceiveError');

                                                self.failed = 0;
                                            } else {
                                                console.log('SERIAL: Connection did not recover from last onReceiveError, disconnecting');
                                                GUI.log(i18n.getMessage('serialUnrecoverable'));

                                                if (GUI.connected_to || GUI.connecting_to) {
                                                    $('a.connect').click();
                                                } else {
                                                    self.disconnect();
                                                }
                                            }
                                        } else {
                                            if (chrome.runtime.lastError) {
                                                console.error(chrome.runtime.lastError.message);
                                            }
                                        }
                                    });
                                });
                            }
                            break;

                        case 'overrun':
                            // wait 50 ms and attempt recovery
                            self.error = info.error;
                            setTimeout(function() {
                                chrome.serial.setPaused(info.connectionId, false, function() {
                                    self.getInfo(function (info) {
                                        if (info) {
                                            if (info.paused) {
                                                // assume unrecoverable, disconnect
                                                console.log('SERIAL: Connection did not recover from ' + self.error + ' condition, disconnecting');
                                                GUI.log(i18n.getMessage('serialUnrecoverable'));
    
                                                if (GUI.connected_to || GUI.connecting_to) {
                                                    $('a.connect').click();
                                                } else {
                                                    self.disconnect();
                                                }
                                            }
                                            else {
                                                console.log('SERIAL: Connection recovered from ' + self.error + ' condition');
                                            }
                                        }
                                    });
                                });
                            }, 50);
                            break;

                        case 'timeout':
                            // No data has been received for receiveTimeout milliseconds.
                            // We will do nothing.
                            break;

                        case 'frame_error':
                        case 'parity_error':
                            GUI.log(i18n.getMessage('serialError' + inflection.camelize(info.error)));
                        case 'break': // This seems to be the error that is thrown under NW.js in Windows when the device reboots after typing 'exit' in CLI
                        case 'disconnected':
                        case 'device_lost':
                        default:
                            console.log("serial disconnecting: " + info.error);
                            CONFIG.armingDisabled = false;
                            CONFIG.runawayTakeoffPreventionDisabled = false;

                            if (GUI.connected_to || GUI.connecting_to) {
                                $('a.connect').click();
                            } else {
                                self.disconnect();
                            }
                            break;
                    }
                });

                console.log('SERIAL: Connection opened with ID: ' + connectionInfo.connectionId + ', Baud: ' + connectionInfo.bitrate);

                if (callback) callback(connectionInfo);
            } else if (connectionInfo && self.openCanceled) {
                // connection opened, but this connect sequence was canceled
                // we will disconnect without triggering any callbacks
                self.connectionId = connectionInfo.connectionId;
                console.log('SERIAL: Connection opened with ID: ' + connectionInfo.connectionId + ', but request was canceled, disconnecting');

                // some bluetooth dongles/dongle drivers really doesn't like to be closed instantly, adding a small delay
                setTimeout(function initialization() {
                    self.openRequested = false;
                    self.openCanceled = false;
                    self.disconnect(function resetUI() {
                        if (callback) callback(false);
                    });
                }, 150);
            } else if (self.openCanceled) {
                // connection didn't open and sequence was canceled, so we will do nothing
                console.log('SERIAL: Connection didn\'t open and request was canceled');
                self.openRequested = false;
                self.openCanceled = false;
                if (callback) callback(false);
            } else {
                self.openRequested = false;
                console.log('SERIAL: Failed to open serial port');
                if (callback) callback(false);
            }
        });
    },
    connectTcp: function (ip, port, options, callback) {
        var self = this;
        self.openRequested = true;
        self.connectionIP = ip;
        self.connectionPort = port || 2323;
        self.connectionPort = parseInt(self.connectionPort);
        self.connectionType = 'tcp';
        self.logHead = 'SERIAL-TCP: ';

        console.log('connect to raw tcp:', ip + ':' + port)
        chrome.sockets.tcp.create({}, function(createInfo) {
            console.log('chrome.sockets.tcp.create', createInfo)
            if (createInfo && !self.openCanceled) {
                self.connectionId = createInfo.socketId;
                self.bitrate = 115200; // fake
                self.bytesReceived = 0;
                self.bytesSent = 0;
                self.failed = 0;
                self.openRequested = false;
            }

            chrome.sockets.tcp.connect(createInfo.socketId, self.connectionIP, self.connectionPort, function (result){
                if (chrome.runtime.lastError) {
                    console.error('onConnectedCallback', chrome.runtime.lastError.message);
                }

                console.log('onConnectedCallback', result)
                if(result == 0) {
                    self.connected = true;
                    chrome.sockets.tcp.setNoDelay(createInfo.socketId, true, function (noDelayResult){
                        if (chrome.runtime.lastError) {
                            console.error('setNoDelay', chrome.runtime.lastError.message);
                        }

                        console.log('setNoDelay', noDelayResult)
                        if(noDelayResult != 0) {
                            self.openRequested = false;
                            console.log(self.logHead + 'Failed to setNoDelay');
                        }
                        self.onReceive.addListener(function log_bytesReceived(info) {
                            if (info.socketId != self.connectionId) return;
                            self.bytesReceived += info.data.byteLength;
                        });
                        self.onReceiveError.addListener(function watch_for_on_receive_errors(info) {
                            console.error(info);
                            if (info.socketId != self.connectionId) return;

                            // TODO: better error handle
                            // error code: https://cs.chromium.org/chromium/src/net/base/net_error_list.h?sq=package:chromium&l=124
                            switch (info.resultCode) {
                                case -100: // CONNECTION_CLOSED
                                case -102: // CONNECTION_REFUSED
                                    if (GUI.connected_to || GUI.connecting_to) {
                                        $('a.connect').click();
                                    } else {
                                        self.disconnect();
                                    }
                                    break;

                            }
                        });

                        console.log(self.logHead + 'Connection opened with ID: ' + createInfo.socketId + ', url: ' + self.connectionIP + ':' + self.connectionPort);
                        if (callback) callback(createInfo);
                    });
                } else {
                    self.openRequested = false;
                    console.log(self.logHead + 'Failed to connect');
                    if (callback) callback(false);
                }

            });
        });
    },
    disconnect: function (callback) {
        var self = this;
        self.connected = false;

        if (self.connectionId) {
            self.emptyOutputBuffer();

            // remove listeners
            for (var i = (self.onReceive.listeners.length - 1); i >= 0; i--) {
                self.onReceive.removeListener(self.onReceive.listeners[i]);
            }

            for (var i = (self.onReceiveError.listeners.length - 1); i >= 0; i--) {
                self.onReceiveError.removeListener(self.onReceiveError.listeners[i]);
            }

            var disconnectFn = (self.connectionType == 'serial') ? chrome.serial.disconnect : chrome.sockets.tcp.close;
            disconnectFn(this.connectionId, function (result) {
                if (chrome.runtime.lastError) {
                    console.error(chrome.runtime.lastError.message);
                }

                result = result || self.connectionType == 'tcp'
                if (result) {
                    console.log(self.logHead + 'Connection with ID: ' + self.connectionId + ' closed, Sent: ' + self.bytesSent + ' bytes, Received: ' + self.bytesReceived + ' bytes');
                } else {
                    console.log(self.logHead + 'Failed to close connection with ID: ' + self.connectionId + ' closed, Sent: ' + self.bytesSent + ' bytes, Received: ' + self.bytesReceived + ' bytes');
                }

                self.connectionId = false;
                self.bitrate = 0;

                if (callback) callback(result);
            });
        } else {
            // connection wasn't opened, so we won't try to close anything
            // instead we will rise canceled flag which will prevent connect from continueing further after being canceled
            self.openCanceled = true;
        }
    },
    getDevices: function (callback) {
        chrome.serial.getDevices(function (devices_array) {
            var devices = [];
            devices_array.forEach(function (device) {
                devices.push(device.path);
            });

            callback(devices);
        });
    },
    getInfo: function (callback) {
        var chromeType = (this.connectionType == 'serial') ? chrome.serial : chrome.sockets.tcp;
        chromeType.getInfo(this.connectionId, callback);
    },
    getControlSignals: function (callback) {
        if (this.connectionType == 'serial') chrome.serial.getControlSignals(this.connectionId, callback);
    },
    setControlSignals: function (signals, callback) {
        if (this.connectionType == 'serial') chrome.serial.setControlSignals(this.connectionId, signals, callback);
    },
    send: function (data, callback) {
        var self = this;
        this.outputBuffer.push({'data': data, 'callback': callback});

        function send() {
            // store inside separate variables in case array gets destroyed
            var data = self.outputBuffer[0].data,
                callback = self.outputBuffer[0].callback;

            if (!self.connected) {
                console.log('attempting to send when disconnected');
                if (callback) callback({
                    bytesSent: 0,
                    error: 'undefined'
               });
               return;
            }

            var sendFn = (self.connectionType == 'serial') ? chrome.serial.send : chrome.sockets.tcp.send;
            sendFn(self.connectionId, data, function (sendInfo) {
                if (sendInfo === undefined) {
                    console.log('undefined send error');
                    if (callback) callback({
                        bytesSent: 0,
                        error: 'undefined'
                   });
                   return;
                }

                // tcp send error
                if (self.connectionType == 'tcp' && sendInfo.resultCode < 0) {
                    var error = 'system_error';

                    // TODO: better error handle
                    // error code: https://cs.chromium.org/chromium/src/net/base/net_error_list.h?sq=package:chromium&l=124
                    switch (sendInfo.resultCode) {
                        case -100: // CONNECTION_CLOSED
                        case -102: // CONNECTION_REFUSED
                            error = 'disconnected';
                            break;

                    }
                    if (callback) callback({
                         bytesSent: 0,
                         error: error
                    });
                    return;
                }

                // track sent bytes for statistics
                self.bytesSent += sendInfo.bytesSent;

                // fire callback
                if (callback) callback(sendInfo);

                // remove data for current transmission form the buffer
                self.outputBuffer.shift();

                // if there is any data in the queue fire send immediately, otherwise stop trasmitting
                if (self.outputBuffer.length) {
                    // keep the buffer withing reasonable limits
                    if (self.outputBuffer.length > 100) {
                        var counter = 0;

                        while (self.outputBuffer.length > 100) {
                            self.outputBuffer.pop();
                            counter++;
                        }

                        console.log(self.logHead + 'Send buffer overflowing, dropped: ' + counter + ' entries');
                    }

                    send();
                } else {
                    self.transmitting = false;
                }
            });
        }

        if (!this.transmitting) {
            this.transmitting = true;
            send();
        }
    },
    onReceive: {
        listeners: [],

        addListener: function (function_reference) {
            var chromeType = (serial.connectionType == 'serial') ? chrome.serial : chrome.sockets.tcp;
            chromeType.onReceive.addListener(function_reference);
            this.listeners.push(function_reference);
        },
        removeListener: function (function_reference) {
            var chromeType = (serial.connectionType == 'serial') ? chrome.serial : chrome.sockets.tcp;
            for (var i = (this.listeners.length - 1); i >= 0; i--) {
                if (this.listeners[i] == function_reference) {
                    chromeType.onReceive.removeListener(function_reference);

                    this.listeners.splice(i, 1);
                    break;
                }
            }
        }
    },
    onReceiveError: {
        listeners: [],

        addListener: function (function_reference) {
            var chromeType = (serial.connectionType == 'serial') ? chrome.serial : chrome.sockets.tcp;
            chromeType.onReceiveError.addListener(function_reference);
            this.listeners.push(function_reference);
        },
        removeListener: function (function_reference) {
            var chromeType = (serial.connectionType == 'serial') ? chrome.serial : chrome.sockets.tcp;
            for (var i = (this.listeners.length - 1); i >= 0; i--) {
                if (this.listeners[i] == function_reference) {
                    chromeType.onReceiveError.removeListener(function_reference);

                    this.listeners.splice(i, 1);
                    break;
                }
            }
        }
    },
    emptyOutputBuffer: function () {
        this.outputBuffer = [];
        this.transmitting = false;
    }
};
