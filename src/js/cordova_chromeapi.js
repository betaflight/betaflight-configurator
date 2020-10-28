'use strict';

const chromeCallbackWithError = function(message, callback) {
    let err;
    if (typeof message === 'string') {
        err = { 'message' : message };
    } else {
        err = message;
    }
    if (typeof callback !== 'function') {
        console.error(err.message);
        return;
    }
    try {
        if (typeof chrome.runtime !== 'undefined') {
            chrome.runtime.lastError = err;
        } else {
            console.error(err.message);
        }
        callback.apply(null, Array.prototype.slice.call(arguments, 2));
    } finally {
        if (typeof chrome.runtime !== 'undefined') {
            delete chrome.runtime.lastError;
        }
    }
};
const chromeCallbackWithSuccess = function(argument, callback) {
    if (typeof callback === 'function') {
        if (typeof argument === 'undefined') {
            callback();
        } else {
            callback(argument);
        }
    }
};

const removeItemOfAnArray = async function (array, item) {
    for (let i = (array.length - 1); i >= 0; i--) {
        if (array[i] === item) {
            return array.splice(i, 1);
        }
    }
    return array;
};


const chromeapiSerial = {
    logHeader: 'SERIAL (adapted from Cordova): ',
    connection: {
        connectionId: 1, // Only one connection possible
        paused: false,
        persistent: false,
        name,
        bufferSize: 4096,
        receiveTimeout: 0,
        sendTimeout: 0,
        bitrate: 9600,
        dataBits: 'eight',
        parityBit: 'no',
        stopBits: 'one',
        ctsFlowControl: false,
    },
    setConnectionOptions: function(ConnectionOptions) {
        if (ConnectionOptions.persistent) {
            this.connection.persistent = ConnectionOptions.persistent;
        }
        if (ConnectionOptions.name) {
            this.connection.name = ConnectionOptions.name;
        }
        if (ConnectionOptions.bufferSize) {
            this.connection.bufferSize = ConnectionOptions.bufferSize;
        }
        if (ConnectionOptions.receiveTimeout) {
            this.connection.receiveTimeout = ConnectionOptions.receiveTimeout;
        }
        if (ConnectionOptions.sendTimeout) {
            this.connection.sendTimeout = ConnectionOptions.sendTimeout;
        }
        if (ConnectionOptions.bitrate) {
            this.connection.bitrate = ConnectionOptions.bitrate;
        }
        if (ConnectionOptions.dataBits) {
            this.connection.dataBits = ConnectionOptions.dataBits;
        }
        if (ConnectionOptions.parityBit) {
            this.connection.parityBit = ConnectionOptions.parityBit;
        }
        if (ConnectionOptions.stopBits) {
            this.connection.stopBits = ConnectionOptions.stopBits;
        }
        if (ConnectionOptions.ctsFlowControl) {
            this.connection.ctsFlowControl = ConnectionOptions.ctsFlowControl;
        }
    },
    getCordovaSerialConnectionOptions: function() {
        let dataBits, stopBits, parityBit;
        if (this.connection.dataBits === 'seven') {
            dataBits = 7;
        } else {
            dataBits = 8;
        }
        if (this.connection.stopBits === 'two') {
            stopBits = 2;
        } else {
            stopBits = 1;
        }
        if (this.connection.parityBit === 'odd') {
            parityBit = 0;
        } else if (this.connection.parityBit === 'even') {
            parityBit = 1;
        }
        return {
            baudRate: this.connection.bitrate,
            dataBits: dataBits,
            stopBits: stopBits,
            parity: parityBit,
            sleepOnPause: false,
        };
    },

    // Chrome serial API methods
    getDevices: async function(callback) {
        const self = this;
        cordova.plugins.usbevent.listDevices(function(list) {
            const devices = [];
            if (list.devices !== undefined) {
                let count = 0;
                list.devices.forEach(device => {
                    count++;
                    devices.push({
                        path: `${device.vendorId}/${device.productId}`,
                        vendorId: device.vendorId,
                        productId: device.productId,
                        displayName: `${device.vendorId}/${device.productId}`,
                    });
                    if (count === list.devices.length) {
                        if (callback) {
                            callback(devices);
                        }
                    }
                });
            } else {
                if (callback) {
                    callback(devices);
                }
            }
        }, function(error) {
            chromeCallbackWithError(self.logHeader+error, callback);
        });
    },
    connect: function(path, ConnectionOptions, callback) {
        const self = this;
        if (typeof ConnectionOptions !== 'undefined') {
            self.setConnectionOptions(ConnectionOptions);
        }
        const pathSplit = path.split('/');
        if (pathSplit.length === 2) {
            const vid = parseInt(pathSplit[0]);
            const pid = parseInt(pathSplit[1]);
            console.log(`${self.logHeader}request permission (vid=${vid} / pid=${pid})`);
            cordova_serial.requestPermission({vid: vid, pid: pid}, function() {
                const options = self.getCordovaSerialConnectionOptions();
                cordova_serial.open(options, function () {
                    cordova_serial.registerReadCallback(function (data) {
                        const info = {
                            connectionId: self.connection.connectionId,
                            data: data,
                        };
                        self.onReceive.receiveData(info);
                    }, function () {
                        console.warn(`${self.logHeader}failed to register read callback`);
                    });
                    chromeCallbackWithSuccess(self.connection, callback);
                }, function(error) {
                    chromeCallbackWithError(self.logHeader+error, callback);
                });
            }, function(error) {
                chromeCallbackWithError(self.logHeader+error, callback);
            });
        } else {
            chromeCallbackWithError(`${self.logHeader} invalid vendor id / product id`, callback);
        }
    },
    disconnect: function(connectionId, callback) {
        const self = this;
        cordova_serial.close(function () {
            chromeCallbackWithSuccess(true, callback);
        }, function(error) {
            chromeCallbackWithError(self.logHeader+error, callback(false));
        });
    },
    setPaused: function(connectionId, paused, callback) {
        this.connection.paused = paused; // Change connectionInfo but don't pause the connection
        chromeCallbackWithSuccess(undefined, callback);
    },
    getInfo: function(callback) {
        chromeCallbackWithSuccess(this.connection, callback);
    },
    send: function(connectionId, data, callback) {
        const string = Array.prototype.map.call(new Uint8Array(data), x => (`00${x.toString(16)}`).slice(-2)).join('');
        cordova_serial.writeHex(string, function () {
            chromeCallbackWithSuccess({
                bytesSent: string.length >> 1,
            }, callback);
        }, function(error) {
            const info = {
                bytesSent: 0,
                error: 'undefined',
            };
            chrome.serial.onReceiveError.receiveError(info);
            chromeCallbackWithError(`SERIAL (adapted from Cordova): ${error}`, callback(info));
        });
    },
    // update: function() { },
    // getConnections: function() { },
    // flush: function() { },
    // setBreak: function() { },
    // clearBreak: function() { },

    onReceive: {
        listeners: [],
        addListener: function(functionReference) {
            this.listeners.push(functionReference);
        },
        removeListener: async function(functionReference) {
            this.listeners = await removeItemOfAnArray(this.listeners, functionReference);
        },
        receiveData: function(data) {
            if (data.data.byteLength > 0) {
                for (let i = (this.listeners.length - 1); i >= 0; i--) {
                    this.listeners[i](data);
                }
            }
        },
    },
    onReceiveError: {
        listeners: [],
        addListener: function(functionReference) {
            this.listeners.push(functionReference);
        },
        removeListener: async function(functionReference) {
            this.listeners = await removeItemOfAnArray(this.listeners, functionReference);
        },
        receiveError: function(error) {
            for (let i = (this.listeners.length - 1); i >= 0; i--) {
                this.listeners[i](error);
            }
        },
    },
};


const chromeapiFilesystem = {
    logHeader: 'FILESYSTEM (adapted from Cordova): ',
    savedEntries: [],
    getFileExtension: function(fileName) {
        const re = /(?:\.([^.]+))?$/;
        return re.exec(fileName)[1];
    },

    // Chrome fileSystem API methods
    getDisplayPath: function(entry, callback) {
        chromeCallbackWithSuccess(entry.fullPath, callback);
    },
    getWritableEntry: function(entry, callback) {
        // Entry returned by chooseEntry method is writable on Android
        chromeCallbackWithSuccess(entry, callback);
    },
    isWritableEntry: function(entry, callback) {
        // Entry returned by chooseEntry method is writable on Android
        chromeCallbackWithSuccess(true, callback);
    },
    chooseEntryOpenFile: function(options, callback) {
        const self = this;
        fileChooser.open(function(uri) {
            window.resolveLocalFileSystemURL(uri, function(entry) {
                if (options.accepts && options.accepts[0].extensions && options.accepts[0].extensions && options.accepts[0].extensions.length > 0) {
                    self.getDisplayPath(entry, function(fileName) {
                        const extension = self.getFileExtension(fileName);
                        if (options.accepts[0].extensions.indexOf(extension) > -1) {
                            chromeCallbackWithSuccess(entry, callback);
                        } else {
                            navigator.notification.alert('Invalid file extension', function() {
                                chromeCallbackWithError(`${self.logHeader}file opened has an incorrect extension`, callback);
                            }, 'Choose a file', 'Ok');
                        }
                    });
                } else {
                    console.log('no extensions : any type of file accepted');
                    chromeCallbackWithSuccess(entry, callback);
                }
            }, function(error) {
                chromeCallbackWithError(self.logHeader+error, callback);
            });
        }, function(error) {
            chromeCallbackWithError(self.logHeader+error, callback);
        });
    },
    chooseEntrySaveFile: function(options, callback) {
        const self = this;
        if (!options.suggestedName) {
            options.suggestedName = 'newfile';
        }
        const extension = self.getFileExtension(options.suggestedName);
        const folder = 'Betaflight configurator';
        navigator.notification.prompt(i18n.getMessage('dialogFileNameDescription', {
            folder: folder,
        }), function(res) {
            if (res.buttonIndex === 1) {
                const newExtension = self.getFileExtension(res.input1);
                let fileName = res.input1;
                if (newExtension === undefined) {
                    fileName += `.${extension}`;
                }
                window.resolveLocalFileSystemURL(cordova.file.externalRootDirectory, function(rootEntry) {
                    rootEntry.getDirectory(folder, { create: true }, function(directoryEntry) {
                        directoryEntry.getFile(fileName, { create: false }, function(fileEntry) {
                            console.log(fileEntry);
                            navigator.notification.confirm(i18n.getMessage('dialogFileAlreadyExistsDescription'), function(resp) {
                                if (resp === 1) {
                                    chromeCallbackWithSuccess(fileEntry, callback);
                                } else {
                                    chromeCallbackWithError(`${self.logHeader}Canceled: file already exists`, callback);
                                }
                            }, i18n.getMessage('dialogFileAlreadyExistsTitle'), [i18n.getMessage('yes'), i18n.getMessage('cancel')]);
                        }, function() {
                            directoryEntry.getFile(fileName, { create: true }, function(fileEntry) {
                                chromeCallbackWithSuccess(fileEntry, callback);
                            }, function(error) {
                                chromeCallbackWithError(self.logHeader+error, callback);
                            });
                        });
                    }, function(error) {
                        chromeCallbackWithError(self.logHeader+error, callback);
                    });
                }, function(error) {
                    chromeCallbackWithError(self.logHeader+error, callback);
                });
            } else {
                chromeCallbackWithError(`${self.logHeader}Canceled: no file name`, callback);
            }
        }, i18n.getMessage('dialogFileNameTitle'), [i18n.getMessage('initialSetupButtonSave'), i18n.getMessage('cancel')], options.suggestedName);
    },
    chooseEntry: function(options, callback) {
        const self = this;
        if (typeof options === 'undefined' || typeof options.type === 'undefined') {
            self.chooseEntryOpenFile(options, callback);
        } else if (options.type === 'openDirectory') {
            // not supported yet
            console.warn('chrome.fileSystem.chooseEntry: options.type = openDirectory not supported yet');
            chromeCallbackWithSuccess(undefined, callback);
        } else if (options.type === 'openWritableFile') {
            // Entry returned by chooseEntry method is writable on Android
            self.chooseEntryOpenFile(options, callback);
        } else if (options.type === 'saveFile') {
            self.chooseEntrySaveFile(options, callback);
        } else {
            self.chooseEntryOpenFile(options, callback);
        }
    },
    restoreEntry: function(id, callback) {
        this.isRestorable(id, function(isRestorable) {
            if (isRestorable) {
                chromeCallbackWithSuccess(this.savedEntries[id], callback);
            } else {
                chromeCallbackWithError(`${self.logHeader}This entry can't be restored`, callback);
            }
        });
    },
    isRestorable: function(id, callback) {
        if (typeof this.savedEntries[id] !== 'undefined') {
            chromeCallbackWithSuccess(true, callback);
        } else {
            chromeCallbackWithSuccess(false, callback);
        }
    },
    retainEntry: function(entry) {
        const id = this.savedEntries.length;
        if (id >= 500) {
            for (let i=0 ; i<500 ; i++) {
                if (i < 499) {
                    this.savedEntries[i] = this.savedEntries[i+1];
                } else {
                    this.savedEntries[i] = entry;
                }
            }
            return 499;
        } else {
            this.savedEntries[id] = entry;
            return id;
        }
    },
    /**requestFileSystem: function(options, callback) { },
    getVolumeList: function(callback) { },*/
};


const cordovaChromeapi = {
    init: function(callback) {
        chrome.serial = chromeapiSerial;
        chrome.fileSystem = chromeapiFilesystem;
        if (callback) {
            callback();
        }
    },
};
