import PresetParser from "./PresetParser";

export default class PresetsRepoIndexed {
    constructor(urlRaw, urlViewOnline, official, name) {
        this._urlRaw = urlRaw;
        this._urlViewOnline = urlViewOnline;
        this._index = null;
        this._name = name;
        this._official = official;
    }

    get index() {
        return this._index;
    }

    get official() {
        return this._official;
    }

    get name() {
        return this._name;
    }

    loadIndex() {
        return fetch(`${this._urlRaw}index.json`, {cache: "no-cache"})
            .then(res => res.json())
            .then(out => {
                this._index = out;
                this._settings = this._index.settings;
                this._PresetParser = new PresetParser(this._index.settings);
            });
    }

    getPresetOnlineLink(preset) {
        return this._urlViewOnline + preset.fullPath;
    }

    removeUncheckedOptions(strings, checkedOptions) {
        return this._PresetParser.removeUncheckedOptions(strings, checkedOptions);
    }

    _parceInclude(strings, includeRowIndexes, promises)
    {
           for (let i = 0; i < strings.length; i++) {
            const match = PresetParser._sRegExpInclude.exec(strings[i]);

            if (match !== null) {
                includeRowIndexes.push(i);
                const filePath = this._urlRaw + match.groups.filePath;
                const promise = this._loadPresetText(filePath);
                promises.push(promise);
            }
        }
    }

    _executeIncludeOnce(strings) {
        const includeRowIndexes = []; // row indexes with "#include" statements
        const promises = []; // promises to load included files
        this._parceInclude(strings, includeRowIndexes, promises);

        return Promise.all(promises)
            .then(includedTexts => {
                for (let i = 0; i < includedTexts.length; i++) {
                    strings[includeRowIndexes[i]] = includedTexts[i];
                }

                const text = strings.join('\n');
                return text.split("\n").map(str => str.trim());
            });
    }

    _executeIncludeNested(strings) {
        const isIncludeFound = this._PresetParser.isIncludeFound(strings);

        if (isIncludeFound) {
            return this._executeIncludeOnce(strings)
            .then(resultStrings => this._executeIncludeNested(resultStrings));
        } else {
            return Promise.resolve(strings);
        }
    }

    loadPreset(preset) {
        const promiseMainText = this._loadPresetText(this._urlRaw + preset.fullPath);

        return promiseMainText
        .then(text => {
            let strings = text.split("\n");
            strings = strings.map(str => str.trim());
            this._PresetParser.readPresetProperties(preset, strings);
            return strings;
        })
        .then(strings => this._executeIncludeNested(strings))
        .then(strings => {
            preset.originalPresetCliStrings = strings;
            return this._loadPresetWarning(preset);
        });
    }

    _loadPresetWarning(preset) {
        let completeWarning = "";

        if (preset.warning) {
            completeWarning += (completeWarning?"\n":"") + preset.warning;
        }

        if (preset.disclaimer) {
            completeWarning += (completeWarning?"\n":"") + preset.disclaimer;
        }

        const allFiles = [].concat(...[preset.include_warning, preset.include_disclaimer].filter(Array.isArray));

        return this._loadFilesInOneText(allFiles)
            .then(text => {
                completeWarning += (completeWarning?"\n":"") + text;
                preset.completeWarning = completeWarning;
            });
    }

    _loadFilesInOneText(fileUrls) {
        const loadPromises = [];

        fileUrls?.forEach(url => {
            const filePath = this._urlRaw + url;
            loadPromises.push(this._loadPresetText(filePath));
        });

        return Promise.all(loadPromises)
        .then(texts => {
            return texts.join('\n');
        });
    }

    _loadPresetText(fullUrl) {
        return new Promise((resolve, reject) => {
            fetch(fullUrl, {cache: "no-cache"})
            .then(res => res.text())
            .then(text => resolve(text))
            .catch(err => {
                console.error(err);
                reject(err);
            });
        });
    }
}
