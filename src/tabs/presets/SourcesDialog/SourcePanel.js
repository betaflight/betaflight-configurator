import { i18n } from "../../../js/localization";
import GUI from "../../../js/gui";
import PresetSource from "./PresetSource";
import $ from 'jquery';

export default class SourcePanel {
    constructor(parentDiv, presetSource) {
        this._parentDiv = parentDiv;
        this._presetSource = presetSource;
        this._active = false;
    }

    get presetSource() {
        return this._presetSource;
    }

    load() {
        SourcePanel.s_panelCounter++;
        this._domId = `source_panel_${SourcePanel.s_panelCounter}`;
        this._parentDiv.append(`<div id="${this._domId}"></div>`);
        this._domWrapperDiv = $(`#${this._domId}`);
        this._domWrapperDiv.toggle(false);

        return new Promise(resolve => {
            this._domWrapperDiv.load("./tabs/presets/SourcesDialog/SourcePanel.html",
            () => {
                this._setupHtml();
                resolve();
            });
        });
    }

    setOnSelectedCallback(onSelectedCallback) {
        // callback with this (SourcePanel) argument
        // so that consumer knew which panel was clicked on
        this._onSelectedCallback = onSelectedCallback;
    }

    setOnDeleteCallback(onDeletedCallback) {
        // callback with this (SourcePanel) argument
        // so that consumer knew which panel was clicked on
        this._onDeletedCallback = onDeletedCallback;
    }

    setOnActivateCallback(onActivateCallback) {
        // callback with this (SourcePanel) argument
        // so that consumer knew which panel was clicked on
        this._onActivateCallback = onActivateCallback;
    }

    setOnDeactivateCallback(onDeactivateCallback) {
        // callback with this (SourcePanel) argument
        // so that consumer knew which panel was clicked on
        this._onDeactivateCallback = onDeactivateCallback;
    }

    setOnSaveCallback(onSaveCallback) {
        // callback with this (SourcePanel) argument
        // so that consumer knew which panel was clicked on
        this._onSaveCallback = onSaveCallback;
    }

    setSelected(isSelected) {
        this._setUiSelected(isSelected);
    }

    get active() {
        return this._active;
    }

    setActive(isActive) {
        this._active = isActive;
        this._domDivSelectedIndicator.toggle(this._active);
        this._domButtonActivate.toggle(!isActive);
        this._domButtonDeactivate.toggle(isActive);
    }

    _setUiOfficial() {
        if (this.presetSource.official){
            this._domButtonSave.toggle(false);
            this._domButtonReset.toggle(false);
            this._domButtonDelete.toggle(false);
            this._domEditName.prop("disabled", true);
            this._domEditUrl.prop("disabled", true);
            this._domEditGitHubBranch.prop("disabled", true);
        }
    }

    _setUiSelected(isSelected) {
        if (this._selected !== isSelected) {
            this._domDivNoEditing.toggle(!isSelected);
            this._domDivEditing.toggle(isSelected);

            this._onResetButtonClick();
            this._updateNoEditingName();

            this._domDivInnerPanel.toggleClass("presets_source_panel_not_selected", !isSelected);
            this._domDivInnerPanel.toggleClass("presets_source_panel_selected", isSelected);
            if (isSelected) {
                this._domDivInnerPanel.off("click");
            } else {
                this._domDivInnerPanel.on("click", () => this._onPanelSelected());
            }

            this._selected = isSelected;
        }
    }

    _updateNoEditingName() {
        this._domDivNoEditingName.text(this._presetSource.name);
    }

    _setupHtml() {
        this._readDom();
        this._setupActions();
        this.setSelected(false);
        this._setIsSaved(true);
        this._checkIfGithub();
        this.setActive(this._active);
        this._setUiOfficial();

        i18n.localizePage();
        this._domWrapperDiv.toggle(true);
    }

    _setupActions() {
        this._domButtonSave.on("click", () => this._onSaveButtonClick());
        this._domButtonReset.on("click", () => this._onResetButtonClick());
        this._domButtonDelete.on("click", () => this._onDeleteButtonClick());
        this._domButtonActivate.on("click", () => this._onActivateButtonClick());
        this._domButtonDeactivate.on("click", () => this._onDeactivateButtonClick());

        this._domEditName.on("input", () => this._onInputChange());
        this._domEditUrl.on("input", () => this._onInputChange());
        this._domEditGitHubBranch.on("input", () => this._onInputChange());
    }

    _onPanelSelected() {
        this._setUiSelected(true);
        this._onSelectedCallback?.(this);
    }

    _checkIfGithub() {
        const isGithubUrl = PresetSource.isUrlGithubRepo(this._domEditUrl.val());
        this._domDivGithubBranch.toggle(isGithubUrl);
    }

    _onInputChange() {
        this._checkIfGithub();
        this._setIsSaved(false);
    }

    _onSaveButtonClick() {
        this._presetSource.name = this._domEditName.val();
        this._presetSource.url = this._domEditUrl.val();
        this._presetSource.gitHubBranch = this._domEditGitHubBranch.val();
        this._setIsSaved(true);
        this._onSaveCallback?.(this);
    }

    _onResetButtonClick() {
        this._domEditName.val(this._presetSource.name);
        this._domEditUrl.val(this._presetSource.url);
        this._domEditGitHubBranch.val(this._presetSource.gitHubBranch);
        this._checkIfGithub();
        this._setIsSaved(true);
    }

    _onDeleteButtonClick() {
        this._domWrapperDiv.remove();
        this._onDeletedCallback?.(this);
    }

    _onActivateButtonClick() {
        this._onSaveButtonClick();
        this.setActive(true);
        this._onActivateCallback?.(this);
    }

    _onDeactivateButtonClick() {
        this._onSaveButtonClick();
        this.setActive(false);
        this._onDeactivateCallback?.(this);
    }

    _setIsSaved(isSaved) {
        if (isSaved) {
            this._domButtonSave.addClass(GUI.buttonDisabledClass);
            this._domButtonReset.addClass(GUI.buttonDisabledClass);
        } else {
            this._domButtonSave.removeClass(GUI.buttonDisabledClass);
            this._domButtonReset.removeClass(GUI.buttonDisabledClass);
        }
    }

    _readDom() {
        this._domDivInnerPanel = this._domWrapperDiv.find(".presets_source_panel");
        this._domDivNoEditing = this._domWrapperDiv.find(".presets_source_panel_no_editing");
        this._domDivEditing = this._domWrapperDiv.find(".presets_source_panel_editing");

        this._domEditName = this._domWrapperDiv.find(".presets_source_panel_editing_name_field");
        this._domEditUrl = this._domWrapperDiv.find(".presets_source_panel_editing_url_field");
        this._domEditGitHubBranch = this._domWrapperDiv.find(".presets_source_panel_editing_branch_field");

        this._domButtonSave = this._domWrapperDiv.find(".presets_source_panel_save");
        this._domButtonReset = this._domWrapperDiv.find(".presets_source_panel_reset");
        this._domButtonActivate = this._domWrapperDiv.find(".presets_source_panel_activate");
        this._domButtonDeactivate = this._domWrapperDiv.find(".presets_source_panel_deactivate");
        this._domButtonDelete = this._domWrapperDiv.find(".presets_source_panel_delete");
        this._domDivGithubBranch = this._domWrapperDiv.find(".presets_source_panel_editing_github_branch");
        this._domDivNoEditingName = this._domWrapperDiv.find(".presets_source_panel_no_editing_name");

        this._domDivSelectedIndicator = this._domWrapperDiv.find(".presets_source_panel_no_editing_selected");
    }
}

SourcePanel.s_panelCounter = 0;
