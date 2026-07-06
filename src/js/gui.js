import { get as getConfig } from "./ConfigStorage";
import { reactive } from "vue";
import MSP from "./msp";
import { getOS } from "./utils/checkCompatibility";
import { i18n } from "./localization";
import { useDialogStore } from "../stores/dialog";
import { useConnectionStore } from "../stores/connection";
import { pinia } from "./pinia_instance";
import { getLockManager } from "./lock_manager";

const TABS = {};

class GuiControl {
    constructor() {
        this.flashingInProgress = false;
        this.active_tab = null;
        this.tab_switch_in_progress = false;
        this.operating_system = null;
        this.interval_array = [];
        this.timeout_array = [];
        this.buttonDisabledClass = "disabled";

        this.defaultAllowedTabsWhenDisconnected = [
            "landing",
            "firmware_flasher",
            "preflight",
            "help",
            "user_profile",
            "backups",
            "flight_plan",
            "autotune",
            "blackbox_viewer",
        ];

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
            "autotune",
            "ports",
            "receiver",
            "sensors",
            "blackbox_viewer",
        ];

        this.defaultCloudBuildTabOptions = ["gps", "led_strip", "osd", "servos", "vtx", "flight_plan"];

        this.defaultAllowedFCTabsWhenConnected = [...this.defaultAllowedTabs, ...this.defaultCloudBuildTabOptions];

        this.allowedTabs = this.defaultAllowedTabsWhenDisconnected;

        // check which operating system is user running
        this.operating_system = getOS();
    }

    // connect_lock is backed by the reactive LockManager (single source of truth)
    // instead of a bare instance field, so reactive consumers (store.connectLock
    // computed, tab guards) keep updating. Behaviour is unchanged: `= true` locks,
    // `= false` unlocks.
    get connect_lock() {
        return getLockManager().locked;
    }

    set connect_lock(value) {
        getLockManager().locked = value;
    }

    // connecting_to / connected_to now live in useConnectionStore (the canonical
    // connection-target state); GUI delegates so existing GUI.* readers/writers
    // (serial_backend, tab_switch, …) transparently hit the store. Reactivity is
    // preserved — the getters read store refs. Accessed lazily at runtime, so no
    // pinia-timing issue at GUI construction.
    get connecting_to() {
        return useConnectionStore(pinia).connectingTo;
    }

    set connecting_to(value) {
        useConnectionStore(pinia).connectingTo = value;
    }

    get connected_to() {
        return useConnectionStore(pinia).connectedTo;
    }

    set connected_to(value) {
        useConnectionStore(pinia).connectedTo = value;
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
    content_ready(callback) {
        const tRex = GUI.active_tab.replaceAll("_", "-").toLowerCase();

        const docButton = document.querySelector("div#content #button-documentation");
        if (docButton) {
            docButton.innerHTML = i18n.getMessage("betaflightSupportButton");
            docButton.setAttribute("href", `https://betaflight.com/docs/wiki/app/${tRex}-tab`);
        }

        if (callback) {
            callback();
        }
    }
    selectDefaultTabWhenConnected() {
        const result = getConfig(["rememberLastTab", "lastTab"]);
        const tabClass =
            result.rememberLastTab && result.lastTab && this.allowedTabs.includes(result.lastTab.substring(4))
                ? result.lastTab
                : "tab_setup";
        const tabKey = tabClass.substring(4);

        import("./tab_switch.js").then(({ switchTab }) => {
            if (!switchTab(tabKey, { mode: "connected" })) {
                switchTab("setup", { mode: "connected" });
            }
        });
    }
    showYesNoDialog(yesNoDialogSettings) {
        // yesNoDialogSettings:
        // title, text, buttonYesText, buttonNoText, buttonYesCallback, buttonNoCallback
        const dialog = document.querySelector(".dialogYesNo");
        const title = dialog.querySelector(".dialogYesNoTitle");
        const content = dialog.querySelector(".dialogYesNoContent");
        const buttonYes = dialog.querySelector(".dialogYesNo-yesButton");
        const buttonNo = dialog.querySelector(".dialogYesNo-noButton");

        title.innerHTML = yesNoDialogSettings.title;
        content.innerHTML = yesNoDialogSettings.text;
        buttonYes.innerHTML = yesNoDialogSettings.buttonYesText;
        buttonNo.innerHTML = yesNoDialogSettings.buttonNoText;

        buttonYes.onclick = () => {
            dialog.close();
            yesNoDialogSettings.buttonYesCallback?.();
        };

        buttonNo.onclick = () => {
            dialog.close();
            yesNoDialogSettings.buttonNoCallback?.();
        };

        dialog.showModal();
    }
    showWaitDialog(waitDialogSettings) {
        // waitDialogSettings:
        // title, buttonCancelCallback
        const dialog = document.querySelector(".dialogWait");
        const title = dialog.querySelector(".dialogWaitTitle");
        const buttonCancel = dialog.querySelector(".dialogWait-cancelButton");

        title.innerHTML = waitDialogSettings.title;
        buttonCancel.style.display = waitDialogSettings.buttonCancelCallback ? "" : "none";

        buttonCancel.onclick = () => {
            dialog.close();
            waitDialogSettings.buttonCancelCallback?.();
        };

        dialog.showModal();
        return dialog;
    }
    showInformationDialog(informationDialogSettings) {
        // informationDialogSettings:
        // title, text, buttonConfirmText
        return new Promise((resolve) => {
            const dialog = document.querySelector(".dialogInformation");
            const title = dialog.querySelector(".dialogInformationTitle");
            const content = dialog.querySelector(".dialogInformationContent");
            const buttonConfirm = dialog.querySelector(".dialogInformation-confirmButton");

            title.innerHTML = informationDialogSettings.title;
            content.innerHTML = informationDialogSettings.text;
            buttonConfirm.innerHTML = informationDialogSettings.buttonConfirmText;

            buttonConfirm.onclick = () => {
                dialog.close();
                resolve();
            };

            dialog.showModal();
        });
    }
    showInteractiveDialog(interactiveDialogSettings) {
        // interactiveDialogSettings:
        // title, text, buttonCloseText
        const dialogStore = useDialogStore(pinia);
        return new Promise((resolve) => {
            dialogStore.open(
                "InteractiveDialog",
                {
                    title: interactiveDialogSettings.title ?? "",
                    buttonCloseText: interactiveDialogSettings.buttonCloseText ?? "",
                    commandPlaceholder: i18n.getMessage("cliCommand"),
                },
                {
                    close: () => {
                        dialogStore.close();
                        resolve();
                    },
                },
            );
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
        for (const a of element.querySelectorAll("a")) {
            a.setAttribute("target", "_blank");
        }
    }

    showCliPanel() {
        function set_cli_response(response) {
            const eol = "\n";
            let output = `${eol}`;
            for (const line of response) {
                output += `${line}${eol}`;
            }
            const cliCommand = document.getElementById("cli-command");
            if (cliCommand) {
                cliCommand.value = "";
            }
            const cliResponse = document.getElementById("cli-response");
            if (cliResponse) {
                cliResponse.textContent = output;
            }
        }

        const cliPanelDialog = {
            title: i18n.getMessage("cliPanelTitle"),
            buttonCloseText: i18n.getMessage("close"),
        };

        this.showInteractiveDialog(cliPanelDialog);

        // Wait for dialog to render before hooking up DOM elements
        setTimeout(() => {
            // clear response from previous session
            const cliResponse = document.getElementById("cli-response");
            if (cliResponse) {
                cliResponse.textContent = "";
            }

            // cli-command input hook
            const cliCommandInput = document.querySelector("input#cli-command");
            if (cliCommandInput) {
                cliCommandInput.onchange = function () {
                    const command = this.value;
                    if (!command) {
                        return;
                    }
                    MSP.send_cli_command(command, function (response) {
                        set_cli_response(response);
                    });
                };
                cliCommandInput.focus();
            }
        }, 100);
    }
}

export function createGui() {
    const gui = new GuiControl();
    return reactive(gui);
}

const GUI = createGui();

export { TABS };
export default GUI;
