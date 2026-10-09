/*
 * This file is part of Betaflight.
 *
 * Betaflight is free software. You can redistribute this software
 * and/or modify this software under the terms of the GNU General
 * Public License as published by the Free Software Foundation,
 * either version 3 of the License, or (at your option) any later
 * version.
 *
 * Betaflight is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this software.
 *
 * If not, see <http://www.gnu.org/licenses/>.
 */

import MSP from "./msp";
import { i18n } from "./localization";
import { useDialogStore } from "../stores/dialog";

interface InteractiveDialogSettings {
    title: string;
    buttonCloseText: string;
}

function showInteractiveDialog(settings: InteractiveDialogSettings): Promise<void> {
    const dialogStore = useDialogStore();
    return new Promise((resolve) => {
        dialogStore.open(
            "InteractiveDialog",
            {
                title: settings.title,
                buttonCloseText: settings.buttonCloseText,
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

function setCliResponse(response: string[]): void {
    const eol = "\n";
    let output = eol;
    for (const line of response) {
        output += `${line}${eol}`;
    }
    const cliCommand = document.getElementById("cli-command");
    if (cliCommand instanceof HTMLInputElement) {
        cliCommand.value = "";
    }
    const cliResponse = document.getElementById("cli-response");
    if (cliResponse) {
        cliResponse.textContent = output;
    }
}

/**
 * Opens the quick CLI panel (Ctrl+I outside the CLI tab): one command at a time, sent over MSP,
 * with its response shown in the dialog.
 */
export function showCliPanel(): void {
    void showInteractiveDialog({
        title: i18n.getMessage("cliPanelTitle"),
        buttonCloseText: i18n.getMessage("close"),
    });

    // Wait for dialog to render before hooking up DOM elements
    setTimeout(() => {
        // clear response from previous session
        const cliResponse = document.getElementById("cli-response");
        if (cliResponse) {
            cliResponse.textContent = "";
        }

        // cli-command input hook
        const cliCommandInput = document.querySelector<HTMLInputElement>("input#cli-command");
        if (cliCommandInput) {
            cliCommandInput.onchange = function () {
                const command = cliCommandInput.value;
                if (!command) {
                    return;
                }
                MSP.send_cli_command(command, setCliResponse);
            };
            cliCommandInput.focus();
        }
    }, 100);
}
