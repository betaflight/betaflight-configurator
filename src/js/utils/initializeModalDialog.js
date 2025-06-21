import $ from "jquery";
import { i18n } from "../localization";

/**
 * Gets the title bar for a modal dialog.
 * @param {string} messageId Localized message identifier.
 * @param {object} [messageParameters] Localized message parameters
 * @param {() => void} onClose Function invoked by the close button.
 * @returns {JQuery<HTMLElement>} Dialog title bar.
 */
function getDialogTitleBar(messageId, messageParameters, onClose) {
    // HTML structure
    const dialogTitleBar = $(`
        <div style="display: flex; height: 47px; background: var(--surface-300); border-bottom: 1px solid var(--surface-950);">
            <div style="flex: 1; display: flex; align-items: center;">
                <div style="padding: 15px;">${i18n.getMessage(messageId, messageParameters || undefined)}</div>
            </div>
            <div id="dialogclose" style="flex: 0 0 47px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
                <svg width="10" height="10" version="1.1" xmlns="http://www.w3.org/2000/svg">
                    <line x1="0" y1="0" x2="10" y2="10" stroke="var(--surface-950)" stroke-width="2"/>
                    <line x1="0" y1="10" x2="10" y2="0" stroke="var(--surface-950)" stroke-width="2"/>
                </svg>
            </div>
        </div>
    `);
    // Handle close button
    dialogTitleBar.find("#dialogclose").on("click", onClose);
    // Return title bar
    return dialogTitleBar;
}

/**
 * Initializes a modal dialog from an HTML dialog element.
 * @param {JQuery.Selector|null} activationSelector JQuery selector for the activation element.
 * @param {JQuery.Selector} dialogSelector JQuery selector for the dialog element.
 * @param {string} messageId Localized message identifier.
 * @param {object} [messageParameters] Localized message parameters
 * @param {() => void} [onClose] Function invoked when the dialog is closed.
 * @returns {HTMLDialogElement} HTML dialog element.
 */
export function initializeModalDialog(activationSelector, dialogSelector, messageId, messageParameters, onClose) {
    // Get dialog references
    const dialog = $(dialogSelector);
    const dialogElement = dialog.get(0);
    const dialogContainerElement = dialog.children().first().get(0);
    // Add dialog title bar
    dialog.prepend(
        getDialogTitleBar(messageId, messageParameters, () => {
            dialogElement.close();
        }),
    );
    // Handle close event
    dialogElement.addEventListener("close", () => {
        onClose && onClose();
    });
    // Handle activation button click
    $(activationSelector).on("click", () => {
        dialogElement.showModal();
        // Reset any previous scrolling
        dialogContainerElement.scroll(0, 0);
    });
    // Return dialog element
    return dialogElement;
}
