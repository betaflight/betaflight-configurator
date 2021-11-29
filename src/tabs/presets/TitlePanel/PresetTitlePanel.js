'use strict';

class PresetTitlePanel
{
    constructor(parentDiv, preset, clickable, onLoadedCallback)
    {
        PresetTitlePanel.s_panelCounter ++;
        this._parentDiv = parentDiv;
        this._onLoadedCallback = onLoadedCallback;
        this._domId = `preset_title_panel_${PresetTitlePanel.s_panelCounter}`;
        this._preset = preset;
        this._clickable = clickable;

        this._parentDiv.append(`<div class="${this._domId}"></div>`);
        this._domWrapperDiv = $(`.${this._domId}`);
        this._domWrapperDiv.toggle(false);

        if (clickable) {
            this._domWrapperDiv.addClass("preset_title_panel_border");
            // setting up hover effect here, because if setup in SCC it stops working after background animation like - this._domWrapperDiv.animate({ backgroundColor....
            this._domWrapperDiv.on("mouseenter", () => this._domWrapperDiv.css({"background-color": "var(--subtleAccent)"}));
            this._domWrapperDiv.on("mouseleave", () => this._domWrapperDiv.css({"background-color": "var(--boxBackground)"}));
        }
    }

    load() {
        this._domWrapperDiv.load("./tabs/presets/TitlePanel/PresetTitlePanelBody.html", () => this._setupHtml());
    }

    subscribeClick(presetsDetailedDialog, presetsRepo)
    {
        this._domWrapperDiv.on("click", () => {
            presetsDetailedDialog.open(this._preset, presetsRepo).then(isPresetPicked => {
                if (isPresetPicked) {
                    const color = this._domWrapperDiv.css( "background-color" );
                    this._domWrapperDiv.css('background-color', 'green');
                    this._domWrapperDiv.animate({ backgroundColor: color }, 2000);
                    this.setPicked(true);
                }
            });
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
        this._domKeywords.text(this._preset.keywords?.join("; "));
        this._domKeywords.prop("title", this._preset.keywords?.join("; "));
        this._domStatusOfficial.toggle(this._preset.status === "OFFICIAL");
        this._domStatusCommunity.toggle(this._preset.status === "COMMUNITY");
        this._domStatusExperimental.toggle(this._preset.status === "EXPERIMENTAL");
        this.setPicked(this._preset.isPicked);

        i18n.localizePage();
        this._domWrapperDiv.toggle(true);
        this._onLoadedCallback?.();
    }

    _readDom()
    {
        this._domTitle = this._domWrapperDiv.find('.preset_title_panel_title');
        this._domCategory = this._domWrapperDiv.find('.preset_title_panel_category');
        this._domAuthor = this._domWrapperDiv.find('.preset_title_panel_author_text');
        this._domKeywords = this._domWrapperDiv.find('.preset_title_panel_keywords_text');
        this._domVersions = this._domWrapperDiv.find('.preset_title_panel_versions_text');
        this._domStatusOfficial = this._domWrapperDiv.find('.preset_title_panel_status_official');
        this._domStatusCommunity = this._domWrapperDiv.find('.preset_title_panel_status_community');
        this._domStatusExperimental = this._domWrapperDiv.find('.preset_title_panel_status_experimental');
    }

    remove()
    {
        this._domWrapperDiv.remove();
    }
}

PresetTitlePanel.s_panelCounter = 0;
