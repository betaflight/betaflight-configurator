import PresetSource from "../components/tabs/presets/SourcesDialog/PresetSource";

export const PRESETS_MAX_RESULTS = 60;
export const PRESETS_STORAGE_KEYS = {
    favoritePresets: "FavoritePresetsList",
    sources: "PresetSources",
    activeSourceIndexes: "PresetSourcesActiveIndexes",
    showBackupWarning: "showPresetsWarningBackup",
};

/** An option as parsed by PresetParser; `id` is attached by attachOptionIds() when the details open. */
export type PresetOption = {
    id?: string;
    name: string;
    checked?: boolean;
    childs?: PresetOption[];
};

export type IdentifiedPresetOption = Omit<PresetOption, "id" | "childs"> & {
    id: string;
    childs?: IdentifiedPresetOption[];
};

/** A preset as listed in a repository's index.json, plus the fields loadPreset() fills in. */
export type Preset = {
    hash?: string;
    fullPath?: string;
    title?: string;
    description?: string[];
    priority?: number;
    status?: string;
    category?: string;
    keywords?: string[];
    author?: string;
    firmware_version?: string[];
    hidden?: boolean;
    force_options_review?: boolean;
    completeWarning?: string;
    options?: PresetOption[];
    originalPresetCliStrings?: string[];
};

export type PresetSourceEntry = {
    id: string;
    name: string;
    url: string;
    gitHubBranch: string;
    official: boolean;
};

export type PresetSearchParams = {
    categories: string[];
    keywords: string[];
    authors: string[];
    firmwareVersions: string[];
    status: string[];
    searchString: string;
};

export interface PresetLinkSource {
    getPresetOnlineLink(preset: Preset): string;
}

export interface PresetIndexSource extends PresetLinkSource {
    readonly index: { presets: Preset[] };
}

export interface FirmwareVersionSource {
    readonly index: { uniqueValues: { firmware_version: string[] } };
}

export type PresetFitEntry<R> = {
    key: string;
    preset: Preset;
    repository: R;
};

export type PresetEntryState = {
    favoriteDate?: number;
};

export type PresetEntryStateGetter<R, S extends PresetEntryState> = (
    preset: Preset,
    repository: R,
    presetKey: string,
) => S;

type PresetSortEntry = PresetEntryState & {
    preset: Pick<Preset, "priority" | "title">;
};

type StoredPresetSource = Omit<PresetSourceEntry, "id"> & { id?: string };

const OFFICIAL_SOURCE_ID = "presets-official-source";
const BACKUP_SOURCE_ID = "presets-backup-source";
let sourceIdSequence = 0;

export function createSourceId(): string {
    sourceIdSequence += 1;
    return `presets-source-${Date.now().toString(36)}-${sourceIdSequence.toString(36)}`;
}

export function createOfficialSource(): PresetSource {
    const officialSource = new PresetSource(
        "Betaflight Official Presets",
        "https://presets.betaflight.com/firmware-presets/",
        "",
        OFFICIAL_SOURCE_ID,
    );
    officialSource.official = true;
    return officialSource;
}

export function createSecondaryOfficialSource(): PresetSource {
    const backupSource = new PresetSource(
        "Betaflight Presets - GitHub BACKUP",
        "https://github.com/betaflight/firmware-presets",
        "backup",
        BACKUP_SOURCE_ID,
    );
    backupSource.official = false;
    return backupSource;
}

export function normalizeStoredSources(storedSources: unknown): PresetSourceEntry[] {
    const officialSource = createOfficialSource();
    const secondaryOfficialSource = createSecondaryOfficialSource();
    let sources: PresetSourceEntry[] = Array.isArray(storedSources)
        ? storedSources.map((source: StoredPresetSource) => ({
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

export function sanitizeActiveSourceIndexes(storedIndexes: unknown, sourceCount: number): number[] {
    const sanitizedIndexes = Array.isArray(storedIndexes)
        ? storedIndexes.filter(
              (index: unknown): index is number =>
                  typeof index === "number" && Number.isInteger(index) && index >= 0 && index < sourceCount,
          )
        : [];

    return sanitizedIndexes.length > 0 ? sanitizedIndexes : [0];
}

export function sanitizeActiveSourceIds(
    activeSourceIds: unknown,
    sources: readonly Pick<PresetSourceEntry, "id">[],
): string[] {
    const validSourceIds = new Set(sources.map((source) => source.id));
    const sanitizedIds = Array.isArray(activeSourceIds)
        ? activeSourceIds.filter(
              (sourceId: unknown): sourceId is string => typeof sourceId === "string" && validSourceIds.has(sourceId),
          )
        : [];

    return sanitizedIds.length > 0 ? sanitizedIds : [sources[0]?.id].filter((id): id is string => Boolean(id));
}

export function getPresetEntryKey(preset: Preset, repository: PresetLinkSource): string {
    return repository.getPresetOnlineLink(preset);
}

export function collectUniqueValues<R, T>(repositories: readonly R[], extractor: (repository: R) => Iterable<T>): T[] {
    const values = repositories.map(extractor);
    return [...values.reduce((result, value) => new Set([...result, ...value]), new Set<T>())].sort((a, b) =>
        String(a).localeCompare(String(b), undefined, { sensitivity: "base" }),
    );
}

export function getDefaultFirmwareSelections(
    repositories: readonly FirmwareVersionSource[],
    currentVersion: string | undefined,
): string[] {
    const selectedVersions: string[] = [];

    for (const repository of repositories) {
        for (const firmwareVersion of repository.index.uniqueValues.firmware_version) {
            if (currentVersion?.startsWith(firmwareVersion)) {
                selectedVersions.push(firmwareVersion);
            }
        }
    }

    return [...new Set(selectedVersions)];
}

export function getCheckedOptionNames(options: readonly PresetOption[]): string[] {
    const selected: string[] = [];

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

export function attachOptionIds(options: readonly PresetOption[], path: number[] = []): IdentifiedPresetOption[] {
    return options.map((option, index) => {
        const optionId = [...path, index].join(".");
        const normalizedOption = {
            ...option,
            id: optionId,
        } as IdentifiedPresetOption;

        if (Array.isArray(option.childs)) {
            normalizedOption.childs = attachOptionIds(option.childs, [...path, index]);
        }

        return normalizedOption;
    });
}

export function getCheckedOptionIds(options: readonly IdentifiedPresetOption[]): string[] {
    const selected: string[] = [];

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

export function getOptionNamesByIds(options: readonly PresetOption[], selectedOptionIds: Iterable<string>): string[] {
    const selectedIds = new Set<string | undefined>(selectedOptionIds);
    const selectedNames: string[] = [];

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

export function applySelectedOptionIdsToOptions(
    options: readonly PresetOption[],
    selectedOptionIds: Iterable<string>,
): PresetOption[] {
    const selectedIds = new Set<string | undefined>(selectedOptionIds);

    return options.map((option) => {
        const normalizedOption: PresetOption = { ...option };

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

export function clonePresetForDetails<T>(preset: T): T {
    if (typeof structuredClone === "function") {
        try {
            return structuredClone(preset);
        } catch {
            // Fall back for reactive proxies and other non-cloneable wrappers.
        }
    }

    return JSON.parse(JSON.stringify(preset));
}

export function presetSearchPriorityComparer(entryA: PresetSortEntry, entryB: PresetSortEntry): number {
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

export function isPresetFitSearchStatuses(preset: Preset, searchParams: PresetSearchParams): boolean {
    const statuses: readonly (string | undefined)[] = searchParams.status;
    return statuses.length === 0 || statuses.includes(preset.status);
}

export function isPresetFitSearchCategories(preset: Preset, searchParams: PresetSearchParams): boolean {
    if (searchParams.categories.length === 0) {
        return true;
    }

    return preset.category !== undefined && searchParams.categories.includes(preset.category);
}

export function isPresetFitSearchKeywords(preset: Preset, searchParams: PresetSearchParams): boolean {
    if (searchParams.keywords.length === 0) {
        return true;
    }

    const presetKeywords = preset.keywords;
    if (!Array.isArray(presetKeywords)) {
        return false;
    }

    const keywordsIntersection = searchParams.keywords.filter((value) => presetKeywords.includes(value));
    return keywordsIntersection.length > 0;
}

export function isPresetFitSearchAuthors(preset: Preset, searchParams: PresetSearchParams): boolean {
    if (searchParams.authors.length === 0) {
        return true;
    }

    return preset.author !== undefined && searchParams.authors.includes(preset.author.toLowerCase());
}

export function isPresetFitSearchFirmwareVersions(preset: Preset, searchParams: PresetSearchParams): boolean {
    if (searchParams.firmwareVersions.length === 0) {
        return true;
    }

    const presetVersions = preset.firmware_version;
    if (!Array.isArray(presetVersions)) {
        return false;
    }

    const versionsIntersection = searchParams.firmwareVersions.filter((value) => presetVersions.includes(value));
    return versionsIntersection.length > 0;
}

export function isPresetFitSearchString(preset: Preset, searchParams: PresetSearchParams): boolean {
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

export function isPresetFitSearch(preset: Preset, searchParams: PresetSearchParams): boolean {
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

export function getFitPresets<R extends PresetIndexSource>(
    repositories: readonly R[],
    searchParams: PresetSearchParams,
): PresetFitEntry<R>[];
export function getFitPresets<R extends PresetIndexSource, S extends PresetEntryState>(
    repositories: readonly R[],
    searchParams: PresetSearchParams,
    getPresetEntryState: PresetEntryStateGetter<R, S>,
): (PresetFitEntry<R> & S)[];
export function getFitPresets<R extends PresetIndexSource>(
    repositories: readonly R[],
    searchParams: PresetSearchParams,
    getPresetEntryState?: PresetEntryStateGetter<R, PresetEntryState>,
): (PresetFitEntry<R> & PresetEntryState)[] {
    const result: (PresetFitEntry<R> & PresetEntryState)[] = [];
    const seenHashes = new Set<string | undefined>();

    for (const repository of repositories) {
        for (const preset of repository.index.presets) {
            if (isPresetFitSearch(preset, searchParams) && !seenHashes.has(preset.hash)) {
                const presetKey = getPresetEntryKey(preset, repository);
                result.push({
                    key: presetKey,
                    preset,
                    repository,
                    ...getPresetEntryState?.(preset, repository, presetKey),
                });
                seenHashes.add(preset.hash);
            }
        }
    }

    result.sort(presetSearchPriorityComparer);
    return result;
}
