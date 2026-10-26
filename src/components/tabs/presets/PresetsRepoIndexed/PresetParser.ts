/*
 * This file is part of Betaflight.
 *
 * Betaflight is free software. You can redistribute this software
 * and/or modify this software under the terms of the GNU General
 * Public License as published by the Free Software Foundation,
 * either version 3 of the License, or (at your option) any later
 * version.
 *
 * Betaflight is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this software.
 *
 * If not, see <http://www.gnu.org/licenses/>.
 */

import type { Preset, PresetOption } from "../../../../stores/presets";

/** The `settings` block of a presets repository's index.json, as written by the firmware-presets indexer. */
export interface PresetsIndexSettings {
    /** The prefix of a metadata line in a preset file: `#$`. */
    MetapropertyDirective: string;
    PresetCategories: Record<string, string>;
    PresetCategoriesPriorities: Record<string, number>;
    MetadataTypes: Record<string, string>;
    OptionsDirectives: {
        OPTION_DIRECTIVE: string;
        BEGIN_OPTION_DIRECTIVE: string;
        END_OPTION_DIRECTIVE: string;
        OPTION_CHECKED: string;
        OPTION_UNCHECKED: string;
        BEGIN_OPTION_GROUP_DIRECTIVE: string;
        END_OPTION_GROUP_DIRECTIVE: string;
        EXCLUSIVE_OPTION_GROUP: string;
    };
    PresetStatusEnum: string[];
    ParserEnum: string[];
    presetsFileMetadata: Record<string, { type: string; optional: boolean }>;
}

/** The fields readPresetProperties() reads from a preset file's metadata lines, on top of its index entry. */
export interface PresetFileProperties {
    description?: string[];
    discussion?: string;
    warning?: string;
    disclaimer?: string;
    include_warning?: string[];
    include_disclaimer?: string[];
    force_options_review?: boolean;
    parser?: string;
}

export type ParsedPreset = Preset & PresetFileProperties;

export interface PresetOptionGroup extends PresetOption {
    childs: PresetOption[];
    isExclusive: boolean;
}

/** A preset while its metadata lines are read; `_currentOptionGroup` is removed when reading ends. */
type PresetBeingParsed = ParsedPreset & {
    options: PresetOption[];
    _currentOptionGroup?: PresetOptionGroup;
};

type PresetPropertyName = keyof PresetFileProperties;

export default class PresetParser {
    // No `private` members: the presets store keeps repositories, and so this parser, in a ref().
    // UnwrapRef drops private members, and the unwrapped type then no longer matches the class.
    // Reg exp extracts file/path.txt from # include: file/path.txt
    static readonly _sRegExpInclude = /^#\$ +?INCLUDE: +?(?<filePath>\S+$)/;

    readonly _settings: PresetsIndexSettings;

    constructor(settings: PresetsIndexSettings) {
        this._settings = settings;
    }

    readPresetProperties(preset: ParsedPreset, strings: string[]): void {
        const propertiesToRead: PresetPropertyName[] = [
            "description",
            "discussion",
            "warning",
            "disclaimer",
            "include_warning",
            "include_disclaimer",
            "discussion",
            "force_options_review",
            "parser",
        ];
        const propertiesMetadata: Partial<Record<PresetPropertyName, { type: string; optional: boolean }>> = {};
        preset.options = [];
        const parsing = preset as PresetBeingParsed;

        propertiesToRead.forEach((propertyName) => {
            // metadata of each property, name, type, optional true/false; example:
            // keywords: {type: MetadataTypes.WORDS_ARRAY, optional: true}
            propertiesMetadata[propertyName] = this._settings.presetsFileMetadata[propertyName];
            parsing[propertyName] = undefined;
        });

        parsing._currentOptionGroup = undefined;

        for (const line of strings) {
            if (line.startsWith(this._settings.MetapropertyDirective)) {
                this._parseAttributeLine(parsing, line, propertiesMetadata);
            }
        }

        delete parsing._currentOptionGroup;
    }

    _parseAttributeLine(
        preset: PresetBeingParsed,
        line: string,
        propertiesMetadata: Partial<Record<PresetPropertyName, unknown>>,
    ): void {
        line = line.slice(this._settings.MetapropertyDirective.length).trim(); // (#$ DESCRIPTION: foo) -> (DESCRIPTION: foo)
        const lowCaseLine = line.toLowerCase();
        let isProperty = false;

        for (const propertyName of Object.keys(propertiesMetadata) as PresetPropertyName[]) {
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

    _parseOptionDirective(preset: PresetBeingParsed, line: string): void {
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

    _getOption(line: string): PresetOption {
        const directiveRemoved = line.slice(this._settings.OptionsDirectives.BEGIN_OPTION_DIRECTIVE.length).trim();
        const directiveRemovedLowCase = directiveRemoved.toLowerCase();
        const OptionChecked = this._isOptionChecked(directiveRemovedLowCase);

        const regExpRemoveChecked = new RegExp(
            this._escapeRegex(this._settings.OptionsDirectives.OPTION_CHECKED),
            "gi",
        );
        const regExpRemoveUnchecked = new RegExp(
            this._escapeRegex(this._settings.OptionsDirectives.OPTION_UNCHECKED),
            "gi",
        );
        let optionName = directiveRemoved.replace(regExpRemoveChecked, "");
        optionName = optionName.replace(regExpRemoveUnchecked, "").trim();

        return {
            name: optionName.slice(1).trim(),
            checked: OptionChecked,
        };
    }

    _getOptionGroup(line: string): PresetOptionGroup {
        const lowercaseLine = line.toLowerCase();
        const exlusiveDirective = this._settings.OptionsDirectives.EXCLUSIVE_OPTION_GROUP;
        const isExclusiveGroup = lowercaseLine.includes(exlusiveDirective);

        let directiveRemoved: string;
        if (isExclusiveGroup) {
            const exclusiveDirectiveLength = exlusiveDirective.length;
            directiveRemoved = line
                .slice(lowercaseLine.lastIndexOf(exlusiveDirective) + exclusiveDirectiveLength - 1)
                .trim();
        } else {
            directiveRemoved = line.slice(this._settings.OptionsDirectives.BEGIN_OPTION_GROUP_DIRECTIVE.length).trim();
        }

        return {
            name: directiveRemoved.slice(1).trim(),
            childs: [],
            isExclusive: isExclusiveGroup,
        };
    }

    _isOptionChecked(lowCaseLine: string): boolean {
        return lowCaseLine.includes(this._settings.OptionsDirectives.OPTION_CHECKED);
    }

    _parseProperty(preset: PresetBeingParsed, line: string, propertyName: PresetPropertyName): void {
        // An index that predates a property (a custom preset source can serve an old
        // index.json) has no metadata for it; the lookup is typed to say so.
        const metadata: PresetsIndexSettings["presetsFileMetadata"][string] | undefined =
            this._settings.presetsFileMetadata[propertyName];
        if (!metadata) {
            console.error(`Parcing preset: no metadata for the property '${propertyName}'`);
            return;
        }

        switch (metadata.type) {
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
                console.error(
                    `Parcing preset: unknown property type '${metadata.type}' for the property '${propertyName}'`,
                );
        }
    }

    // The value's type comes from the index metadata at run time, so these write through a plain record.
    _fields(preset: PresetBeingParsed): Record<string, unknown> {
        return preset as unknown as Record<string, unknown>;
    }

    _processParserProperty(preset: PresetBeingParsed, line: string, propertyName: PresetPropertyName): void {
        this._fields(preset)[propertyName] = line;
    }

    _processBooleanProperty(preset: PresetBeingParsed, line: string, propertyName: PresetPropertyName): void {
        const trueValues = ["true", "yes"];

        const lineLowCase = line.toLowerCase();
        let result = false;

        if (trueValues.includes(lineLowCase)) {
            result = true;
        }

        this._fields(preset)[propertyName] = result;
    }

    _processArrayProperty(preset: PresetBeingParsed, line: string, propertyName: PresetPropertyName): void {
        const fields = this._fields(preset);

        if (!fields[propertyName]) {
            fields[propertyName] = [];
        }

        (fields[propertyName] as string[]).push(line);
    }

    _processStringProperty(preset: PresetBeingParsed, line: string, propertyName: PresetPropertyName): void {
        this._fields(preset)[propertyName] = line;
    }

    _getOptionName(line: string): string {
        const directiveRemoved = line.slice(this._settings.OptionsDirectives.BEGIN_OPTION_DIRECTIVE.length).trim();
        const regExpRemoveChecked = new RegExp(
            this._escapeRegex(`${this._settings.OptionsDirectives.OPTION_CHECKED}:`),
            "gi",
        );
        const regExpRemoveUnchecked = new RegExp(
            this._escapeRegex(`${this._settings.OptionsDirectives.OPTION_UNCHECKED}:`),
            "gi",
        );
        let optionName = directiveRemoved.replace(regExpRemoveChecked, "");
        optionName = optionName.replace(regExpRemoveUnchecked, "").trim();
        return optionName;
    }

    _escapeRegex(string: string): string {
        return string.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
    }

    removeUncheckedOptions(strings: string[], checkedOptions: string[]): string[] {
        let resultStrings: string[] = [];
        let isCurrentOptionExcluded = false;
        const lowerCasedCheckedOptions = new Set(checkedOptions.map((optionName) => optionName.toLowerCase()));

        strings.forEach((str) => {
            if (this._isLineAttribute(str)) {
                const line = this._removeAttributeDirective(str);

                if (this._isOptionBegin(line)) {
                    const optionNameLowCase = this._getOptionName(line).toLowerCase();

                    if (!lowerCasedCheckedOptions.has(optionNameLowCase)) {
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

    _removeExcessiveEmptyLines(strings: string[]): string[] {
        // removes empty lines if there are two or more in a row leaving just one empty line
        const result: string[] = [];
        let lastStringEmpty = false;

        strings.forEach((str) => {
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

    _isLineAttribute(line: string): boolean {
        return line.trim().startsWith(this._settings.MetapropertyDirective);
    }

    _isOptionBegin(line: string): boolean {
        const lowCaseLine = line.toLowerCase();
        return lowCaseLine.startsWith(this._settings.OptionsDirectives.BEGIN_OPTION_DIRECTIVE);
    }

    _isOptionEnd(line: string): boolean {
        const lowCaseLine = line.toLowerCase();
        return lowCaseLine.startsWith(this._settings.OptionsDirectives.END_OPTION_DIRECTIVE);
    }

    _removeAttributeDirective(line: string): string {
        return line.trim().slice(this._settings.MetapropertyDirective.length).trim();
    }

    isIncludeFound(strings: string[]): boolean {
        for (const str of strings) {
            const match = PresetParser._sRegExpInclude.exec(str);

            if (match !== null) {
                return true;
            }
        }

        return false;
    }
}
