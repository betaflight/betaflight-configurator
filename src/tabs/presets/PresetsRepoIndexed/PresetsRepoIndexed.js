'use strict';

class PresetsRepoIndexed {
    constructor(urlRaw, urlViewOnline) {
        this._urlRaw = urlRaw;
        this._urlViewOnline = urlViewOnline;
        this._index = null;
    }

    get index() {
        return this._index;
    }

    loadIndex() {
        return fetch(this._urlRaw + "index.json", {cache: "no-cache"})
            .then(res => res.json())
            .then(out => this._index = out);
    }

    removeUncheckedOptions(strings, checkedOptions) {
        let resultStrings = [];
        let isCurrentOptionExcluded = false;
        const lowerCasedCheckedOptions = checkedOptions.map(optionName => optionName.toLowerCase());

        strings.forEach(str => {
            if (this._isLineAttribute(str)) {
                const line = this._removeAttributeDirective(str);

                if (this._isOptionBegin(line)) {
                    const optionNameLowCase = this._getOptionName(line).toLowerCase();

                    if (!lowerCasedCheckedOptions.includes(optionNameLowCase)) {
                        isCurrentOptionExcluded = true;
                    }
                } else if (this._isOptionEnd(line)) {
                    isCurrentOptionExcluded = false;
                }
            } else if (!isCurrentOptionExcluded) {
                resultStrings.push(str);
            }
        });

        resultStrings = this._removeExcessiveEmptyLines(resultStrings);

        return resultStrings;
    }

    _removeExcessiveEmptyLines(strings) {
        // removes empty lines if there are two or more in a row leaving just one empty line
        const result = [];
        let lastStringEmpty = false;

        strings.forEach(str => {
            if ("" !== str || !lastStringEmpty) {
                result.push(str);
            }

            if ("" === str) {
                lastStringEmpty = true;
            } else {
                lastStringEmpty = false;
            }
        });

        return result;
    }

    _isLineAttribute(line) {
        return line.trim().startsWith(PresetsRepoIndexed._sCliAttributeDirective);
    }

    _isOptionBegin(line) {
        const lowCaseLine = line.toLowerCase();
        return lowCaseLine.startsWith(this._index.settings.OptionsDirectives.BEGIN_OPTION_DIRECTIVE);
    }

    _isOptionEnd(line) {
        const lowCaseLine = line.toLowerCase();
        return lowCaseLine.startsWith(this._index.settings.OptionsDirectives.END_OPTION_DIRECTIVE);
    }

    _getOptionName(line) {
        const directiveRemoved = line.slice(this._index.settings.OptionsDirectives.BEGIN_OPTION_DIRECTIVE.length).trim();
        const regExpRemoveChecked = new RegExp(this._escapeRegex(this._index.settings.OptionsDirectives.OPTION_CHECKED +":"), 'gi');
        const regExpRemoveUnchecked = new RegExp(this._escapeRegex(this._index.settings.OptionsDirectives.OPTION_UNCHECKED +":"), 'gi');
        let optionName = directiveRemoved.replace(regExpRemoveChecked, "");
        optionName = optionName.replace(regExpRemoveUnchecked, "").trim();
        return optionName;
    }

    _escapeRegex(string) {
        return string.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    }

    _removeAttributeDirective(line) {
        return line.trim().slice(PresetsRepoIndexed._sCliAttributeDirective.length).trim();
    }

    getPresetOnlineLink(preset) {
        return this._urlViewOnline + preset.fullPath;
    }

    _parceInclude(strings, includeRowIndexes, promises)
    {
           for (let i = 0; i < strings.length; i++) {
            const match = PresetsRepoIndexed._sRegExpInclude.exec(strings[i].toLowerCase());

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
        const isIncludeFound = this._isIncludeFound(strings);

        if (isIncludeFound) {
            return this._executeIncludeOnce(strings)
            .then(resultStrings => this._executeIncludeNested(resultStrings));
        } else {
            return new Promise.resolve(strings);
        }
    }

    _isIncludeFound(strings) {
        for (const str of strings) {
            const match = PresetsRepoIndexed._sRegExpInclude.exec(str.toLowerCase());

            if (match !== null) {
                return true;
            }
        }

        return false;
    }

    loadPreset(preset) {
        const promiseMainText = this._loadPresetText(this._urlRaw + preset.fullPath);

        return promiseMainText
        .then(text => {
            let strings = text.split("\n");
            strings = strings.map(str => str.trim());
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

PresetsRepoIndexed._sCliCommentDirective = "#";
PresetsRepoIndexed._sCliAttributeDirective = "#$";

// Reg exp extracts file/path.txt from # include: file/path.txt
PresetsRepoIndexed._sRegExpInclude = /^#\$[ ]+?include:[ ]+?(?<filePath>\S+$)/;
