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

import { describe, expect, it } from "vitest";

import {
    configurationDynamicSearchId,
    createConfigurationDynamicSearchEntries,
    filterSearchableSettings,
    rankSettings,
    type SearchFilterEntry,
    type SearchRankEntry,
} from "../src/components/settings-search/settingsSearch";

interface TestSetting extends SearchFilterEntry, SearchRankEntry {
    searchId: string;
}

const makeSetting = (overrides: Partial<TestSetting> = {}): TestSetting => ({
    tab: "configuration",
    label: "Motor Protocol",
    sectionLabel: "ESC / Motor Features",
    tabLabel: "Configuration",
    labelKey: "configurationMotorProtocol",
    searchId: "configuration::configurationMotorProtocol:1",
    ...overrides,
});

describe("settings search", () => {
    it("filters hidden tabs and expert-only settings", () => {
        const settings = [
            makeSetting({ label: "Visible", tab: "configuration" }),
            makeSetting({ label: "Hidden tab", tab: "receiver" }),
            makeSetting({ label: "Expert", tab: "configuration", expert: true }),
        ];

        expect(
            filterSearchableSettings(settings, new Set(["configuration"]), false).map((setting) => setting.label),
        ).toEqual(["Visible"]);

        expect(
            filterSearchableSettings(settings, new Set(["configuration"]), true).map((setting) => setting.label),
        ).toEqual(["Visible", "Expert"]);
    });

    it("ranks exact, prefix, substring, section, tab, key and tab id matches in order", () => {
        const settings = [
            makeSetting({ label: "Target", labelKey: "exact" }),
            makeSetting({ label: "Target value", labelKey: "prefix" }),
            makeSetting({ label: "My target value", labelKey: "substring" }),
            makeSetting({ label: "Other", sectionLabel: "Target section", labelKey: "section-prefix" }),
            makeSetting({ label: "Other", sectionLabel: "My target section", labelKey: "section-substring" }),
            makeSetting({ label: "Other", tabLabel: "Target tab", labelKey: "tab-prefix" }),
            makeSetting({ label: "Other", tabLabel: "My target tab", labelKey: "tab-substring" }),
            makeSetting({ label: "Other", labelKey: "containsTargetKey" }),
            makeSetting({ label: "Other", tab: "target_tab", labelKey: "tab-id" }),
        ];

        expect(rankSettings(settings, "target").map((setting) => setting.labelKey)).toEqual([
            "exact",
            "prefix",
            "substring",
            "section-prefix",
            "section-substring",
            "tab-prefix",
            "tab-substring",
            "containsTargetKey",
            "tab-id",
        ]);
    });

    it("keeps duplicate occurrences and caps results at 30", () => {
        const settings = Array.from({ length: 35 }, (_, index) =>
            makeSetting({
                label: "Match",
                labelKey: `match-${index}`,
                searchId: `configuration::match:${index}`,
            }),
        );

        const results = rankSettings(settings, "match");

        expect(results).toHaveLength(30);
        expect(results[0].searchId).toBe("configuration::match:0");
        expect(results[29].searchId).toBe("configuration::match:29");
    });

    it("returns no results for an empty query", () => {
        expect(rankSettings([makeSetting()], "   ")).toEqual([]);
    });

    it("builds searchable entries for live dynamic configuration rows", () => {
        const entries = createConfigurationDynamicSearchEntries({
            features: [
                { name: "AIRMODE", group: "other" },
                { name: "RX_SERIAL", group: "rxMode", mode: "select" },
            ],
            dshotConditions: [{ name: "RX_LOST" }],
            beepers: [
                { name: "ARMING", visible: true },
                { name: "MULTI_BEEPS", visible: false },
            ],
        });

        expect(entries.map((entry) => [entry.labelKey, entry.sectionKey])).toEqual([
            ["featureAIRMODE", "configurationFeatures"],
            ["beeperRX_LOST", "configurationDshotBeeper"],
            ["beeperARMING", "configurationBeeper"],
        ]);
        expect(entries[0].searchId).toBe(configurationDynamicSearchId("configurationFeatures", "featureAIRMODE"));
    });
});
