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

import { defineStore } from "pinia";
import { computed, reactive, ref } from "vue";
import { get as getConfig, set as setConfig } from "../js/ConfigStorage";
import { i18n } from "../js/localization";
import { useFlightControllerStore } from "./fc";
import { escapeHtml } from "../js/utils/common";
import { useDialogStore } from "./dialog";
import * as favoritePresetsModule from "../components/tabs/presets/FavoritePresets";
import PickedPreset from "../components/tabs/presets/PickedPreset";
import PresetsGithubRepo from "../components/tabs/presets/PresetsRepoIndexed/PresetsGithubRepo";
import PresetsWebsiteRepo from "../components/tabs/presets/PresetsRepoIndexed/PresetsWebsiteRepo";
import PresetSource from "../components/tabs/presets/SourcesDialog/PresetSource";
import {
    PRESETS_MAX_RESULTS,
    PRESETS_STORAGE_KEYS,
    applySelectedOptionIdsToOptions,
    attachOptionIds,
    clonePresetForDetails,
    collectUniqueValues,
    createSourceId,
    getCheckedOptionIds,
    getDefaultFirmwareSelections,
    getFitPresets,
    getOptionNamesByIds,
    getPresetEntryKey,
    normalizeStoredSources,
    sanitizeActiveSourceIds,
    sanitizeActiveSourceIndexes,
} from "./presets_helpers";

type PresetRepository = PresetsGithubRepo | PresetsWebsiteRepo;

/** An option as parsed by PresetParser; `id` is attached by attachOptionIds() when the details open. */
export type PresetOption = {
    id?: string;
    name: string;
    checked?: boolean;
    childs?: PresetOption[];
};

/** A preset as listed in a repository's index.json, plus the fields loadPreset() fills in. */
export type Preset = {
    hash?: string;
    fullPath?: string;
    title?: string;
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

export type PresetEntry = {
    key: string;
    preset: Preset;
    repository: PresetRepository;
};

export type PresetSearchEntry = PresetEntry & {
    favoriteDate: number | undefined;
    isPicked: boolean;
};

export type PresetCliFailure = {
    command: string;
    response: string[];
};

type PresetSearchParams = {
    categories: string[];
    keywords: string[];
    authors: string[];
    firmwareVersions: string[];
    status: string[];
    searchString: string;
};

type FavoritePresetsApi = {
    add(preset: Preset, repo: PresetRepository): number;
    delete(preset: Preset, repo: PresetRepository): void;
    getLastPickDate(preset: Preset, repo: PresetRepository): number | undefined;
    saveToStorage(): void;
    loadFromStorage(): void;
};

// FavoritePresets.js exports its singleton through an unannotated `let`, so it arrives as an
// implicit `any`; this gives the store a typed view of the same object.
const favoritePresets: FavoritePresetsApi = favoritePresetsModule.favoritePresets;

// presets_helpers.js infers the callback as `() => {}` from its default, which rejects any
// callback that takes the arguments getFitPresets() actually passes; same function, typed.
const getFitPresetEntries = getFitPresets as unknown as (
    repositories: readonly PresetRepository[],
    searchParams: PresetSearchParams,
    getPresetEntryState: (
        preset: Preset,
        repository: PresetRepository,
        presetKey: string,
    ) => Pick<PresetSearchEntry, "favoriteDate" | "isPicked">,
) => PresetSearchEntry[];

function createRepositoryFromSource(source: PresetSourceEntry): PresetRepository {
    if (PresetSource.isUrlGithubRepo(source.url)) {
        return new PresetsGithubRepo(source.url, source.gitHubBranch ?? "", source.official, source.name);
    }

    return new PresetsWebsiteRepo(source.url, source.official, source.name);
}

function getSourceIndexById(sourceId: string, availableSources: readonly PresetSourceEntry[]) {
    return availableSources.findIndex((source) => source.id === sourceId);
}

export const usePresetsStore = defineStore("presets", () => {
    const majorVersion = 1;
    const repositories = ref<PresetRepository[]>([]);
    const failedRepositoryNames = ref<string[]>([]);
    const sources = ref<PresetSourceEntry[]>([]);
    const activeSourceIds = ref<string[]>([]);
    const pickedPresetList = ref<PickedPreset[]>([]);
    const favoritePresetDates = ref<Record<string, number>>({});

    const isLoading = ref(false);
    const hasLoadError = ref(false);
    const backupWarningVisible = ref(true);
    const showSourcesDialog = ref(false);

    const filters = reactive({
        categories: [] as string[],
        keywords: [] as string[],
        authors: [] as string[],
        firmwareVersions: [] as string[],
        status: [] as string[],
        searchString: "",
    });

    const filterOptions = reactive({
        categories: [] as string[],
        keywords: [] as string[],
        authors: [] as string[],
        firmwareVersions: [] as string[],
        status: [] as string[],
    });

    const detailsState = reactive({
        open: false,
        loading: false,
        error: "",
        showCli: false,
        optionsExpanded: false,
        optionsReviewed: false,
        selectedOptionIds: [] as string[],
    });

    const applyState = reactive({
        progress: 0,
        progressDialogOpen: false,
        cliErrorsDialogOpen: false,
        cliErrorsSavePressed: false,
        cliErrors: [] as PresetCliFailure[],
    });

    const selectedPresetEntry = ref<PresetEntry | null>(null);
    let detailsRequestToken = 0;

    const activeSourceIndexes = computed(() =>
        activeSourceIds.value
            .map((sourceId) => getSourceIndexById(sourceId, sources.value))
            .filter((index) => index >= 0),
    );

    const activeSources = computed(() =>
        activeSourceIds.value
            .map((sourceId) => sources.value.find((source) => source.id === sourceId))
            .filter((source): source is PresetSourceEntry => source !== undefined),
    );

    const pickedPresetKeys = computed(
        () => new Set(pickedPresetList.value.map((pickedPreset) => pickedPreset.presetKey).filter(Boolean)),
    );

    const isThirdPartyActive = computed(() => activeSources.value.some((source) => !source.official));

    const failedRepositoriesMessage = computed(() =>
        failedRepositoryNames.value.length
            ? i18n.getMessage("presetsFailedToLoadRepositories", {
                  repos: failedRepositoryNames.value.join("; "),
              })
            : "",
    );

    const searchParams = computed<PresetSearchParams>(() => ({
        categories: [...filters.categories],
        keywords: [...filters.keywords],
        authors: filters.authors.map((author) => author.toLowerCase()),
        firmwareVersions: [...filters.firmwareVersions],
        status: [...filters.status],
        searchString: filters.searchString.trim(),
    }));

    const filteredPresetEntries = computed(() =>
        getFitPresetEntries(
            repositories.value,
            searchParams.value,
            (preset: Preset, repository: PresetRepository, presetKey: string) => ({
                favoriteDate: favoritePresetDates.value[presetKey],
                isPicked: pickedPresetKeys.value.has(getPresetEntryKey(preset, repository)),
            }),
        ),
    );
    const visiblePresetEntries = computed(() => filteredPresetEntries.value.slice(0, PRESETS_MAX_RESULTS));
    const hasTooManyResults = computed(() => filteredPresetEntries.value.length > PRESETS_MAX_RESULTS);
    const hasNoResults = computed(
        () =>
            !isLoading.value &&
            !hasLoadError.value &&
            repositories.value.length > 0 &&
            visiblePresetEntries.value.length === 0,
    );
    const canApply = computed(() => pickedPresetList.value.length > 0);

    const selectedPreset = computed(() => selectedPresetEntry.value?.preset ?? null);
    const selectedPresetRepository = computed(() => selectedPresetEntry.value?.repository ?? null);
    const selectedPresetOptionLabels = computed(() =>
        getOptionNamesByIds(selectedPreset.value?.options ?? [], detailsState.selectedOptionIds),
    );

    const selectedPresetCliStrings = computed(() => {
        if (!selectedPreset.value || !selectedPresetRepository.value) {
            return [];
        }

        return selectedPresetRepository.value.removeUncheckedOptions(
            selectedPreset.value.originalPresetCliStrings ?? [],
            selectedPresetOptionLabels.value,
        );
    });

    const selectedPresetShowRepoName = computed(() => isThirdPartyActive.value);
    const isSelectedPresetFavorite = computed(() => {
        if (!selectedPresetEntry.value?.key) {
            return false;
        }

        return Boolean(favoritePresetDates.value[selectedPresetEntry.value.key]);
    });
    const isSelectedPresetPicked = computed(() => {
        if (!selectedPresetEntry.value?.key) {
            return false;
        }

        return pickedPresetKeys.value.has(selectedPresetEntry.value.key);
    });

    function syncFavoritePresetDates(nextRepositories = repositories.value) {
        const nextFavoritePresetDates: Record<string, number> = {};

        nextRepositories.forEach((repository) => {
            repository.index.presets.forEach((preset: Preset) => {
                const presetKey = getPresetEntryKey(preset, repository);
                const lastPickDate = favoritePresets.getLastPickDate(preset, repository);

                if (lastPickDate) {
                    nextFavoritePresetDates[presetKey] = lastPickDate;
                }
            });
        });

        favoritePresetDates.value = nextFavoritePresetDates;
    }

    function loadSourceConfiguration() {
        const storedSources = getConfig(PRESETS_STORAGE_KEYS.sources)[PRESETS_STORAGE_KEYS.sources];
        const normalizedSources = normalizeStoredSources(storedSources);
        const storedActiveIndexes = getConfig(PRESETS_STORAGE_KEYS.activeSourceIndexes)[
            PRESETS_STORAGE_KEYS.activeSourceIndexes
        ];

        sources.value = normalizedSources;
        activeSourceIds.value = sanitizeActiveSourceIds(
            sanitizeActiveSourceIndexes(storedActiveIndexes, normalizedSources.length).map(
                (index) => normalizedSources[index]?.id,
            ),
            normalizedSources,
        );
    }

    function saveSourceConfiguration() {
        setConfig({ [PRESETS_STORAGE_KEYS.sources]: sources.value });
        setConfig({ [PRESETS_STORAGE_KEYS.activeSourceIndexes]: activeSourceIndexes.value });
    }

    function loadBackupWarningPreference() {
        const result = getConfig(PRESETS_STORAGE_KEYS.showBackupWarning);
        const storedValue = result[PRESETS_STORAGE_KEYS.showBackupWarning];
        backupWarningVisible.value = storedValue === undefined ? true : Boolean(storedValue);
    }

    function setBackupWarningVisible(value: boolean) {
        backupWarningVisible.value = value;
        setConfig({ [PRESETS_STORAGE_KEYS.showBackupWarning]: value });
    }

    function initialize() {
        favoritePresets.loadFromStorage();
        loadSourceConfiguration();
        loadBackupWarningPreference();
    }

    function buildFilterOptions() {
        filterOptions.categories = collectUniqueValues(
            repositories.value,
            (repo: PresetRepository) => repo.index.uniqueValues.category,
        );
        filterOptions.keywords = collectUniqueValues(
            repositories.value,
            (repo: PresetRepository) => repo.index.uniqueValues.keywords,
        );
        filterOptions.authors = collectUniqueValues(
            repositories.value,
            (repo: PresetRepository) => repo.index.uniqueValues.author,
        );
        filterOptions.firmwareVersions = collectUniqueValues(
            repositories.value,
            (repo: PresetRepository) => repo.index.uniqueValues.firmware_version,
        );
        filterOptions.status = collectUniqueValues(
            repositories.value,
            (repo: PresetRepository) => repo.index.settings.PresetStatusEnum,
        );
    }

    function resetFilters() {
        filters.categories = [];
        filters.keywords = [];
        filters.authors = [];
        filters.status = [];
        filters.searchString = "";
        const fcStore = useFlightControllerStore();
        filters.firmwareVersions = getDefaultFirmwareSelections(
            repositories.value,
            fcStore.CONFIG.flightControllerVersion,
        );
    }

    function clearLoadState() {
        failedRepositoryNames.value = [];
        hasLoadError.value = false;
    }

    function resetDetailsState() {
        detailsRequestToken += 1;
        detailsState.open = false;
        detailsState.loading = false;
        detailsState.error = "";
        detailsState.showCli = false;
        detailsState.optionsExpanded = false;
        detailsState.optionsReviewed = false;
        detailsState.selectedOptionIds = [];
        selectedPresetEntry.value = null;
    }

    function resetApplyState() {
        applyState.progress = 0;
        applyState.progressDialogOpen = false;
        applyState.cliErrorsDialogOpen = false;
        applyState.cliErrorsSavePressed = false;
        applyState.cliErrors = [];
    }

    function resetTransientState() {
        closeSourcesManager();
        resetDetailsState();
        resetApplyState();
    }

    function updateApplyProgress(value: number) {
        applyState.progress = value;
    }

    function openSourcesManager() {
        showSourcesDialog.value = true;
    }

    function closeSourcesManager() {
        showSourcesDialog.value = false;
    }

    function addSource() {
        sources.value = [
            ...sources.value,
            {
                id: createSourceId(),
                name: i18n.getMessage("presetsSourcesDialogDefaultSourceName"),
                url: "",
                gitHubBranch: "",
                official: false,
            },
        ];
        saveSourceConfiguration();
    }

    function updateSource(sourceId: string, source: Record<string, unknown>) {
        const sourceIndex = getSourceIndexById(sourceId, sources.value);

        if (sourceIndex < 0 || sources.value[sourceIndex]?.official) {
            return;
        }

        sources.value = sources.value.map((existingSource) =>
            existingSource.id === sourceId
                ? // The source card emits its draft untyped; it carries name / url / gitHubBranch.
                  ({
                      ...existingSource,
                      ...source,
                      gitHubBranch: source.gitHubBranch ?? "",
                      official: false,
                  } as PresetSourceEntry)
                : existingSource,
        );
        saveSourceConfiguration();
    }

    function deleteSource(sourceId: string) {
        const source = sources.value.find((item) => item.id === sourceId);

        if (!source || source.official) {
            return;
        }

        sources.value = sources.value.filter((item) => item.id !== sourceId);
        activeSourceIds.value = sanitizeActiveSourceIds(
            activeSourceIds.value.filter((activeSourceId) => activeSourceId !== sourceId),
            sources.value,
        );
        saveSourceConfiguration();
    }

    function setSourceActive(sourceId: string, isActive: boolean) {
        const currentSourceIds = new Set(activeSourceIds.value);

        if (isActive) {
            currentSourceIds.add(sourceId);
        } else {
            currentSourceIds.delete(sourceId);
        }

        activeSourceIds.value = sanitizeActiveSourceIds(
            sources.value.map((source) => source.id).filter((sourceIdInOrder) => currentSourceIds.has(sourceIdInOrder)),
            sources.value,
        );
        saveSourceConfiguration();
    }

    async function confirmSourceVersions() {
        const differentMajorVersionRepositories = repositories.value.filter(
            (repository) => repository.index.majorVersion !== majorVersion,
        );

        if (differentMajorVersionRepositories.length === 0) {
            return;
        }

        const versionRequired = `${majorVersion}.X`;
        const versionSource = escapeHtml(
            `${differentMajorVersionRepositories[0].index.majorVersion}.${differentMajorVersionRepositories[0].index.minorVersion}`,
        );

        const dialogStore = useDialogStore();
        await new Promise<void>((resolve, reject) => {
            dialogStore.open(
                "YesNoDialog",
                {
                    title: i18n.getMessage("presetsWarningDialogTitle"),
                    text: i18n.getMessage("presetsVersionMismatch", {
                        versionRequired,
                        versionSource,
                    }),
                    yesText: i18n.getMessage("yes"),
                    noText: i18n.getMessage("no"),
                },
                {
                    yes: () => {
                        dialogStore.close();
                        resolve();
                    },
                    no: () => {
                        dialogStore.close();
                        reject(new Error("Preset source version mismatch"));
                    },
                },
            );
        });
    }

    async function reloadRepositories() {
        clearLoadState();
        resetTransientState();
        clearPickedPresets();
        repositories.value = [];
        isLoading.value = true;

        try {
            const failedNames = new Set<string>();
            const nextRepositories: PresetRepository[] = [];

            activeSources.value.forEach((source) => {
                try {
                    nextRepositories.push(createRepositoryFromSource(source));
                } catch (error) {
                    failedNames.add(source.name);
                    console.error(error);
                }
            });

            await Promise.all(
                nextRepositories.map((repository) =>
                    repository.loadIndex().catch((error: unknown) => {
                        failedNames.add(repository.name);
                        console.error(error);
                        return null;
                    }),
                ),
            );

            repositories.value = nextRepositories.filter((repository) => repository.index !== null);
            failedRepositoryNames.value = [...failedNames];

            await confirmSourceVersions();
            syncFavoritePresetDates(repositories.value);
            buildFilterOptions();
            resetFilters();
        } catch (error) {
            hasLoadError.value = true;
            console.error(error);
        } finally {
            isLoading.value = false;
        }
    }

    function setSearchString(searchString: string) {
        filters.searchString = searchString;
    }

    function toggleFavorite(preset: Preset, repository: PresetRepository) {
        const presetKey = getPresetEntryKey(preset, repository);

        if (favoritePresetDates.value[presetKey]) {
            favoritePresets.delete(preset, repository);
        } else {
            favoritePresets.add(preset, repository);
        }

        favoritePresets.saveToStorage();
        syncFavoritePresetDates();
    }

    async function openPresetDetails(preset: Preset, repository: PresetRepository) {
        const requestToken = detailsRequestToken + 1;
        const presetKey = getPresetEntryKey(preset, repository);

        const existingPickedIndex = pickedPresetList.value.findIndex((p) => p.presetKey === presetKey);

        const presetForDetails = clonePresetForDetails(
            existingPickedIndex !== -1 ? pickedPresetList.value[existingPickedIndex].preset : preset,
        );

        detailsRequestToken = requestToken;
        selectedPresetEntry.value = {
            key: presetKey,
            preset: presetForDetails,
            repository,
        };
        detailsState.open = true;
        detailsState.loading = true;
        detailsState.error = "";
        detailsState.showCli = false;
        detailsState.optionsExpanded = false;
        detailsState.optionsReviewed = false;
        detailsState.selectedOptionIds = [];

        try {
            if (!presetForDetails.originalPresetCliStrings) {
                await repository.loadPreset(presetForDetails);
            }

            if (detailsRequestToken !== requestToken || selectedPresetEntry.value?.key !== presetKey) {
                return;
            }

            presetForDetails.options = attachOptionIds(presetForDetails.options ?? []);
            detailsState.selectedOptionIds = getCheckedOptionIds(presetForDetails.options);
        } catch (error) {
            if (detailsRequestToken !== requestToken || selectedPresetEntry.value?.key !== presetKey) {
                return;
            }

            console.error(error);
            detailsState.error = i18n.getMessage("presetsLoadError");
        } finally {
            if (detailsRequestToken === requestToken && selectedPresetEntry.value?.key === presetKey) {
                detailsState.loading = false;
            }
        }
    }

    function closePresetDetails() {
        resetDetailsState();
    }

    function setDetailsCliVisible(isVisible: boolean) {
        detailsState.showCli = isVisible;
    }

    function setOptionsExpanded(isExpanded: boolean) {
        detailsState.optionsExpanded = isExpanded;
        if (isExpanded) {
            detailsState.optionsReviewed = true;
        }
    }

    function setOptionChecked(optionId: string, isChecked: boolean) {
        if (isChecked) {
            if (!detailsState.selectedOptionIds.includes(optionId)) {
                detailsState.selectedOptionIds = [...detailsState.selectedOptionIds, optionId];
            }
        } else {
            detailsState.selectedOptionIds = detailsState.selectedOptionIds.filter(
                (selectedOptionId) => selectedOptionId !== optionId,
            );
        }
    }

    function setExclusiveOption(groupOptionIds: readonly string[], selectedOptionId: string | null | undefined) {
        const nextSelectedOptions = detailsState.selectedOptionIds.filter(
            (currentOptionId) => !groupOptionIds.includes(currentOptionId),
        );

        if (selectedOptionId) {
            nextSelectedOptions.push(selectedOptionId);
        }

        detailsState.selectedOptionIds = nextSelectedOptions;
    }

    function pickSelectedPreset() {
        if (!selectedPreset.value) {
            return;
        }

        if (selectedPreset.value.options) {
            selectedPreset.value.options = applySelectedOptionIdsToOptions(
                selectedPreset.value.options,
                detailsState.selectedOptionIds,
            );
        }

        appendPickedPreset(
            selectedPreset.value,
            [...selectedPresetCliStrings.value],
            selectedPresetRepository.value ?? undefined,
        );
        closePresetDetails();
    }

    function appendPickedPreset(preset: Preset, cliStrings: string[], presetRepository: PresetRepository | undefined) {
        const presetKey = presetRepository ? getPresetEntryKey(preset, presetRepository) : undefined;
        const pickedPreset = new PickedPreset(preset, cliStrings, presetRepository, presetKey);

        if (presetKey) {
            const existingIndex = pickedPresetList.value.findIndex(
                (p) => p.presetRepo && getPresetEntryKey(p.preset, p.presetRepo) === presetKey,
            );
            if (existingIndex !== -1) {
                const newList = [...pickedPresetList.value];
                newList[existingIndex] = pickedPreset;
                pickedPresetList.value = newList;
                return;
            }
        }

        pickedPresetList.value = [...pickedPresetList.value, pickedPreset];
    }

    function clearPickedPresets() {
        pickedPresetList.value = [];
    }

    function getPickedPresetsCli() {
        return pickedPresetList.value
            .flatMap((pickedPreset) => pickedPreset.presetCli)
            .filter((command) => command.trim() !== "");
    }

    function markPickedPresetsAsFavorites() {
        pickedPresetList.value.forEach((pickedPreset) => {
            if (pickedPreset.presetRepo !== undefined) {
                favoritePresets.add(pickedPreset.preset, pickedPreset.presetRepo);
            }
        });

        favoritePresets.saveToStorage();
        syncFavoritePresetDates();
    }

    function openProgressDialog() {
        applyState.progress = 0;
        applyState.progressDialogOpen = true;
    }

    function closeProgressDialog() {
        applyState.progressDialogOpen = false;
    }

    function openCliErrorsDialog(cliErrors: PresetCliFailure[] = []) {
        applyState.cliErrorsSavePressed = false;
        applyState.cliErrors = cliErrors;
        applyState.cliErrorsDialogOpen = true;
    }

    function closeCliErrorsDialog(savePressed = false) {
        applyState.cliErrorsSavePressed = savePressed;
        applyState.cliErrorsDialogOpen = false;
    }

    function isPresetFavorite(preset: Preset, repository: PresetRepository) {
        return Boolean(favoritePresetDates.value[getPresetEntryKey(preset, repository)]);
    }

    function isPresetPicked(preset: Preset, repository: PresetRepository) {
        return pickedPresetKeys.value.has(getPresetEntryKey(preset, repository));
    }

    return {
        repositories,
        failedRepositoryNames,
        failedRepositoriesMessage,
        sources,
        activeSourceIds,
        activeSourceIndexes,
        activeSources,
        pickedPresetList,
        isLoading,
        hasLoadError,
        backupWarningVisible,
        showSourcesDialog,
        filters,
        filterOptions,
        detailsState,
        applyState,
        selectedPresetEntry,
        selectedPreset,
        selectedPresetRepository,
        selectedPresetOptionLabels,
        selectedPresetCliStrings,
        selectedPresetShowRepoName,
        isSelectedPresetFavorite,
        isSelectedPresetPicked,
        isThirdPartyActive,
        visiblePresetEntries,
        filteredPresetEntries,
        hasTooManyResults,
        hasNoResults,
        canApply,
        initialize,
        reloadRepositories,
        setSearchString,
        setBackupWarningVisible,
        openSourcesManager,
        closeSourcesManager,
        addSource,
        updateSource,
        deleteSource,
        setSourceActive,
        toggleFavorite,
        openPresetDetails,
        closePresetDetails,
        setDetailsCliVisible,
        setOptionsExpanded,
        setOptionChecked,
        setExclusiveOption,
        pickSelectedPreset,
        appendPickedPreset,
        clearPickedPresets,
        getPickedPresetsCli,
        markPickedPresetsAsFavorites,
        updateApplyProgress,
        openProgressDialog,
        closeProgressDialog,
        openCliErrorsDialog,
        closeCliErrorsDialog,
        resetTransientState,
        isPresetFavorite,
        isPresetPicked,
    };
});
