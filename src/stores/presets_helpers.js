import PresetSource from "../tabs/presets/SourcesDialog/PresetSource";

export const PRESETS_MAX_RESULTS = 60;
export const PRESETS_STORAGE_KEYS = {
    favoritePresets: "FavoritePresetsList",
    sources: "PresetSources",
    activeSourceIndexes: "PresetSourcesActiveIndexes",
    showBackupWarning: "showPresetsWarningBackup",
};

export function createOfficialSource() {
    const officialSource = new PresetSource(
        "Betaflight Official Presets",
        "https://presets.betaflight.com/firmware-presets/",
        "",
    );
    officialSource.official = true;
    return officialSource;
}

export function createSecondaryOfficialSource() {
    const backupSource = new PresetSource(
        "Betaflight Presets - GitHub BACKUP",
        "https://github.com/betaflight/firmware-presets",
        "backup",
    );
    backupSource.official = false;
    return backupSource;
}

export function normalizeStoredSources(storedSources) {
    const officialSource = createOfficialSource();
    const secondaryOfficialSource = createSecondaryOfficialSource();
    let sources = Array.isArray(storedSources)
        ? storedSources.map((source) => ({ ...source }))
        : [officialSource, secondaryOfficialSource];

    if (sources.length === 0) {
        sources = [officialSource, secondaryOfficialSource];
    } else {
        sources[0] = officialSource;
        if (sources.length === 1) {
            sources.push(secondaryOfficialSource);
        }
    }

    return sources;
}

export function sanitizeActiveSourceIndexes(storedIndexes, sourceCount) {
    const sanitizedIndexes = Array.isArray(storedIndexes)
        ? storedIndexes.filter((index) => Number.isInteger(index) && index >= 0 && index < sourceCount)
        : [];

    return sanitizedIndexes.length > 0 ? sanitizedIndexes : [0];
}

export function collectUniqueValues(repositories, extractor) {
    const values = repositories.map(extractor);
    return [...values.reduce((result, value) => new Set([...result, ...value]), new Set())].sort((a, b) =>
        String(a).localeCompare(String(b), undefined, { sensitivity: "base" }),
    );
}

export function getDefaultFirmwareSelections(repositories, currentVersion) {
    const selectedVersions = [];

    for (const repository of repositories) {
        for (const firmwareVersion of repository.index.uniqueValues.firmware_version) {
            if (currentVersion?.startsWith(firmwareVersion)) {
                selectedVersions.push(firmwareVersion);
            }
        }
    }

    return [...new Set(selectedVersions)];
}

export function getCheckedOptionNames(options) {
    const selected = [];

    options.forEach((option) => {
        if (Array.isArray(option.childs)) {
            option.childs.forEach((child) => {
                if (child.checked) {
                    selected.push(child.name);
                }
            });
            return;
        }

        if (option.checked) {
            selected.push(option.name);
        }
    });

    return selected;
}

export function presetSearchPriorityComparer(presetA, presetB) {
    if (presetA.lastPickDate && presetB.lastPickDate) {
        return presetB.lastPickDate - presetA.lastPickDate;
    }

    if (presetA.lastPickDate || presetB.lastPickDate) {
        return presetA.lastPickDate ? -1 : 1;
    }

    const priorityA = presetA.priority ?? 0;
    const priorityB = presetB.priority ?? 0;

    if (priorityA !== priorityB) {
        return priorityB - priorityA;
    }

    return String(presetA.title ?? "").localeCompare(String(presetB.title ?? ""), undefined, {
        sensitivity: "base",
    });
}

export function isPresetFitSearchStatuses(preset, searchParams) {
    return searchParams.status.length === 0 || searchParams.status.includes(preset.status);
}

export function isPresetFitSearchCategories(preset, searchParams) {
    if (searchParams.categories.length === 0) {
        return true;
    }

    return preset.category !== undefined && searchParams.categories.includes(preset.category);
}

export function isPresetFitSearchKeywords(preset, searchParams) {
    if (searchParams.keywords.length === 0) {
        return true;
    }

    if (!Array.isArray(preset.keywords)) {
        return false;
    }

    const keywordsIntersection = searchParams.keywords.filter((value) => preset.keywords.includes(value));
    return keywordsIntersection.length > 0;
}

export function isPresetFitSearchAuthors(preset, searchParams) {
    if (searchParams.authors.length === 0) {
        return true;
    }

    return preset.author !== undefined && searchParams.authors.includes(preset.author.toLowerCase());
}

export function isPresetFitSearchFirmwareVersions(preset, searchParams) {
    if (searchParams.firmwareVersions.length === 0) {
        return true;
    }

    if (!Array.isArray(preset.firmware_version)) {
        return false;
    }

    const versionsIntersection = searchParams.firmwareVersions.filter((value) =>
        preset.firmware_version.includes(value),
    );
    return versionsIntersection.length > 0;
}

export function isPresetFitSearchString(preset, searchParams) {
    if (!searchParams.searchString) {
        return true;
    }

    const allKeywords = Array.isArray(preset.keywords) ? preset.keywords.join(" ") : "";
    const allVersions = Array.isArray(preset.firmware_version) ? preset.firmware_version.join(" ") : "";
    const totalLine = [preset.description, allKeywords, preset.title, preset.author, allVersions, preset.category]
        .join("\n")
        .toLowerCase()
        .replace("''", '"');
    const allWords = searchParams.searchString.toLowerCase().replace("''", '"').split(" ");

    return allWords.every((word) => totalLine.includes(word));
}

export function isPresetFitSearch(preset, searchParams) {
    if (preset.hidden) {
        return false;
    }

    return (
        isPresetFitSearchStatuses(preset, searchParams) &&
        isPresetFitSearchCategories(preset, searchParams) &&
        isPresetFitSearchKeywords(preset, searchParams) &&
        isPresetFitSearchAuthors(preset, searchParams) &&
        isPresetFitSearchFirmwareVersions(preset, searchParams) &&
        isPresetFitSearchString(preset, searchParams)
    );
}

export function getFitPresets(repositories, searchParams) {
    const result = [];
    const seenHashes = new Set();

    for (const repository of repositories) {
        for (const preset of repository.index.presets) {
            if (isPresetFitSearch(preset, searchParams) && !seenHashes.has(preset.hash)) {
                result.push([preset, repository]);
                seenHashes.add(preset.hash);
            }
        }
    }

    result.sort((presetA, presetB) => presetSearchPriorityComparer(presetA[0], presetB[0]));
    return result;
}
