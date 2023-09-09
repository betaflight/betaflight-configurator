import { i18n } from "../../../js/localization";
import $ from 'jquery';

export default class PresetTitlePanel
{
    constructor(parentDiv, preset, presetRepo, clickable, showPresetRepoName, onLoadedCallback, favoritePresets)
    {
        PresetTitlePanel.s_panelCounter ++;
        this._parentDiv = parentDiv;
        this._onLoadedCallback = onLoadedCallback;
        this._domId = `preset_title_panel_${PresetTitlePanel.s_panelCounter}`;
        this._preset = preset;
        this._presetRepo = presetRepo;
        this._showPresetRepoName = showPresetRepoName;
        this._clickable = clickable;
        this._favoritePresets = favoritePresets;

        this._parentDiv.append(`<div class="${this._domId}"></div>`);
        this._domWrapperDiv = $(`.${this._domId}`);
        this._domWrapperDiv.toggle(false);
        this._starJustClicked = false;
        this._mouseOnStar = false;
        this._mouseOnPanel = false;
        this._clickable = clickable;

        if (clickable) {
            this._domWrapperDiv.addClass("preset_title_panel_border");
            // setting up hover effect here, because if setup in SCC it stops working after background animation like - this._domWrapperDiv.animate({ backgroundColor....
        }
    }

    _updateHoverEffects() {
        let starMouseHover = false;

        if (this._clickable && this._mouseOnPanel && !this._mouseOnStar) {
            this._domWrapperDiv.css({"background-color": "var(--subtleAccent)"});
        } else {
            this._domWrapperDiv.css({"background-color": "var(--boxBackground)"});
        }

        if (this._mouseOnStar || (this._mouseOnPanel && this._clickable)) {
            this._domStar.css({"background-color": "var(--subtleAccent)"});
            starMouseHover = true;
        } else {
            this._domWrapperDiv.css({"background-color": "var(--boxBackground)"});
            this._domStar.css({"background-color": "var(--boxBackground)"});
        }

        if (this._preset.lastPickDate) {
            this._domStar.css("background-image", "url('../../../images/icons/star_orange.svg')");
        } else if (starMouseHover) {
            this._domStar.css("background-image", "url('../../../images/icons/star_orange_stroke.svg')");
        } else {
            this._domStar.css("background-image", "url('../../../images/icons/star_transparent.svg')");
        }
    }

    load() {
        this._domWrapperDiv.load("./tabs/presets/TitlePanel/PresetTitlePanelBody.html", () => this._setupHtml());
    }

    subscribeClick(presetsDetailedDialog, presetsRepo)
    {
        this._domWrapperDiv.on("click", () => {
            if (!this._starJustClicked) {
                this._showPresetsDetailedDialog(presetsDetailedDialog, presetsRepo);
            }

            this._starJustClicked = false;
        });
    }

    _showPresetsDetailedDialog(presetsDetailedDialog, presetsRepo) {
        presetsDetailedDialog.open(this._preset, presetsRepo, this._showPresetRepoName).then(isPresetPicked => {
            if (isPresetPicked) {
                const color = this._domWrapperDiv.css( "background-color" );
                this._domWrapperDiv.css('background-color', 'green');
                this._domWrapperDiv.animate({ backgroundColor: color }, 2000);
                this.setPicked(true);
            }

            this._updateHoverEffects();
        });
    }

    setPicked(isPicked) {
        if (!this._clickable) {
            return;
        }

        this._preset.isPicked = isPicked;

        if (isPicked) {
            this._domWrapperDiv.css({"border": "2px solid green"});
        } else {
            this._domWrapperDiv.css({"border": "1px solid var(--subtleAccent)"});
        }
    }

    _setupHtml()
    {
        this._readDom();

        this._domCategory.text(this._preset.category);
        this._domTitle.text(this._preset.title);
        this._domTitle.prop("title", this._preset.title);
        this._domAuthor.text(this._preset.author);
        this._domVersions.text(this._preset.firmware_version?.join("; "));
        this._domSourceRepository.text(this._presetRepo.name);
        this._domSourceRepositoryRow.toggle(this._showPresetRepoName);

        this._domKeywords.text(this._preset.keywords?.join("; "));
        this._domKeywords.prop("title", this._preset.keywords?.join("; "));
        this._domStatusOfficial.toggle(this._preset.status === "OFFICIAL");
        this._domStatusCommunity.toggle(this._preset.status === "COMMUNITY");
        this._domStatusExperimental.toggle(this._preset.status === "EXPERIMENTAL");
        this._domOfficialSourceIcon.toggle(this._presetRepo.official);

        this.setPicked(this._preset.isPicked);
        this._setupStar();

        this._domWrapperDiv.on("mouseenter", () => { this._mouseOnPanel = true; this._updateHoverEffects(); });
        this._domWrapperDiv.on("mouseleave", () => { this._mouseOnPanel = false; this._updateHoverEffects(); } );
        this._domStar.on("mouseenter", () => { this._mouseOnStar = true; this._updateHoverEffects(); });
        this._domStar.on("mouseleave", () => { this._mouseOnStar = false; this._updateHoverEffects(); });

        i18n.localizePage();
        this._domWrapperDiv.toggle(true);

        if (typeof this._onLoadedCallback === 'function') {
            this._onLoadedCallback();
        }
    }

    _readDom()
    {
        this._domTitle = this._domWrapperDiv.find('.preset_title_panel_title');
        this._domStar = this._domWrapperDiv.find('.preset_title_panel_star');
        this._domCategory = this._domWrapperDiv.find('.preset_title_panel_category');
        this._domAuthor = this._domWrapperDiv.find('.preset_title_panel_author_text');
        this._domKeywords = this._domWrapperDiv.find('.preset_title_panel_keywords_text');
        this._domSourceRepository = this._domWrapperDiv.find('.preset_title_panel_repository_text');
        this._domSourceRepositoryRow = this._domWrapperDiv.find('.preset_title_panel_repository_row');
        this._domVersions = this._domWrapperDiv.find('.preset_title_panel_versions_text');
        this._domStatusOfficial = this._domWrapperDiv.find('.preset_title_panel_status_official');
        this._domStatusCommunity = this._domWrapperDiv.find('.preset_title_panel_status_community');
        this._domStatusExperimental = this._domWrapperDiv.find('.preset_title_panel_status_experimental');
        this._domOfficialSourceIcon = this._domWrapperDiv.find('.preset_title_panel_betaflight_official');
    }

    _setupStar() {
        this._updateHoverEffects();

        this._domStar.on("click", () => {
            this._starJustClicked = true;
            this._processStarClick();
        });
    }

    _processStarClick() {
        if (this._preset.lastPickDate) {
            this._favoritePresets.delete(this._preset, this._presetRepo);
        } else {
            this._favoritePresets.add(this._preset, this._presetRepo);
        }

        this._favoritePresets.saveToStorage();
        this._updateHoverEffects();
    }

    remove()
    {
        this._domWrapperDiv.remove();
    }
}

PresetTitlePanel.s_panelCounter = 0;
