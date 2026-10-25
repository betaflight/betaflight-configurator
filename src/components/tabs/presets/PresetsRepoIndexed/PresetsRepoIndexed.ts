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

import type { Preset } from "../../../../stores/presets";
import PresetParser, { type ParsedPreset, type PresetsIndexSettings } from "./PresetParser";

/** A presets repository's index.json, as written by the firmware-presets indexer. */
export interface PresetsIndex {
    majorVersion: number;
    minorVersion: number;
    uniqueValues: {
        firmware_version: string[];
        category: string[];
        author: string[];
        keywords: string[];
    };
    settings: PresetsIndexSettings;
    presets: Preset[];
}

/** A repository whose index.json has loaded, so its `index` is not null. */
export type LoadedPresetsRepo<R extends PresetsRepoIndexed = PresetsRepoIndexed> = R & { readonly index: PresetsIndex };

export function hasLoadedIndex<R extends PresetsRepoIndexed>(repository: R): repository is LoadedPresetsRepo<R> {
    return repository.index !== null;
}

// No `private` members, for the same reason as PresetParser: the presets store keeps repositories in a ref().
export default class PresetsRepoIndexed {
    _urlRaw: string;
    _urlViewOnline: string;
    _index: PresetsIndex | null;
    _name: string;
    _official: boolean;
    _settings: PresetsIndexSettings | undefined;
    _PresetParser: PresetParser | undefined;

    constructor(urlRaw: string, urlViewOnline: string, official: boolean, name: string) {
        this._urlRaw = urlRaw;
        this._urlViewOnline = urlViewOnline;
        this._index = null;
        this._name = name;
        this._official = official;
    }

    /** The loaded index.json; null until loadIndex() resolves. Narrow with hasLoadedIndex(). */
    get index(): PresetsIndex | null {
        return this._index;
    }

    get official(): boolean {
        return this._official;
    }

    get name(): string {
        return this._name;
    }

    /** The parser built from the index settings; it exists once loadIndex() has resolved. */
    get _parser(): PresetParser {
        if (!this._PresetParser) {
            throw new Error(`Presets repository '${this._name}': loadIndex() has not resolved`);
        }
        return this._PresetParser;
    }

    loadIndex(): Promise<void> {
        return fetch(`${this._urlRaw}index.json`, { cache: "no-cache" })
            .then((res) => res.json())
            .then((out: PresetsIndex) => {
                this._index = out;
                this._settings = this._index.settings;
                this._PresetParser = new PresetParser(this._index.settings);
            });
    }

    getPresetOnlineLink(preset: Preset): string {
        return this._urlViewOnline + preset.fullPath;
    }

    removeUncheckedOptions(strings: string[], checkedOptions: string[]): string[] {
        return this._parser.removeUncheckedOptions(strings, checkedOptions);
    }

    _parceInclude(strings: string[], includeRowIndexes: number[], promises: Promise<string>[]): void {
        for (let i = 0; i < strings.length; i++) {
            const match = PresetParser._sRegExpInclude.exec(strings[i]);

            if (match?.groups) {
                includeRowIndexes.push(i);
                const filePath = this._urlRaw + match.groups.filePath;
                const promise = this._loadPresetText(filePath);
                promises.push(promise);
            }
        }
    }

    _executeIncludeOnce(strings: string[]): Promise<string[]> {
        const includeRowIndexes: number[] = []; // row indexes with "#include" statements
        const promises: Promise<string>[] = []; // promises to load included files
        this._parceInclude(strings, includeRowIndexes, promises);

        return Promise.all(promises).then((includedTexts) => {
            for (let i = 0; i < includedTexts.length; i++) {
                strings[includeRowIndexes[i]] = includedTexts[i];
            }

            const text = strings.join("\n");
            return text.split("\n").map((str) => str.trim());
        });
    }

    _executeIncludeNested(strings: string[]): Promise<string[]> {
        const isIncludeFound = this._parser.isIncludeFound(strings);

        if (isIncludeFound) {
            return this._executeIncludeOnce(strings).then((resultStrings) => this._executeIncludeNested(resultStrings));
        } else {
            return Promise.resolve(strings);
        }
    }

    loadPreset(preset: ParsedPreset): Promise<void> {
        const promiseMainText = this._loadPresetText(this._urlRaw + preset.fullPath);

        return promiseMainText
            .then((text) => {
                let strings = text.split("\n");
                strings = strings.map((str) => str.trim());
                this._parser.readPresetProperties(preset, strings);
                return strings;
            })
            .then((strings) => this._executeIncludeNested(strings))
            .then((strings) => {
                preset.originalPresetCliStrings = strings;
                return this._loadPresetWarning(preset);
            });
    }

    _loadPresetWarning(preset: ParsedPreset): Promise<void> {
        let completeWarning = "";

        if (preset.warning) {
            completeWarning += (completeWarning ? "\n" : "") + preset.warning;
        }

        if (preset.disclaimer) {
            completeWarning += (completeWarning ? "\n" : "") + preset.disclaimer;
        }

        const allFiles = [preset.include_warning, preset.include_disclaimer]
            .filter((files): files is string[] => Array.isArray(files))
            .flat();

        return this._loadFilesInOneText(allFiles).then((text) => {
            completeWarning += (completeWarning ? "\n" : "") + text;
            preset.completeWarning = completeWarning;
        });
    }

    _loadFilesInOneText(fileUrls: string[]): Promise<string> {
        const loadPromises: Promise<string>[] = [];

        fileUrls.forEach((url) => {
            const filePath = this._urlRaw + url;
            loadPromises.push(this._loadPresetText(filePath));
        });

        return Promise.all(loadPromises).then((texts) => {
            return texts.join("\n");
        });
    }

    _loadPresetText(fullUrl: string): Promise<string> {
        return new Promise((resolve, reject) => {
            fetch(fullUrl, { cache: "no-cache" })
                .then((res) => res.text())
                .then((text) => resolve(text))
                .catch((err) => {
                    console.error(err);
                    reject(err);
                });
        });
    }
}
