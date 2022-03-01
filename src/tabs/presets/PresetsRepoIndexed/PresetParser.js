'use strict';

class PresetParser {
    constructor(settings) {
        this._settings = settings;
    }

    readPresetProperties(preset, strings) {
        const propertiesToRead = ["description", "discussion", "warning", "disclaimer", "include_warning", "include_disclaimer", "discussion", "force_options_review", "parser"];
        const propertiesMetadata = {};
        preset.options = [];

        propertiesToRead.forEach(propertyName => {
            // metadata of each property, name, type, optional true/false; example:
            // keywords: {type: MetadataTypes.WORDS_ARRAY, optional: true}
            propertiesMetadata[propertyName] = this._settings.presetsFileMetadata[propertyName];
            preset[propertyName] = undefined;
        });

        preset._currentOptionGroup = undefined;

        for (const line of strings) {
            if (line.startsWith(this._settings.MetapropertyDirective)) {
                this._parseAttributeLine(preset, line, propertiesMetadata);
            }
        }

        delete preset._currentOptionGroup;
    }

    _parseAttributeLine(preset, line, propertiesMetadata) {
        line = line.slice(this._settings.MetapropertyDirective.length).trim(); // (#$ DESCRIPTION: foo) -> (DESCRIPTION: foo)
        const lowCaseLine = line.toLowerCase();
        let isProperty = false;

        for (const propertyName in propertiesMetadata) {
            const lineBeginning = `${propertyName.toLowerCase()}:`; // "description:"

            if (lowCaseLine.startsWith(lineBeginning)) {
                line = line.slice(lineBeginning.length).trim(); // (Title: foo) -> (foo)
                this._parseProperty(preset, line, propertyName);
                isProperty = true;
            }
        }

        if (!isProperty && lowCaseLine.startsWith(this._settings.OptionsDirectives.OPTION_DIRECTIVE)) {
            this._parseOptionDirective(preset, line);
        }
    }

    _parseOptionDirective(preset, line) {
        const lowCaseLine = line.toLowerCase();

        if (lowCaseLine.startsWith(this._settings.OptionsDirectives.BEGIN_OPTION_DIRECTIVE)) {
            const option = this._getOption(line);
            if (!preset._currentOptionGroup) {
                preset.options.push(option);
            } else {
                preset._currentOptionGroup.childs.push(option);
            }
        } else if (lowCaseLine.startsWith(this._settings.OptionsDirectives.BEGIN_OPTION_GROUP_DIRECTIVE)) {
            const optionGroup = this._getOptionGroup(line);
            preset._currentOptionGroup = optionGroup;
            preset.options.push(optionGroup);
        } else if (lowCaseLine.startsWith(this._settings.OptionsDirectives.END_OPTION_GROUP_DIRECTIVE)) {
            preset._currentOptionGroup = undefined;
        }
    }

    _getOption(line) {
        const directiveRemoved = line.slice(this._settings.OptionsDirectives.BEGIN_OPTION_DIRECTIVE.length).trim();
        const directiveRemovedLowCase = directiveRemoved.toLowerCase();
        const OptionChecked = this._isOptionChecked(directiveRemovedLowCase);

        const regExpRemoveChecked = new RegExp(this._escapeRegex(this._settings.OptionsDirectives.OPTION_CHECKED), 'gi');
        const regExpRemoveUnchecked = new RegExp(this._escapeRegex(this._settings.OptionsDirectives.OPTION_UNCHECKED), 'gi');
        let optionName = directiveRemoved.replace(regExpRemoveChecked, "");
        optionName = optionName.replace(regExpRemoveUnchecked, "").trim();

        return {
            name: optionName.slice(1).trim(),
            checked: OptionChecked,
        };
    }

    _getOptionGroup(line) {
        const directiveRemoved = line.slice(this._settings.OptionsDirectives.BEGIN_OPTION_GROUP_DIRECTIVE.length).trim();

        return {
            name: directiveRemoved.slice(1).trim(),
            childs: [],
        };
    }

    _isOptionChecked(lowCaseLine) {
        return lowCaseLine.includes(this._settings.OptionsDirectives.OPTION_CHECKED);
    }

    _parseProperty(preset, line, propertyName) {
        switch(this._settings.presetsFileMetadata[propertyName].type) {
            case this._settings.MetadataTypes.STRING_ARRAY:
                this._processArrayProperty(preset, line, propertyName);
                break;
            case this._settings.MetadataTypes.STRING:
                this._processStringProperty(preset, line, propertyName);
                break;
            case this._settings.MetadataTypes.FILE_PATH:
                this._processStringProperty(preset, line, propertyName);
                break;
            case this._settings.MetadataTypes.FILE_PATH_ARRAY:
                this._processArrayProperty(preset, line, propertyName);
                break;
            case this._settings.MetadataTypes.BOOLEAN:
                this._processBooleanProperty(preset, line, propertyName);
                break;
            case this._settings.MetadataTypes.PARSER:
                this._processParserProperty(preset, line, propertyName);
                break;
            default:
                this.console.err(`Parcing preset: unknown property type '${this._settings.presetsFileMetadata[property].type}' for the property '${propertyName}'`);
        }
    }

    _processParserProperty(preset, line, propertyName)
    {
        preset[propertyName] = line;
    }

    _processBooleanProperty(preset, line, propertyName) {
        const trueValues = ["true", "yes"];

        const lineLowCase = line.toLowerCase();
        let result = false;

        if (trueValues.includes(lineLowCase)) {
            result = true;
        }

        preset[propertyName] = result;
    }

    _processArrayProperty(preset, line, propertyName) {
        if (!preset[propertyName]) {
            preset[propertyName] = [];
        }

        preset[propertyName].push(line);
    }

    _processStringProperty(preset, line, propertyName) {
        preset[propertyName] = line;
    }

    _getOptionName(line) {
        const directiveRemoved = line.slice(this._settings.OptionsDirectives.BEGIN_OPTION_DIRECTIVE.length).trim();
        const regExpRemoveChecked = new RegExp(this._escapeRegex(`${this._settings.OptionsDirectives.OPTION_CHECKED}:`), 'gi');
        const regExpRemoveUnchecked = new RegExp(this._escapeRegex(`${this._settings.OptionsDirectives.OPTION_UNCHECKED}:`), 'gi');
        let optionName = directiveRemoved.replace(regExpRemoveChecked, "");
        optionName = optionName.replace(regExpRemoveUnchecked, "").trim();
        return optionName;
    }

    _escapeRegex(string) {
        return string.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
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
        return line.trim().startsWith(this._settings.MetapropertyDirective);
    }

    _isOptionBegin(line) {
        const lowCaseLine = line.toLowerCase();
        return lowCaseLine.startsWith(this._settings.OptionsDirectives.BEGIN_OPTION_DIRECTIVE);
    }

    _isOptionEnd(line) {
        const lowCaseLine = line.toLowerCase();
        return lowCaseLine.startsWith(this._settings.OptionsDirectives.END_OPTION_DIRECTIVE);
    }

    _removeAttributeDirective(line) {
        return line.trim().slice(this._settings.MetapropertyDirective.length).trim();
    }

    isIncludeFound(strings) {
        for (const str of strings) {
            const match = PresetParser._sRegExpInclude.exec(str);

            if (match !== null) {
                return true;
            }
        }

        return false;
    }

}

// Reg exp extracts file/path.txt from # include: file/path.txt
PresetParser._sRegExpInclude = /^#\$[ ]+?INCLUDE:[ ]+?(?<filePath>\S+$)/;
