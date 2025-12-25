import { get as getConfig } from "./ConfigStorage";
import MSP from "./msp";
import Switchery from "switchery-latest";
import tippy from "tippy.js";
import $ from "jquery";
import { getOS } from "./utils/checkCompatibility";
import PortHandler from "./port_handler";
import CONFIGURATOR from "./data_storage";
import { i18n } from "./localization";
import MSPCodes from "./msp/MSPCodes";
import { gui_log } from "./gui_log";

const TABS = {};

class GuiControl {
    constructor() {
        this.connecting_to = false;
        this.connected_to = false;
        this.connect_lock = false;
        this.active_tab = null;
        this.tab_switch_in_progress = false;
        this.operating_system = null;
        this.interval_array = [];
        this.timeout_array = [];
        this.buttonDisabledClass = "disabled";

        this.reboot_timestamp = 0;
        this.REBOOT_CONNECT_MAX_TIME_MS = 10000;

        this.defaultAllowedTabsWhenDisconnected = ["landing", "firmware_flasher", "privacy_policy", "options", "help"];

        this.defaultAllowedTabs = [
            "setup",
            "failsafe",
            "power",
            "adjustments",
            "auxiliary",
            "presets",
            "cli",
            "configuration",
            "logging",
            "onboard_logging",
            "modes",
            "motors",
            "pid_tuning",
            "ports",
            "receiver",
            "sensors",
        ];

        this.defaultCloudBuildTabOptions = ["gps", "led_strip", "osd", "servos", "transponder", "vtx"];

        this.defaultAllowedFCTabsWhenConnected = [...this.defaultAllowedTabs, ...this.defaultCloudBuildTabOptions];

        this.allowedTabs = this.defaultAllowedTabsWhenDisconnected;

        // check which operating system is user running
        this.operating_system = getOS();
    }
    // Timer managing methods
    // name = string
    // code = function reference (code to be executed)
    // interval = time interval in miliseconds
    // first = true/false if code should be ran initially before next timer interval hits
    interval_add(name, code, interval, first) {
        const data = { name: name, timer: null, code: code, interval: interval, fired: 0, paused: false };

        if (this.interval_array.find((element) => element.name === name)) {
            this.interval_remove(name);
        }

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
        this.interval_add(
            name,
            () => {
                if (condition()) {
                    code();
                } else {
                    this.interval_remove(name);
                }
            },
            interval,
            first,
        );
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

        for (let i = this.interval_array.length - 1; i >= 0; i--) {
            // reverse iteration
            let keep = false;
            if (keepArray) {
                // only run through the array if it exists
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
            name: name,
            timer: null,
            timeout: timeout,
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
        const COLOR_ACCENT = "var(--primary-500)";
        const COLOR_SWITCHERY_SECOND = "var(--switcherysecond)";

        $(".togglesmall").each(function (index, elem) {
            if ($(elem).next(".switchery").length) return;
            const switchery = new Switchery(elem, {
                size: "small",
                color: COLOR_ACCENT,
                secondaryColor: COLOR_SWITCHERY_SECOND,
            });
            $(elem).on("change", function () {
                switchery.setPosition();
            });
            $(elem).removeClass("togglesmall");
        });

        $(".toggle").each(function (index, elem) {
            if ($(elem).next(".switchery").length) return;
            const switchery = new Switchery(elem, {
                color: COLOR_ACCENT,
                secondaryColor: COLOR_SWITCHERY_SECOND,
            });
            $(elem).on("change", function () {
                switchery.setPosition();
            });
            $(elem).removeClass("toggle");
        });

        $(".togglemedium").each(function (index, elem) {
            if ($(elem).next(".switchery").length) return;
            const switchery = new Switchery(elem, {
                className: "switcherymid",
                color: COLOR_ACCENT,
                secondaryColor: COLOR_SWITCHERY_SECOND,
            });
            $(elem).on("change", function () {
                switchery.setPosition();
            });
            $(elem).removeClass("togglemedium");
        });
    }
    content_ready(callback) {
        this.switchery();

        const tRex = GUI.active_tab.replaceAll("_", "-").toLowerCase();

        $("div#content #button-documentation")
            .html(i18n.getMessage("betaflightSupportButton"))
            .attr("href", `https://betaflight.com/docs/wiki/configurator/${tRex}-tab`);

        // Create tooltips once page is "ready"
        $(function () {
            $(".cf_tip, .cf_tip_wide").each((_, element) => {
                const jQueryElement = $(element);
                const attrTitle = jQueryElement.attr("title");
                if (attrTitle && !element._tippy) {
                    tippy(element, {
                        content: attrTitle,
                    });
                    jQueryElement.removeAttr("title");
                }
            });
        });

        if (callback) {
            callback();
        }
    }
    selectDefaultTabWhenConnected() {
        const result = getConfig(["rememberLastTab", "lastTab"]);
        const tab =
            result.rememberLastTab && result.lastTab && this.allowedTabs.includes(result.lastTab.substring(4))
                ? result.lastTab
                : "tab_setup";

        $(`#tabs ul.mode-connected .${tab} a`).trigger("click");
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
        return new Promise((resolve) => {
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
    showInteractiveDialog(interactiveDialogSettings) {
        // interactiveDialogSettings:
        // title, text, buttonCloseText
        return new Promise((resolve) => {
            const dialog = $(".dialogInteractive");
            const title = dialog.find(".dialogInteractiveTitle");
            const content = dialog.find(".dialogInteractiveContent");
            const buttonClose = dialog.find(".dialogInteractive-closeButton");

            title.html(interactiveDialogSettings.title);
            content.html(interactiveDialogSettings.text);
            buttonClose.html(interactiveDialogSettings.buttonCloseText);

            buttonClose.off("click");

            buttonClose.on("click", () => {
                dialog[0].close();
                resolve();
            });

            dialog[0].showModal();
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
        element.find("a").each(function () {
            $(this).attr("target", "_blank");
        });
    }
    reinitializeConnection() {
        if (CONFIGURATOR.virtualMode) {
            this.reboot_timestamp = Date.now();
            $("a.connection_button__link").trigger("click");
            if (PortHandler.portPicker.autoConnect) {
                return setTimeout(function () {
                    $("a.connection_button__link").trigger("click");
                }, 500);
            }
            return;
        }

        const currentPort = PortHandler.portPicker.selectedPort;

        // Set the reboot timestamp to the current time
        this.reboot_timestamp = Date.now();

        // Send reboot command to the flight controller
        MSP.send_message(MSPCodes.MSP_SET_REBOOT, false, false);

        // Force connection invalid to ensure reboot dialog waits for reconnection
        CONFIGURATOR.connectionValid = false;

        if (currentPort.startsWith("bluetooth") || currentPort === "manual") {
            return setTimeout(function () {
                $("a.connection_button__link").trigger("click");
            }, 1500);
        }

        // Show reboot progress modal except for cli and presets tab
        if (["cli", "presets"].includes(this.active_tab)) {
            console.log(`[GUI] Rebooting in ${this.active_tab} tab, skipping reboot dialog`);
            gui_log(i18n.getMessage("deviceRebooting"));

            this._waitForReconnection((timeoutReached) => {
                if (timeoutReached) {
                    console.log(`[GUI] Reboot timeout reached`);
                } else {
                    gui_log(i18n.getMessage("deviceReady"));
                }
            });

            return;
        }

        // Show reboot progress modal
        this.showRebootDialog();
    }

    _waitForReconnection(callback) {
        const checkInterval = setInterval(() => {
            const timeoutReached = Date.now() - this.reboot_timestamp > this.REBOOT_CONNECT_MAX_TIME_MS;
            const noSerialReconnect = !PortHandler.portPicker.autoConnect && PortHandler.portAvailable;

            if (CONFIGURATOR.connectionValid || timeoutReached || noSerialReconnect) {
                clearInterval(checkInterval);
                callback(timeoutReached);
            }
        }, 100);

        // Return the interval ID so it can be cleared externally if needed (e.g. by progress bar logic)
        return checkInterval;
    }

    showRebootDialog() {
        gui_log(i18n.getMessage("deviceRebooting"));

        // Helper function to create the reboot dialog if it doesn't exist
        function createRebootProgressDialog() {
            const dialog = document.createElement("dialog");
            dialog.id = "rebootProgressDialog";
            dialog.className = "dialogReboot";

            dialog.innerHTML = `
                <div class="content">
                    <div class="reboot-status">${i18n.getMessage("rebootFlightController")}</div>
                    <div class="reboot-progress-container">
                        <div class="reboot-progress-bar"></div>
                    </div>
                </div>
            `;

            document.body.appendChild(dialog);

            // Add styles if not already defined
            if (!document.getElementById("rebootProgressStyle")) {
                const style = document.createElement("style");
                style.id = "rebootProgressStyle";
                style.textContent = `
                    .dialogReboot {
                        border: 1px solid var(--subtleAccent);
                        border-radius: 5px;
                        background-color: var(--surface-100);
                        color: var(--text);
                        padding: 20px;
                        max-width: 400px;
                    }
                    .reboot-progress-container {
                        width: 100%;
                        background-color: var(--surface-0);
                        border-radius: 3px;
                        margin: 15px 0 5px;
                        height: 10px;
                    }
                    .reboot-progress-bar {
                        height: 100%;
                        background-color: var(--primary-500);
                        border-radius: 3px;
                        transition: width 0.1s ease-in-out;
                        width: 0%;
                    }
                    .reboot-status {
                        text-align: center;
                        margin: 10px 0;
                    }
                `;
                document.head.appendChild(style);
            }

            return dialog;
        }

        // Show reboot progress modal
        const rebootDialog = document.getElementById("rebootProgressDialog") || createRebootProgressDialog();
        rebootDialog.querySelector(".reboot-progress-bar").style.width = "0%";
        rebootDialog.querySelector(".reboot-status").textContent = i18n.getMessage("rebootFlightController");
        rebootDialog.showModal();

        // Update progress during reboot
        let progress = 0;
        // Calculate increment to reach 100% exactly when timeout occurs (called every 100ms)
        const progressIncrement = 100 / (this.REBOOT_CONNECT_MAX_TIME_MS / 100);

        const progressInterval = setInterval(() => {
            progress += progressIncrement;
            if (progress <= 100) {
                rebootDialog.querySelector(".reboot-progress-bar").style.width = `${progress}%`;
            }
        }, 100);

        // Check for successful connection using shared helper
        this._waitForReconnection((timeoutReached) => {
            clearInterval(progressInterval);

            rebootDialog.querySelector(".reboot-progress-bar").style.width = "100%";
            rebootDialog.querySelector(".reboot-status").textContent = i18n.getMessage("rebootFlightControllerReady");

            // Close the dialog after showing "ready" message briefly
            setTimeout(() => {
                rebootDialog.close();
            }, 1000);

            if (timeoutReached) {
                console.log(`[GUI] Reboot timeout reached`);
            } else {
                gui_log(i18n.getMessage("deviceReady"));
            }
        });
    }

    showCliPanel() {
        function set_cli_response(response) {
            const eol = "\n";
            let output = `${eol}`;
            for (const line of response) {
                output += `${line}${eol}`;
            }
            // gui_log(output.split(eol).join('<br>'));
            $("#cli-command").val("");
            $("#cli-response").text(output);
        }

        // cli-command button hook
        $("input#cli-command").change(function () {
            const _self = $(this);
            const command = _self.val();
            if (!command) {
                return;
            }
            MSP.send_cli_command(command, function (response) {
                set_cli_response(response);
            });
        });

        const cliPanelDialog = {
            title: i18n.getMessage("cliPanelTitle"),
            buttonCloseText: i18n.getMessage("close"),
        };

        // clear response from previous session
        $("#cli-response").text("");

        this.showInteractiveDialog(cliPanelDialog);

        // Set focus on the CLI command input when dialog opens
        // Use timeout to ensure dialog is fully rendered
        setTimeout(() => {
            const cliInput = $("#cli-command");
            if (cliInput.length > 0 && cliInput.is(":visible")) {
                cliInput.focus();
            }
        }, 100);
    }
}

const GUI = new GuiControl();

export { TABS };
export default GUI;
