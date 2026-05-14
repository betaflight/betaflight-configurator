import PresetSource from "../components/tabs/presets/SourcesDialog/PresetSource";

export const PRESETS_MAX_RESULTS = 60;
export const PRESETS_STORAGE_KEYS = {
    favoritePresets: "FavoritePresetsList",
    sources: "PresetSources",
    activeSourceIndexes: "PresetSourcesActiveIndexes",
    showBackupWarning: "showPresetsWarningBackup",
};

const OFFICIAL_SOURCE_ID = "presets-official-source";
const BACKUP_SOURCE_ID = "presets-backup-source";
let sourceIdSequence = 0;

export function createSourceId() {
    sourceIdSequence += 1;
    return `presets-source-${Date.now().toString(36)}-${sourceIdSequence.toString(36)}`;
}

export function createOfficialSource() {
    const officialSource = new PresetSource(
        "Betaflight Official Presets",
        "https://presets.betaflight.com/firmware-presets/",
        "",
        OFFICIAL_SOURCE_ID,
    );
    officialSource.official = true;
    return officialSource;
}

export function createSecondaryOfficialSource() {
    const backupSource = new PresetSource(
        "Betaflight Presets - GitHub BACKUP",
        "https://github.com/betaflight/firmware-presets",
        "backup",
        BACKUP_SOURCE_ID,
    );
    backupSource.official = false;
    return backupSource;
}

export function normalizeStoredSources(storedSources) {
    const officialSource = createOfficialSource();
    const secondaryOfficialSource = createSecondaryOfficialSource();
    let sources = Array.isArray(storedSources)
        ? storedSources.map((source) => ({
            ...source,
            id: source.id || createSourceId(),
        }))
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

export function sanitizeActiveSourceIds(activeSourceIds, sources) {
    const validSourceIds = new Set(sources.map((source) => source.id));
    const sanitizedIds = Array.isArray(activeSourceIds)
        ? activeSourceIds.filter((sourceId) => typeof sourceId === "string" && validSourceIds.has(sourceId))
        : [];

    return sanitizedIds.length > 0 ? sanitizedIds : [sources[0]?.id].filter(Boolean);
}

export function getPresetEntryKey(preset, repository) {
    return repository.getPresetOnlineLink(preset);
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

export function attachOptionIds(options, path = []) {
    return options.map((option, index) => {
        const optionId = [...path, index].join(".");
        const normalizedOption = {
            ...option,
            id: optionId,
        };

        if (Array.isArray(option.childs)) {
            normalizedOption.childs = attachOptionIds(option.childs, [...path, index]);
        }

        return normalizedOption;
    });
}

export function getCheckedOptionIds(options) {
    const selected = [];

    options.forEach((option) => {
        if (Array.isArray(option.childs)) {
            option.childs.forEach((child) => {
                if (child.checked) {
                    selected.push(child.id);
                }
            });
            return;
        }

        if (option.checked) {
            selected.push(option.id);
        }
    });

    return selected;
}

export function getOptionNamesByIds(options, selectedOptionIds) {
    const selectedIds = new Set(selectedOptionIds);
    const selectedNames = [];

    options.forEach((option) => {
        if (Array.isArray(option.childs)) {
            option.childs.forEach((child) => {
                if (selectedIds.has(child.id)) {
                    selectedNames.push(child.name);
                }
            });
            return;
        }

        if (selectedIds.has(option.id)) {
            selectedNames.push(option.name);
        }
    });

    return selectedNames;
}

export function applySelectedOptionIdsToOptions(options, selectedOptionIds) {
    const selectedIds = new Set(selectedOptionIds);

    return options.map((option) => {
        const normalizedOption = { ...option };

        if (Array.isArray(option.childs)) {
            normalizedOption.childs = option.childs.map((child) => ({
                ...child,
                checked: selectedIds.has(child.id),
            }));
        } else {
            normalizedOption.checked = selectedIds.has(option.id);
        }

        return normalizedOption;
    });
}

export function clonePresetForDetails(preset) {
    if (typeof structuredClone === "function") {
        try {
            return structuredClone(preset);
        } catch {
            // Fall back for reactive proxies and other non-cloneable wrappers.
        }
    }

    return JSON.parse(JSON.stringify(preset));
}

export function presetSearchPriorityComparer(entryA, entryB) {
    if (entryA.favoriteDate && entryB.favoriteDate) {
        return entryB.favoriteDate - entryA.favoriteDate;
    }

    if (entryA.favoriteDate || entryB.favoriteDate) {
        return entryA.favoriteDate ? -1 : 1;
    }

    const priorityA = entryA.preset.priority ?? 0;
    const priorityB = entryB.preset.priority ?? 0;

    if (priorityA !== priorityB) {
        return priorityB - priorityA;
    }

    return String(entryA.preset.title ?? "").localeCompare(String(entryB.preset.title ?? ""), undefined, {
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

export function getFitPresets(repositories, searchParams, getPresetEntryState = () => ({})) {
    const result = [];
    const seenHashes = new Set();

    for (const repository of repositories) {
        for (const preset of repository.index.presets) {
            if (isPresetFitSearch(preset, searchParams) && !seenHashes.has(preset.hash)) {
                const presetKey = getPresetEntryKey(preset, repository);
                result.push({
                    key: presetKey,
                    preset,
                    repository,
                    ...getPresetEntryState(preset, repository, presetKey),
                });
                seenHashes.add(preset.hash);
            }
        }
    }

    result.sort(presetSearchPriorityComparer);
    return result;
}
