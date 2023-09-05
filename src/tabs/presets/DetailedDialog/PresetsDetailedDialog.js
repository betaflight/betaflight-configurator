import GUI from "../../../js/gui";
import { i18n } from "../../../js/localization";
import PickedPreset from "../PickedPreset";
import PresetTitlePanel from "../TitlePanel/PresetTitlePanel";
import FC from "../../../js/fc";
import { marked } from "marked";
import DOMPurify from "dompurify";
import $ from 'jquery';

export default class PresetsDetailedDialog {
    constructor(domDialog, pickedPresetList, onPresetPickedCallback, favoritePresets) {
        this._domDialog = domDialog;
        this._pickedPresetList = pickedPresetList;
        this._finalDialogYesNoSettings = {};
        this._onPresetPickedCallback = onPresetPickedCallback;
        this._openPromiseResolve = undefined;
        this._isDescriptionHtml = false;
        this._favoritePresets = favoritePresets;
    }

    load() {
        return new Promise(resolve => {
            this._domDialog.load("./tabs/presets/DetailedDialog/PresetsDetailedDialog.html", () => {
                this._setupdialog();
                resolve();
            });
        });
    }

    open(preset, presetsRepo, showPresetRepoName) {
        this._presetsRepo = presetsRepo;
        this._preset = preset;
        this._showPresetRepoName = showPresetRepoName;
        this._setLoadingState(true);
        this._domDialog[0].showModal();
        this._optionsShowedAtLeastOnce = false;
        this._isPresetPickedOnClose = false;

        this._presetsRepo.loadPreset(this._preset)
            .then(() => {
                this._loadPresetUi();
                this._setLoadingState(false);
                this._setFinalYesNoDialogSettings();
            })
            .catch(err => {
                console.error(err);
                const msg = i18n.getMessage("presetsLoadError");
                this._showError(msg);
            });

        return new Promise(resolve => this._openPromiseResolve = resolve);
    }

    _setFinalYesNoDialogSettings() {
        this._finalDialogYesNoSettings = {
            title: i18n.getMessage("presetsWarningDialogTitle"),
            text: GUI.escapeHtml(this._preset.completeWarning),
            buttonYesText: i18n.getMessage("presetsWarningDialogYesButton"),
            buttonNoText: i18n.getMessage("presetsWarningDialogNoButton"),
            buttonYesCallback: () => this._pickPresetFwVersionCheck(),
            buttonNoCallback: null,
        };
    }

    _getFinalCliText() {
        const optionsToInclude = this._domOptionsSelect.multipleSelect("getSelects", "value");
        return this._presetsRepo.removeUncheckedOptions(this._preset.originalPresetCliStrings, optionsToInclude);
    }

    _loadPresetUi() {
        this._loadDescription();

        this._domGitHubLink.attr("href", this._presetsRepo.getPresetOnlineLink(this._preset));

        if (this._preset.discussion) {
            this._domDiscussionLink.removeClass(GUI.buttonDisabledClass);
            this._domDiscussionLink.attr("href", this._preset.discussion);
        } else{
            this._domDiscussionLink.addClass(GUI.buttonDisabledClass);
        }

        this._titlePanel.empty();
        const titlePanel = new PresetTitlePanel(this._titlePanel, this._preset, this._presetsRepo, false,
            this._showPresetRepoName, () => this._setLoadingState(false), this._favoritePresets);
        titlePanel.load();
        this._loadOptionsSelect();
        this._updateFinalCliText();
        this._showCliText(false);
    }

    _loadDescription() {
        let text = this._preset.description?.join("\n");

        switch(this._preset.parser) {
            case "MARKED":
                this._isDescriptionHtml = true;
                text = marked.parse(text);
                text = DOMPurify.sanitize(text);
                this._domDescriptionHtml.html(text);
                GUI.addLinksTargetBlank(this._domDescriptionHtml);
                break;
            default:
                this._isDescriptionHtml = false;
                this._domDescriptionText.text(text);
                break;
        }
    }

    _updateFinalCliText() {
        this._domCliText.text(this._getFinalCliText().join("\n"));
    }

    _setLoadingState(isLoading) {
        this._domProperties.toggle(!isLoading);
        this._domLoading.toggle(isLoading);
        this._domError.toggle(false);

        if (isLoading) {
            this._domButtonApply.addClass(GUI.buttonDisabledClass);
        } else {
            this._domButtonApply.removeClass(GUI.buttonDisabledClass);
        }
    }

    _showError(msg) {
        this._domError.toggle(true);
        this._domError.text(msg);
        this._domProperties.toggle(false);
        this._domLoading.toggle(false);
        this._domButtonApply.addClass(GUI.buttonDisabledClass);
    }

    _readDom() {
        this._domButtonApply = $('#presets_detailed_dialog_applybtn');
        this._domButtonCancel = $('#presets_detailed_dialog_closebtn');
        this._domLoading = $('#presets_detailed_dialog_loading');
        this._domError = $('#presets_detailed_dialog_error');
        this._domProperties = $('#presets_detailed_dialog_properties');
        this._titlePanel = $('.preset_detailed_dialog_title_panel');
        this._domDescriptionText = $('#presets_detailed_dialog_text_description');
        this._domDescriptionHtml = $('#presets_detailed_dialog_html_description');
        this._domCliText = $('#presets_detailed_dialog_text_cli');
        this._domGitHubLink = this._domDialog.find('#presets_open_online');
        this._domDiscussionLink = this._domDialog.find('#presets_open_discussion');
        this._domOptionsSelect = $('#presets_options_select');
        this._domOptionsSelectPanel = $('#presets_options_panel');
        this._domButtonCliShow = $('#presets_cli_show');
        this._domButtonCliHide = $('#presets_cli_hide');
    }

    _showCliText(value) {
        this._domDescriptionText.toggle(!value && !this._isDescriptionHtml);
        this._domDescriptionHtml.toggle(!value && this._isDescriptionHtml);
        this._domCliText.toggle(value);
        this._domButtonCliShow.toggle(!value);
        this._domButtonCliHide.toggle(value);
    }

    _createOptionsSelect(options) {
        options.forEach(option => {
            if (!option.childs) {
                this._addOption(this._domOptionsSelect, option, false);
            } else {
                this._addOptionGroup(this._domOptionsSelect, option);
            }
        });

        this._domOptionsSelect.multipleSelect({
            placeholder: i18n.getMessage("presetsOptionsPlaceholder"),
            formatSelectAll () { return i18n.getMessage("dropDownSelectAll"); },
            formatAllSelected() { return i18n.getMessage("dropDownAll"); },
            onClick: () => this._optionsSelectionChanged(),
            onCheckAll: () => this._optionsSelectionChanged(),
            onUncheckAll: () => this._optionsSelectionChanged(),
            onOpen: () => this._optionsOpened(),
            hideOptgroupCheckboxes: true,
            singleRadio: true,
            selectAll: false,
            styler: function (row) {
                let style = "";
                if (row.type === 'optgroup') {
                    style = 'font-weight: bold;';
                } else if (row.classes.includes("optionHasParent")) {
                    style = 'padding-left: 22px;';
                }
                return style;
            },
        });
    }

    _optionsOpened() {
        this._optionsShowedAtLeastOnce = true;
    }

    _addOptionGroup(parentElement, optionGroup) {
        const optionGroupElement = $(`<optgroup label="${optionGroup.name}"></optgroup>`);

        optionGroup.childs.forEach(option => {
            this._addOption(optionGroupElement, option, true);
        });

        parentElement.append(optionGroupElement);
    }

    _addOption(parentElement, option, hasParent) {
        let selectedString = "selected=\"selected\"";
        if (!option.checked) {
            selectedString = "";
        }

        let classString = "";
        if (hasParent) {
            classString = "class=\"optionHasParent\"";
        }

        parentElement.append(`<option value="${option.name}" ${selectedString} ${classString}>${option.name}</option>`);
    }

    _optionsSelectionChanged() {
        this._updateFinalCliText();
    }

    _destroyOptionsSelect() {
        this._domOptionsSelect.multipleSelect('destroy');
    }

    _loadOptionsSelect() {

        const optionsVisible = 0 !== this._preset.options.length;
        this._domOptionsSelect.empty();
        this._domOptionsSelectPanel.toggle(optionsVisible);

        if (optionsVisible) {
            this._createOptionsSelect(this._preset.options);
        }

        this._domOptionsSelect.multipleSelect('refresh');
    }

    _setupdialog() {
        i18n.localizePage();
        this._readDom();

        this._domButtonApply.on("click", () => this._onApplyButtonClicked());
        this._domButtonCancel.on("click", () => this._onCancelButtonClicked());
        this._domButtonCliShow.on("click", () => this._showCliText(true));
        this._domButtonCliHide.on("click", () => this._showCliText(false));
        this._domDialog.on("close", () => this._onClose());
    }

    _onApplyButtonClicked() {
        if (this._preset.force_options_review && !this._optionsShowedAtLeastOnce) {
            const dialogOptions = {
                title: i18n.getMessage("warningTitle"),
                text: i18n.getMessage("presetsReviewOptionsWarning"),
                buttonConfirmText: i18n.getMessage("close"),
            };
            GUI.showInformationDialog(dialogOptions);
        } else if (!this._preset.completeWarning) {
            this._pickPresetFwVersionCheck();
        } else {
            GUI.showYesNoDialog(this._finalDialogYesNoSettings);
        }
    }

    _pickPreset() {
        const cliStrings = this._getFinalCliText();
        const pickedPreset = new PickedPreset(this._preset, cliStrings, this._presetsRepo);
        this._pickedPresetList.push(pickedPreset);
        this._onPresetPickedCallback?.();
        this._isPresetPickedOnClose = true;
        this._onCancelButtonClicked();
    }

    _pickPresetFwVersionCheck() {
        let compatitable = false;

        for (const fw of this._preset.firmware_version) {
            if (FC.CONFIG.flightControllerVersion.startsWith(fw)) {
                compatitable = true;
                break;
            }
        }

        if (compatitable) {
            this._pickPreset();
        } else {
            const dialogSettings = {
                title: i18n.getMessage("presetsWarningDialogTitle"),
                text: i18n.getMessage("presetsWarningWrongVersionConfirmation", [this._preset.firmware_version, FC.CONFIG.flightControllerVersion]),
                buttonYesText: i18n.getMessage("presetsWarningDialogYesButton"),
                buttonNoText: i18n.getMessage("presetsWarningDialogNoButton"),
                buttonYesCallback: () => this._pickPreset(),
                buttonNoCallback: null,
            };
            GUI.showYesNoDialog(dialogSettings);
        }
    }

    _onCancelButtonClicked() {
        this._domDialog[0].close();
    }

    _onClose() {
        this._destroyOptionsSelect();
        this._openPromiseResolve?.(this._isPresetPickedOnClose);
    }
}
