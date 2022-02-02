'use strict';

TABS.presets = {
    presetsRepo: null,
    cliEngine: null,
    pickedPresetList: [],
    majorVersion: 1,
};

TABS.presets.initialize = function (callback) {
    const self = this;

    self.cliEngine = new CliEngine(self);
    self.cliEngine.setProgressCallback(value => this.onApplyProgressChange(value));
    self._presetPanels = [];

    $('#content').load("./tabs/presets/presets.html", () => self.onHtmlLoad(callback));

    if (GUI.active_tab !== 'presets') {
        GUI.active_tab = 'presets';
    }
};

TABS.presets.readDom = function() {
    this._divGlobalLoading = $('#presets_global_loading');
    this._divGlobalLoadingError = $('#presets_global_loading_error');
    this._divCli = $('#presets_cli');
    this._divMainContent = $('#presets_main_content');
    this._selectCategory = $('#presets_filter_category');
    this._selectKeyword = $('#presets_filter_keyword');
    this._selectAuthor = $('#presets_filter_author');
    this._selectFirmwareVersion = $('#presets_filter_firmware_version');
    this._selectStatus = $('#presets_filter_status');
    this._inputTextFilter = $('#presets_filter_text');
    this._divPresetList = $('#presets_list');

    this._domButtonSave = $("#presets_save_button");
    this._domButtonCancel = $("#presets_cancel_button");

    this._domReloadButton = $("#presets_reload");
    this._domContentWrapper = $("#presets_content_wrapper");
    this._domProgressDialog = $("#presets_apply_progress_dialog")[0];
    this._domProgressDialogProgressBar = $(".presets_apply_progress_dialog_progress_bar");
    this._domButtonaSaveAnyway = $("#presets_cli_errors_save_anyway_button");
    this._domButtonaCliExit = $("#presets_cli_errors_exit_no_save_button");
    this._domDialogCliErrors = $("#presets_cli_errors_dialog")[0];
    this._domButtonSaveBackup = $(".presets_save_config");
    this._domButtonLoadBackup = $(".presets_load_config");
    this._domButtonPresetSources = $(".presets_sources_show");

    this._domWarningNotOfficialSource = $(".presets_warning_not_official_source");
    this._domWarningBackup = $(".presets_warning_backup");
    this._domButtonHideBackupWarning = $(".presets_warning_backup_button_hide");

    this._domListNoFound = $("#presets_list_no_found");
    this._domListTooManyFound = $("#presets_list_too_many_found");
};

TABS.presets.getPickedPresetsCli = function() {
    let result = [];
    this.pickedPresetList.forEach(pickedPreset => {
        result.push(...pickedPreset.presetCli);
    });
    result = result.filter(command => command !== "");
    return result;
};

TABS.presets.onApplyProgressChange = function(value) {
    this._domProgressDialogProgressBar.val(value);
};

TABS.presets.applyCommandsList = function(strings) {
    strings.forEach(cliCommand => {
        this.cliEngine.sendLine(cliCommand);
    });
};

TABS.presets.onSaveClick = function() {
    this._domProgressDialogProgressBar.val(0);
    this._domProgressDialog.showModal();
    const currentCliErrorsCount = this.cliEngine.errorsCount;

    this.activateCli().then(() => {
        const cliCommandsArray = this.getPickedPresetsCli();
        this.cliEngine.executeCommandsArray(cliCommandsArray).then(() => {
            const newCliErrorsCount = this.cliEngine.errorsCount;

            if (newCliErrorsCount !== currentCliErrorsCount) {
                this._domProgressDialog.close();
                this._domDialogCliErrors.showModal();
            } else {
                this._domProgressDialog.close();
                this.cliEngine.sendLine(CliEngine.s_commandSave);
                this.disconnectCliMakeSure();
            }
        });
    });
};

TABS.presets.disconnectCliMakeSure = function() {
    GUI.timeout_add('disconnect', function () {
        $('div.connect_controls a.connect').trigger( "click" );
    }, 500);
};

TABS.presets.setupMenuButtons = function() {
    this._domButtonSave.on("click", () => this.onSaveClick());


    this._domButtonCancel.on("click", () => {
        for(const pickedPreset of this.pickedPresetList) {
            pickedPreset.preset.isPicked = false;
        }

        this.updateSearchResults();
        this.pickedPresetList.length = 0;
        this.enableSaveCancelButtons(false);
    });

    this._domButtonaCliExit.on("click", () =>{
        this._domDialogCliErrors.close();
        this.cliEngine.sendLine(CliEngine.s_commandExit);
        this.disconnectCliMakeSure();
    });
    this._domButtonaSaveAnyway.on("click", () => {
        this._domDialogCliErrors.close();
        this.cliEngine.sendLine(CliEngine.s_commandSave, null, () => {
            // In case of batch CLI commands errors Firmware requeires extra "save" comand for CLI safety.
            // No need for this safety in presets as preset tab already detected errors and showed them to the user.
            // At this point user clicked "save anyway".
            this.cliEngine.sendLine(CliEngine.s_commandSave);
        });
        this.disconnectCliMakeSure();
    });
    this._domButtonSaveBackup.on("click", () => this.onSaveConfigClick());
    this._domButtonLoadBackup.on("click", () => this.onLoadConfigClick());
    this._domButtonPresetSources.on("click", () => this.onPresetSourcesShowClick());
    this._domButtonHideBackupWarning.on("click", () => this.onButtonHideBackupWarningClick());

    this._domButtonSave.toggleClass(GUI.buttonDisabledClass, false);
    this._domButtonCancel.toggleClass(GUI.buttonDisabledClass, false);
    this._domReloadButton.on("click", () => this.reload());

    this.enableSaveCancelButtons(false);

};

TABS.presets.enableSaveCancelButtons = function (isEnabled) {
    this._domButtonSave.toggleClass(GUI.buttonDisabledClass, !isEnabled);
    this._domButtonCancel.toggleClass(GUI.buttonDisabledClass, !isEnabled);
};

TABS.presets.onButtonHideBackupWarningClick = function() {
    this._domWarningBackup.toggle(false);
    ConfigStorage.set({ 'showPresetsWarningBackup': false });
};

TABS.presets.setupBackupWarning = function() {
    const obj = ConfigStorage.get('showPresetsWarningBackup');
    if (obj.showPresetsWarningBackup === undefined) {
        obj.showPresetsWarningBackup = true;
    }

    const warningVisible = !!obj.showPresetsWarningBackup;
    this._domWarningBackup.toggle(warningVisible);
};

TABS.presets.onPresetSourcesShowClick = function() {
    this.presetsSourcesDialog.show().then(() => {
        this.reload();
    });
};

TABS.presets.onSaveConfigClick = function() {
    const waitingDialog = GUI.showWaitDialog({title: i18n.getMessage("presetsLoadingDumpAll"), buttonCancelCallback: null});

    const saveFailedDialogSettings = {
        title: i18n.getMessage("warningTitle"),
        text: i18n.getMessage("dumpAllNotSavedWarning"),
        buttonConfirmText: i18n.getMessage("close"),
    };

    this.activateCli()
    .then(() => this.readDumpAll())
    .then(cliStrings => {
        const prefix = 'cli_backup';
        const suffix = 'txt';
        const text = cliStrings.join("\n");
        const filename = generateFilename(prefix, suffix);
        return GUI.saveToTextFileDialog(text, filename, suffix);
    })
    .then(() => {
        waitingDialog.close();
        this.cliEngine.sendLine(CliEngine.s_commandExit);
    })
    .catch(() => {
        waitingDialog.close();
        return GUI.showInformationDialog(saveFailedDialogSettings);
    })
    .then(() => this.cliEngine.sendLine(CliEngine.s_commandExit));
};

TABS.presets.readDumpAll = function() {
    let lastCliStringReceived = performance.now();
    const diffAll = [CliEngine.s_commandDefaultsNoSave, ""];
    const readingDumpIntervalName = "PRESETS_READING_DUMP_INTERVAL";

    this.cliEngine.subscribeOnRowCame(str => {
        lastCliStringReceived = performance.now();

        if (CliEngine.s_commandDiffAll !== str && CliEngine.s_commandSave !== str) {
            diffAll.push(str);
        }
    });

    this.cliEngine.sendLine(CliEngine.s_commandDiffAll);

    return new Promise(resolve => {
        GUI.interval_add(readingDumpIntervalName, () => {
            const currentTime = performance.now();
            if (currentTime - lastCliStringReceived > 500) {
                this.cliEngine.unsubscribeOnRowCame();
                GUI.interval_remove(readingDumpIntervalName);
                resolve(diffAll);
            }
        }, 500, false);
    });
};

TABS.presets.onLoadConfigClick = function() {
    GUI.readTextFileDialog("txt")
    .then(text => {
        if (text) {
            const cliStrings = text.split("\n");
            const pickedPreset = new PickedPreset({title: "user configuration"}, cliStrings);
            this.pickedPresetList.push(pickedPreset);
            this.onSaveClick();
        }
    });
};

TABS.presets.onHtmlLoad = function(callback) {
    i18n.localizePage();
    TABS.presets.adaptPhones();
    this.readDom();
    this.setupMenuButtons();
    this.setupBackupWarning();
    this._inputTextFilter.attr("placeholder", "example: \"karate race\", or \"5'' freestyle\"");

    this.presetsDetailedDialog = new PresetsDetailedDialog($("#presets_detailed_dialog"), this.pickedPresetList, () => this.onPresetPickedCallback());
    this.presetsSourcesDialog = new PresetsSourcesDialog($("#presets_sources_dialog"));

    this.presetsDetailedDialog.load()
    .then(() => this.presetsSourcesDialog.load())
    .then(() => {
        this.tryLoadPresets();
        GUI.content_ready(callback);
    });
};

TABS.presets.onPresetPickedCallback = function() {
    this.enableSaveCancelButtons(true);
};

TABS.presets.activateCli = function() {
    return new Promise(resolve => {
        CONFIGURATOR.cliEngineActive = true;
        this.cliEngine.setUi($('#presets_cli_window'), $('#presets_cli_window_wrapper'), $('#presets_cli_command'));
        this.cliEngine.enterCliMode();

        GUI.timeout_add('presets_enter_cli_mode_done', () => {
            resolve();
        }, 500);
    });
};

TABS.presets.reload = function() {
    this.resetInitialValues();
    this.tryLoadPresets();
};

TABS.presets.tryLoadPresets = function() {
    const presetSource = this.presetsSourcesDialog.getActivePresetSource();

    if (PresetSource.isUrlGithubRepo(presetSource.url)) {
        this.presetsRepo = new PresetsGithubRepo(presetSource.url, presetSource.gitHubBranch);
    } else {
        this.presetsRepo = new PresetsWebsiteRepo(presetSource.url);
    }

    this._divMainContent.toggle(false);
    this._divGlobalLoadingError.toggle(false);
    this._divGlobalLoading.toggle(true);
    this._domWarningNotOfficialSource.toggle(!this.presetsSourcesDialog.isOfficialActive);

    this.presetsRepo.loadIndex()
    .then(() => this.checkPresetSourceVersion())
    .then(() => {
        this.prepareFilterFields();
        this._divGlobalLoading.toggle(false);
        this._divMainContent.toggle(true);
    }).catch(err => {
        this._divGlobalLoading.toggle(false);
        this._divGlobalLoadingError.toggle(true);
        console.error(err);
    });
};

TABS.presets.multipleSelectComponentScrollFix = function() {
    /*
        A hack for multiple select that fixes scrolling problem
        when the number of items 199+. More details here:
        https://github.com/wenzhixin/multiple-select/issues/552
    */
    GUI.timeout_add('hack_fix_multipleselect_scroll', () => {
        this._selectCategory.multipleSelect('refresh');
        this._selectKeyword.multipleSelect('refresh');
        this._selectAuthor.multipleSelect('refresh');
        this._selectFirmwareVersion.multipleSelect('refresh');
        this._selectStatus.multipleSelect('refresh');
    }, 100);
};

TABS.presets.checkPresetSourceVersion = function() {
    return new Promise((resolve, reject) => {
        if (this.majorVersion === this.presetsRepo.index.majorVersion) {
            resolve();
        } else {
            const versionRequired = `${this.majorVersion}.X`;
            const versionSource = `${this.presetsRepo.index.majorVersion}.${this.presetsRepo.index.minorVersion}`;

            const dialogSettings = {
                title: i18n.getMessage("presetsWarningDialogTitle"),
                text: i18n.getMessage("presetsVersionMismatch", {"versionRequired": versionRequired, "versionSource":versionSource}),
                buttonYesText: i18n.getMessage("yes"),
                buttonNoText: i18n.getMessage("no"),
                buttonYesCallback: () => resolve(),
                buttonNoCallback: () => reject("Prset source version mismatch"),
            };

            GUI.showYesNoDialog(dialogSettings);
        }
    });
};

TABS.presets.prepareFilterFields = function() {
    this._freezeSearch = true;
    this.prepareFilterSelectField(this._selectCategory, this.presetsRepo.index.uniqueValues.category, 3);
    this.prepareFilterSelectField(this._selectKeyword, this.presetsRepo.index.uniqueValues.keywords, 3);
    this.prepareFilterSelectField(this._selectAuthor, this.presetsRepo.index.uniqueValues.author, 1);
    this.prepareFilterSelectField(this._selectFirmwareVersion, this.presetsRepo.index.uniqueValues.firmware_version, 2);
    this.prepareFilterSelectField(this._selectStatus, this.presetsRepo.index.settings.PresetStatusEnum, 2);
    this.multipleSelectComponentScrollFix();

    this.preselectFilterFields();
    this._inputTextFilter.on('input', () => this.updateSearchResults());

    this._freezeSearch = false;

    this.updateSearchResults();
};

TABS.presets.preselectFilterFields = function() {
    const currentVersion = FC.CONFIG.flightControllerVersion;
    const selectedVersions = [];

    for(const bfVersion of this.presetsRepo.index.uniqueValues.firmware_version) {
        if (currentVersion.startsWith(bfVersion)) {
            selectedVersions.push(bfVersion);
        }
    }

    this._selectFirmwareVersion.multipleSelect('setSelects', selectedVersions);
};

TABS.presets.prepareFilterSelectField = function(domSelectElement, selectOptions, minimumCountSelected) {
    domSelectElement.multipleSelect("destroy");
    domSelectElement.multipleSelect({
        data: selectOptions,
        showClear: true,
        minimumCountSelected : minimumCountSelected,
        placeholder: i18n.getMessage("dropDownFilterDisabled"),
        onClick: () => { this.updateSearchResults(); },
        onCheckAll: () => { this.updateSearchResults(); },
        onUncheckAll: () => { this.updateSearchResults(); },
        formatSelectAll() { return i18n.getMessage("dropDownSelectAll"); },
        formatAllSelected() { return i18n.getMessage("dropDownAll"); },
    });
};

TABS.presets.updateSearchResults = function() {
    if (!this._freezeSearch)
    {
        const searchParams = {
            categories: this._selectCategory.multipleSelect("getSelects", "text"),
            keywords: this._selectKeyword.multipleSelect("getSelects", "text"),
            authors: this._selectAuthor.multipleSelect("getSelects", "text"),
            firmwareVersions: this._selectFirmwareVersion.multipleSelect("getSelects", "text"),
            status: this._selectStatus.multipleSelect("getSelects", "text"),
            searchString: this._inputTextFilter.val().trim(),
        };

        this.updateSelectStyle();
        searchParams.authors = searchParams.authors.map(str => str.toLowerCase());
        const fitPresets = this.getFitPresets(searchParams);
        this.displayPresets(fitPresets);
    }
};

TABS.presets.updateSelectStyle = function() {
    this.updateSingleSelectStyle(this._selectCategory);
    this.updateSingleSelectStyle(this._selectKeyword);
    this.updateSingleSelectStyle(this._selectAuthor);
    this.updateSingleSelectStyle(this._selectFirmwareVersion);
    this.updateSingleSelectStyle(this._selectStatus);
};

TABS.presets.updateSingleSelectStyle = function(select) {
    const selectedOptions = select.multipleSelect("getSelects", "text");
    const isSomethingSelected = (0 !== selectedOptions.length);
    select.parent().find($(".ms-choice")).toggleClass("presets_filter_select_nonempty", isSomethingSelected);
};

TABS.presets.displayPresets = function(fitPresets) {
    this._presetPanels.forEach(presetPanel => {
        presetPanel.remove();
    });
    this._presetPanels = [];

    const maxPresetsToShow = 60;
    this._domListTooManyFound.toggle(fitPresets.length > maxPresetsToShow);
    fitPresets.length = Math.min(fitPresets.length, maxPresetsToShow);

    this._domListNoFound.toggle(fitPresets.length === 0);

    fitPresets.forEach(preset => {
        const presetPanel = new PresetTitlePanel(this._divPresetList, preset, true);
        presetPanel.load();
        this._presetPanels.push(presetPanel);
        presetPanel.subscribeClick(this.presetsDetailedDialog, this.presetsRepo);
    });

    this._domListTooManyFound.appendTo(this._divPresetList);
};

TABS.presets.getFitPresets = function(searchParams) {
    const result = [];

    for(const preset of this.presetsRepo.index.presets) {
        if(this.isPresetFitSearch(preset, searchParams)) {
            result.push(preset);
        }
    }

    result.sort((a, b) => (a.priority > b.priority) ? -1 : 1);

    return result;
};

TABS.presets.isPresetFitSearchStatuses = function(preset, searchParams) {
    return 0 === searchParams.status.length || searchParams.status.includes(preset.status);
};

TABS.presets.isPresetFitSearchCategories = function(preset, searchParams) {
    if (0 !== searchParams.categories.length) {
        if (undefined === preset.category) {
            return false;
        }

        if (!searchParams.categories.includes(preset.category)) {
            return false;
        }
    }

    return true;
};

TABS.presets.isPresetFitSearchKeywords = function(preset, searchParams) {
    if (0 !== searchParams.keywords.length) {
        if (!Array.isArray(preset.keywords)) {
            return false;
        }

        const keywordsIntersection = searchParams.keywords.filter(value => preset.keywords.includes(value));
        if (0 === keywordsIntersection.length) {
            return false;
        }
    }

    return true;
};

TABS.presets.isPresetFitSearchAuthors = function(preset, searchParams) {
    if (0 !== searchParams.authors.length) {
        if (undefined === preset.author) {
            return false;
        }

        if (!searchParams.authors.includes(preset.author.toLowerCase())) {
            return false;
        }
    }

    return true;
};

TABS.presets.isPresetFitSearchFirmwareVersions = function(preset, searchParams) {
    if (0 !== searchParams.firmwareVersions.length) {
        if (!Array.isArray(preset.firmware_version)) {
            return false;
        }

        const firmwareVersionsIntersection = searchParams.firmwareVersions.filter(value => preset.firmware_version.includes(value));
        if (0 === firmwareVersionsIntersection.length) {
            return false;
        }
    }

    return true;
};


TABS.presets.isPresetFitSearchString = function(preset, searchParams) {
    if (searchParams.searchString) {
        const allKeywords = preset.keywords.join(" ");
        const allVersions = preset.firmware_version.join(" ");
        const totalLine = [preset.description, allKeywords, preset.title, preset.author, allVersions, preset.category].join("\n").toLowerCase().replace("''", "\"");
        const allWords = searchParams.searchString.toLowerCase().replace("''", "\"").split(" ");

        for (const word of allWords) {
            if (!totalLine.includes(word)) {
                return false;
            }
        }
    }

    return true;
};


TABS.presets.isPresetFitSearch = function(preset, searchParams) {
    if (preset.hidden) {
        return false;
    }

    if (!this.isPresetFitSearchStatuses(preset, searchParams)) {
        return false;
    }

    if (!this.isPresetFitSearchCategories(preset, searchParams)) {
        return false;
    }

    if (!this.isPresetFitSearchKeywords(preset, searchParams)) {
        return false;
    }

    if (!this.isPresetFitSearchAuthors(preset, searchParams)) {
        return false;
    }

    if (!this.isPresetFitSearchFirmwareVersions(preset, searchParams)) {
        return false;
    }

    if (!this.isPresetFitSearchString(preset, searchParams)) {
        return false;
    }

    return true;
};

TABS.presets.adaptPhones = function() {
    if (GUI.isCordova()) {
        UI_PHONES.initToolbar();
    }
};

TABS.presets.read = function(readInfo) {
    TABS.presets.cliEngine.readSerial(readInfo);
};

TABS.presets.cleanup = function(callback) {
    this.resetInitialValues();

    if (!(CONFIGURATOR.connectionValid && CONFIGURATOR.cliEngineActive && CONFIGURATOR.cliEngineValid)) {
        if (callback) {
            callback();
        }

        return;
    }

    TABS.presets.cliEngine.close(() => {
        if (callback) {
            callback();
        }
    });
};

TABS.presets.resetInitialValues = function() {
    CONFIGURATOR.cliEngineActive = false;
    CONFIGURATOR.cliEngineValid = false;
    TABS.presets.presetsRepo = null;
    TABS.presets.pickedPresetList.length = 0;
    this._domProgressDialog.close();
};

TABS.presets.expertModeChanged = function(expertModeEnabled) {
    this._domShowHideCli.toggle(expertModeEnabled);
};
