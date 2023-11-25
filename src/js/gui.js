import { get as getConfig } from './ConfigStorage';
import MSP from './msp';
import Switchery from 'switchery-latest';
import jBox from 'jbox';
import { checkChromeRuntimeError } from './utils/common';
import $ from 'jquery';

const TABS = {};

const GUI_MODES = {
    NWJS: "NW.js",
    Cordova: "Cordova",
    Other: "Other",
};

class GuiControl {
    constructor() {
        this.auto_connect = false;
        this.connecting_to = false;
        this.connected_to = false;
        this.connect_lock = false;
        this.active_tab = null;
        this.tab_switch_in_progress = false;
        this.operating_system = null;
        this.interval_array = [];
        this.timeout_array = [];
        this.buttonDisabledClass = "disabled";

        this.defaultAllowedTabsWhenDisconnected = [
            'landing',
            'changelog',
            'firmware_flasher',
            'privacy_policy',
            'options',
            'help',
        ];

        this.defaultAllowedTabs = [
            'setup',
            'failsafe',
            'power',
            'adjustments',
            'auxiliary',
            'presets',
            'cli',
            'configuration',
            'logging',
            'onboard_logging',
            'modes',
            'motors',
            'pid_tuning',
            'ports',
            'receiver',
            'sensors',
            'vtx',
        ];

        this.defaultCloudBuildTabOptions = [
            'gps',
            'led_strip',
            'osd',
            'servos',
            'transponder',
        ];

        this.defaultAllowedFCTabsWhenConnected = [ ...this.defaultAllowedTabs, ...this.defaultCloudBuildTabOptions];

        this.allowedTabs = this.defaultAllowedTabsWhenDisconnected;

        // check which operating system is user running
        this.operating_system = GUI_checkOperatingSystem();

        // Check the method of execution
        this.nwGui = null;
        try {
            this.nwGui = require('nw.gui');
            this.Mode = GUI_MODES.NWJS;
        } catch (ex) {
            if (typeof cordovaApp !== 'undefined') {
                this.Mode = GUI_MODES.Cordova;
            } else {
                this.Mode = GUI_MODES.Other;
            }
        }
    }
    // Timer managing methods
    // name = string
    // code = function reference (code to be executed)
    // interval = time interval in miliseconds
    // first = true/false if code should be ran initially before next timer interval hits
    interval_add(name, code, interval, first) {
        const data = { 'name': name, 'timer': null, 'code': code, 'interval': interval, 'fired': 0, 'paused': false };

        if (first === true) {
            code(); // execute code

            data.fired++; // increment counter
        }

        data.timer = setInterval(function () {
            code(); // execute code

            data.fired++; // increment counter
        }, interval);

        this.interval_array.push(data); // push to primary interval array

        return data;
    }
    // name = string
    // code = function reference (code to be executed)
    // interval = time interval in miliseconds
    // first = true/false if code should be ran initially before next timer interval hits
    // condition = function reference with true/false result, a condition to be checked before every interval code execution
    interval_add_condition(name, code, interval, first, condition) {
        this.interval_add(name, () => {
            if (condition()) {
                code();
            } else {
                this.interval_remove(name);
            }
        }, interval, first);
    }
    // name = string
    interval_remove(name) {
        for (let i = 0; i < this.interval_array.length; i++) {
            if (this.interval_array[i].name === name) {
                clearInterval(this.interval_array[i].timer); // stop timer

                this.interval_array.splice(i, 1); // remove element/object from array

                return true;
            }
        }

        return false;
    }
    // name = string
    interval_pause(name) {
        for (let i = 0; i < this.interval_array.length; i++) {
            if (this.interval_array[i].name === name) {
                clearInterval(this.interval_array[i].timer);
                this.interval_array[i].paused = true;

                return true;
            }
        }

        return false;
    }
    // name = string
    interval_resume(name) {

        function executeCode(obj) {
            obj.code(); // execute code
            obj.fired++; // increment counter
        }

        for (let i = 0; i < this.interval_array.length; i++) {
            if (this.interval_array[i].name === name && this.interval_array[i].paused) {
                const obj = this.interval_array[i];

                obj.timer = setInterval(executeCode, obj.interval, obj);

                obj.paused = false;

                return true;
            }
        }

        return false;
    }
    // input = array of timers thats meant to be kept, or nothing
    // return = returns timers killed in last call
    interval_kill_all(keepArray) {
        const self = this;
        let timersKilled = 0;

        for (let i = (this.interval_array.length - 1); i >= 0; i--) { // reverse iteration
            let keep = false;
            if (keepArray) { // only run through the array if it exists
                keepArray.forEach(function (name) {
                    if (self.interval_array[i].name === name) {
                        keep = true;
                    }
                });
            }

            if (!keep) {
                clearInterval(this.interval_array[i].timer); // stop timer

                this.interval_array.splice(i, 1); // remove element/object from array

                timersKilled++;
            }
        }

        return timersKilled;
    }
    // name = string
    // code = function reference (code to be executed)
    // timeout = timeout in miliseconds
    timeout_add(name, code, timeout) {
        const self = this;
        const data = {
            'name': name,
            'timer': null,
            'timeout': timeout,
        };

        // start timer with "cleaning" callback
        data.timer = setTimeout(function () {
            code(); // execute code


            // remove object from array
            const index = self.timeout_array.indexOf(data);
            if (index > -1) {
                self.timeout_array.splice(index, 1);
            }
        }, timeout);

        self.timeout_array.push(data); // push to primary timeout array

        return data;
    }
    // name = string
    timeout_remove(name) {
        for (let i = 0; i < this.timeout_array.length; i++) {
            if (this.timeout_array[i].name === name) {
                clearTimeout(this.timeout_array[i].timer); // stop timer

                this.timeout_array.splice(i, 1); // remove element/object from array

                return true;
            }
        }

        return false;
    }
    // no input parameters
    // return = returns timers killed in last call
    timeout_kill_all() {
        let timersKilled = 0;

        for (let i = 0; i < this.timeout_array.length; i++) {
            clearTimeout(this.timeout_array[i].timer); // stop timer

            timersKilled++;
        }

        this.timeout_array = []; // drop objects

        return timersKilled;
    }

    // Method is called every time a valid tab change event is received
    // callback = code to run when cleanup is finished
    // default switch doesn't require callback to be set
    tab_switch_cleanup(callback) {
        MSP.callbacks_cleanup(); // we don't care about any old data that might or might not arrive
        this.interval_kill_all(); // all intervals (mostly data pulling) needs to be removed on tab switch

        if (this.active_tab && TABS[this.active_tab]) {
            TABS[this.active_tab].cleanup(callback);
        } else {
            callback();
        }
    }
    switchery() {

        const COLOR_ACCENT = 'var(--accent)';
        const COLOR_SWITCHERY_SECOND = 'var(--switcherysecond)';

        $('.togglesmall').each(function (index, elem) {
            const switchery = new Switchery(elem, {
                size: 'small',
                color: COLOR_ACCENT,
                secondaryColor: COLOR_SWITCHERY_SECOND,
            });
            $(elem).on("change", function () {
                switchery.setPosition();
            });
            $(elem).removeClass('togglesmall');
        });

        $('.toggle').each(function (index, elem) {
            const switchery = new Switchery(elem, {
                color: COLOR_ACCENT,
                secondaryColor: COLOR_SWITCHERY_SECOND,
            });
            $(elem).on("change", function () {
                switchery.setPosition();
            });
            $(elem).removeClass('toggle');
        });

        $('.togglemedium').each(function (index, elem) {
            const switchery = new Switchery(elem, {
                className: 'switcherymid',
                color: COLOR_ACCENT,
                secondaryColor: COLOR_SWITCHERY_SECOND,
            });
            $(elem).on("change", function () {
                switchery.setPosition();
            });
            $(elem).removeClass('togglemedium');
        });
    }
    content_ready(callback) {

        this.switchery();

        const documentationButton = $('div#content #button-documentation');
        const tRex = GUI.active_tab.replaceAll('_', '-').toLowerCase();

        documentationButton.html("Wiki").attr("href", `https://betaflight.com/docs/wiki/configurator/${tRex}-tab`);

        // loading tooltip
        $(function () {

            new jBox('Tooltip', {
                attach: '.cf_tip',
                trigger: 'mouseenter',
                closeOnMouseleave: true,
                closeOnClick: 'body',
                delayOpen: 100,
                delayClose: 100,
                position: {
                    x: 'right',
                    y: 'center',
                },
                outside: 'x',
            });

            new jBox('Tooltip', {
                theme: 'Widetip',
                attach: '.cf_tip_wide',
                trigger: 'mouseenter',
                closeOnMouseleave: true,
                closeOnClick: 'body',
                delayOpen: 100,
                delayClose: 100,
                position: {
                    x: 'right',
                    y: 'center',
                },
                outside: 'x',
            });
        });

        if (callback) {
            callback();
        }
    }
    selectDefaultTabWhenConnected() {
        const result = getConfig(['rememberLastTab', 'lastTab']);
        const tab = result.rememberLastTab && result.lastTab && this.allowedTabs.includes(result.lastTab.substring(4)) ? result.lastTab : 'tab_setup';

        $(`#tabs ul.mode-connected .${tab} a`).trigger('click');
    }
    isNWJS() {
        return this.Mode === GUI_MODES.NWJS;
    }
    isCordova() {
        return this.Mode === GUI_MODES.Cordova;
    }
    isOther() {
        return this.Mode === GUI_MODES.Other;
    }
    showYesNoDialog(yesNoDialogSettings) {
        // yesNoDialogSettings:
        // title, text, buttonYesText, buttonNoText, buttonYesCallback, buttonNoCallback
        const dialog = $(".dialogYesNo");
        const title = dialog.find(".dialogYesNoTitle");
        const content = dialog.find(".dialogYesNoContent");
        const buttonYes = dialog.find(".dialogYesNo-yesButton");
        const buttonNo = dialog.find(".dialogYesNo-noButton");

        title.html(yesNoDialogSettings.title);
        content.html(yesNoDialogSettings.text);
        buttonYes.html(yesNoDialogSettings.buttonYesText);
        buttonNo.html(yesNoDialogSettings.buttonNoText);

        buttonYes.off("click");
        buttonNo.off("click");

        buttonYes.on("click", () => {
            dialog[0].close();
            yesNoDialogSettings.buttonYesCallback?.();
        });

        buttonNo.on("click", () => {
            dialog[0].close();
            yesNoDialogSettings.buttonNoCallback?.();
        });

        dialog[0].showModal();
    }
    showWaitDialog(waitDialogSettings) {
        // waitDialogSettings:
        // title, buttonCancelCallback
        const dialog = $(".dialogWait")[0];
        const title = $(".dialogWaitTitle");
        const buttonCancel = $(".dialogWait-cancelButton");

        title.html(waitDialogSettings.title);
        buttonCancel.toggle(!!waitDialogSettings.buttonCancelCallback);

        buttonCancel.off("click");

        buttonCancel.on("click", () => {
            dialog.close();
            waitDialogSettings.buttonCancelCallback?.();
        });

        dialog.showModal();
        return dialog;
    }
    showInformationDialog(informationDialogSettings) {
        // informationDialogSettings:
        // title, text, buttonConfirmText
        return new Promise(resolve => {
            const dialog = $(".dialogInformation");
            const title = dialog.find(".dialogInformationTitle");
            const content = dialog.find(".dialogInformationContent");
            const buttonConfirm = dialog.find(".dialogInformation-confirmButton");

            title.html(informationDialogSettings.title);
            content.html(informationDialogSettings.text);
            buttonConfirm.html(informationDialogSettings.buttonConfirmText);

            buttonConfirm.off("click");

            buttonConfirm.on("click", () => {
                dialog[0].close();
                resolve();
            });

            dialog[0].showModal();
        });
    }
    saveToTextFileDialog(textToSave, suggestedFileName, extension) {
        return new Promise((resolve, reject) => {
            const accepts = [{ description: `${extension.toUpperCase()} files`, extensions: [extension] }];

            chrome.fileSystem.chooseEntry(
                {
                    type: 'saveFile',
                    suggestedName: suggestedFileName,
                    accepts: accepts,
                },
                entry => this._saveToTextFileDialogFileSelected(entry, textToSave, resolve, reject),
            );
        });
    }
    _saveToTextFileDialogFileSelected(entry, textToSave, resolve, reject) {
        checkChromeRuntimeError();

        if (!entry) {
            console.log('No file selected for saving');
            resolve(false);
            return;
        }

        entry.createWriter(writer => {
            writer.onerror = () => {
                reject();
                console.error('Failed to write file');
            };

            writer.onwriteend = () => {
                if (textToSave.length > 0 && writer.length === 0) {
                    writer.write(new Blob([textToSave], { type: 'text/plain' }));
                } else {
                    resolve(true);
                    console.log('File write complete');
                }
            };

            writer.truncate(0);
        },
            () => {
                reject();
                console.error('Failed to get file writer');
            });
    }
    readTextFileDialog(extension) {
        const accepts = [{ description: `${extension.toUpperCase()} files`, extensions: [extension] }];

        return new Promise((resolve, reject) => {
            chrome.fileSystem.chooseEntry({ type: 'openFile', accepts: accepts }, function (entry) {
                checkChromeRuntimeError();

                if (!entry) {
                    console.log('No file selected for loading');
                    resolve(false);
                    return;
                }

                entry.file((file) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = () => {
                        console.error(reader.error);
                        reject();
                    };
                    reader.readAsText(file);
                });
            });
        });
    }
    escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
    addLinksTargetBlank(element) {
        element.find('a').each(function () {
            $(this).attr('target', '_blank');
        });
    }
}

function GUI_checkOperatingSystem() {
    return navigator?.userAgentData?.platform || 'Android';
}

const GUI = new GuiControl();

export { TABS };
export default GUI;
