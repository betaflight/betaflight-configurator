import 'jqueryPlugins';
import GUI from "gui";
import { i18n } from "localization";
import $ from 'jquery';

export default class PopupDialog {
    constructor(domDialog) {
        this._domDialog = domDialog;
        this._sourceSelectedPromiseResolve = null;
    }

    load() {
        return new Promise(resolve => {
            this._domDialog.load("./tabs/popup.html",
            () => {
                this._setupDialog();
                this._initializeSources();
                resolve();
            });
        });
    }

    show() {
        this._domDialog[0].showModal();
        return new Promise(resolve => this._sourceSelectedPromiseResolve = resolve);
    }

    _setupDialog() {
        this._readDom();
        this._setupEvents();
        i18n.localizePage();
    }

    _scrollDown() {
        this._domDivSourcesPanel.stop();
        this._domDivSourcesPanel.animate({scrollTop: `${this._domDivSourcesPanel.prop('scrollHeight')}px`});
    }

    _setupEvents() {
        this._domButtonClose.on("click", () => this._onCloseButtonClick());
        this._domDialog.on("close", () => this._onClose());
    }

    _onCloseButtonClick() {
        this._domDialog[0].close();
    }

    _onClose() {
        this._sourceSelectedPromiseResolve?.();
    }

    _readDom() {
        this._domButtonClose = $("#popup_dialog_close");
        this._domDivSourcesPanel = $(".popup_dialog_sources");
    }
}
