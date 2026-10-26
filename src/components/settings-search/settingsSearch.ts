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

export interface SearchFilterEntry {
    tab: string;
    expert?: boolean;
}

export interface SearchRankEntry {
    label: string;
    sectionLabel: string;
    tabLabel: string;
    labelKey: string;
    tab: string;
}

export interface ConfigurationDynamicSetting {
    name: string;
    group?: string;
    mode?: string;
    visible?: boolean;
}

export interface ConfigurationDynamicSearchSources {
    features?: ConfigurationDynamicSetting[];
    dshotConditions?: ConfigurationDynamicSetting[];
    beepers?: ConfigurationDynamicSetting[];
}

export interface DynamicSettingsSearchEntry extends SearchFilterEntry {
    searchId: string;
    labelKey: string;
    sectionKey: string;
}

export function readConfigurationDynamicSettings(source: unknown): ConfigurationDynamicSetting[] {
    if (typeof source !== "object" || source === null || !("_beepers" in source)) {
        return [];
    }

    const entries = (source as { _beepers?: unknown })._beepers;
    return Array.isArray(entries) ? (entries as ConfigurationDynamicSetting[]) : [];
}

export function configurationDynamicSearchId(sectionKey: string, labelKey: string): string {
    return ["configuration", sectionKey, labelKey, "dynamic"].join(":");
}

function createConfigurationDynamicEntry(labelKey: string, sectionKey: string): DynamicSettingsSearchEntry {
    return {
        tab: "configuration",
        searchId: configurationDynamicSearchId(sectionKey, labelKey),
        labelKey,
        sectionKey,
    };
}

export function createConfigurationDynamicSearchEntries({
    features = [],
    dshotConditions = [],
    beepers = [],
}: ConfigurationDynamicSearchSources): DynamicSettingsSearchEntry[] {
    return [
        ...features
            .filter((feature) => feature.mode !== "select" && feature.group === "other")
            .map((feature) => createConfigurationDynamicEntry(`feature${feature.name}`, "configurationFeatures")),
        ...dshotConditions.map((condition) =>
            createConfigurationDynamicEntry(`beeper${condition.name}`, "configurationDshotBeeper"),
        ),
        ...beepers
            .filter((beeper) => beeper.visible !== false)
            .map((beeper) => createConfigurationDynamicEntry(`beeper${beeper.name}`, "configurationBeeper")),
    ];
}

export function filterSearchableSettings<T extends SearchFilterEntry>(
    settings: T[],
    visibleTabNames: Set<string>,
    expertMode: boolean,
): T[] {
    return settings.filter((setting) => visibleTabNames.has(setting.tab) && (!setting.expert || expertMode));
}

export function rankSettings<T extends SearchRankEntry>(
    settings: T[],
    query: string,
    limit = 30,
): Array<T & { matchScore: number }> {
    const search = query.trim().toLowerCase();

    if (!search) {
        return [];
    }

    return settings
        .map((setting) => {
            const label = setting.label.toLowerCase();
            const section = setting.sectionLabel.toLowerCase();
            const tabLabel = setting.tabLabel.toLowerCase();
            const labelKey = setting.labelKey.toLowerCase();
            const tab = setting.tab.toLowerCase();

            let matchScore = Number.POSITIVE_INFINITY;

            if (label === search) {
                matchScore = 0;
            } else if (label.startsWith(search)) {
                matchScore = 1;
            } else if (label.includes(search)) {
                matchScore = 2;
            } else if (section.startsWith(search)) {
                matchScore = 3;
            } else if (section.includes(search)) {
                matchScore = 4;
            } else if (tabLabel.startsWith(search)) {
                matchScore = 5;
            } else if (tabLabel.includes(search)) {
                matchScore = 6;
            } else if (labelKey.includes(search)) {
                matchScore = 7;
            } else if (tab.includes(search)) {
                matchScore = 8;
            }

            return { ...setting, matchScore };
        })
        .filter((setting) => Number.isFinite(setting.matchScore))
        .sort((a, b) => a.matchScore - b.matchScore || a.label.localeCompare(b.label))
        .slice(0, limit);
}
