// @vitest-environment node
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
import settingsSearchIndexPlugin, {
    SETTINGS_SEARCH_MODULE_ID,
    analyzeSettingsSearchSource,
} from "../scripts/vite-plugin-settings-search.mjs";

const VIEW = { tab: "configuration", subtab: null };

function sfc(template) {
    return `<template>\n${template}\n</template>\n\n<script setup>\n</script>\n`;
}

function analyze(template, view = VIEW, options = {}) {
    return analyzeSettingsSearchSource(sfc(template), view, options);
}

function loadIndex(pluginOptions) {
    const plugin = settingsSearchIndexPlugin(pluginOptions);
    const warnings = [];
    const resolvedId = plugin.resolveId(SETTINGS_SEARCH_MODULE_ID);
    const code = plugin.load.call({ warn: (message) => warnings.push(message) }, resolvedId);
    const settings = JSON.parse(code.replace(/^export const settingsSearchIndex = /, "").replace(/;$/, ""));
    return { settings, warnings };
}

describe("settings search index plugin: template analysis", () => {
    it("indexes setting rows with translated labels and their UiBox section", () => {
        const { settings } = analyze(`
<UiBox :title="$t('configurationSystem')">
    <SettingRow :label="$t('configurationGyroFrequency')" />
    <SettingColumn :label="t('configurationPidProcessDenom')"></SettingColumn>
</UiBox>`);

        expect(settings).toEqual([
            {
                tab: "configuration",
                searchId: "configuration::configurationGyroFrequency:1",
                labelKey: "configurationGyroFrequency",
                sectionKey: "configurationSystem",
            },
            {
                tab: "configuration",
                searchId: "configuration::configurationPidProcessDenom:1",
                labelKey: "configurationPidProcessDenom",
                sectionKey: "configurationSystem",
            },
        ]);
    });

    it("injects a stable search id into each indexed element and emits a source map", () => {
        const { magicString } = analyze(`<SettingRow :label="$t('rowA')" fullWidth />`);
        const output = magicString.toString();

        expect(output).toContain(`<SettingRow data-setting-search-id="configuration::rowA:1" :label="$t('rowA')"`);
        expect(magicString.generateMap({ hires: true }).mappings).not.toBe("");
    });

    it("counts repeated labels so every search id is unique", () => {
        const { settings } = analyze(`
<SettingRow :label="$t('dup')" />
<SettingRow :label="$t('dup')" />`);

        expect(settings.map((setting) => setting.searchId)).toEqual(["configuration::dup:1", "configuration::dup:2"]);
    });

    it("takes the first translation key from a conditional label", () => {
        const { settings } = analyze(`<SettingRow :label="busy ? $t('busyLabel') : $t('idleLabel')" />`);

        expect(settings[0].labelKey).toBe("busyLabel");
    });

    it("indexes any element that declares a static data-setting-search-key", () => {
        const { settings } = analyze(`
<UiBox :title="$t('sensorConfigAccelerometer')">
    <UButton data-setting-search-key="sensorConfigCalibrate" :label="busy ? $t('a') : $t('b')" />
</UiBox>`);

        expect(settings).toHaveLength(1);
        expect(settings[0]).toMatchObject({
            labelKey: "sensorConfigCalibrate",
            sectionKey: "sensorConfigAccelerometer",
        });
    });

    it("uses the innermost titled UiBox as section and flags expert-only boxes", () => {
        const { settings } = analyze(`
<UiBox v-if="expertModeEnabled" :title="$t('outer')">
    <UiBox>
        <UiBox :title="$t('inner')">
            <SettingRow :label="$t('deep')" />
        </UiBox>
    </UiBox>
</UiBox>
<SettingRow :label="$t('after')" />`);

        expect(settings[0]).toMatchObject({ labelKey: "deep", sectionKey: "inner", expert: true });
        expect(settings[1]).toMatchObject({ labelKey: "after", sectionKey: null });
        expect(settings[1].expert).toBeUndefined();
    });

    it("leaves rows with runtime search ids to the runtime index", () => {
        const { settings, unsearchable, magicString } = analyze(`
<SettingRow
    v-for="feature in features"
    :key="feature.bit"
    :data-setting-search-key-runtime="'feature' + feature.name"
    :data-setting-search-id="dynamicId(feature)"
/>`);

        expect(settings).toEqual([]);
        expect(unsearchable).toEqual([]);
        expect(magicString).toBeNull();
    });

    it("reports setting rows that cannot be searched", () => {
        const { unsearchable } = analyze(`<SettingRow>\n    <template #label>Plain text</template>\n</SettingRow>`);

        expect(unsearchable).toEqual([2]);
    });

    it("assigns sub-tabs from the view or the parent-tab map", () => {
        const nested = analyze(`<SettingRow :label="$t('rowA')" />`, { tab: "pid_tuning", subtab: "filter" });
        const parent = analyze(
            `<SettingRow :label="$t('pidTuningProfile')" /><SettingRow :label="$t('other')" />`,
            { tab: "pid_tuning", subtab: null },
            { parentSettingSubtabs: { pidTuningProfile: "pid" } },
        );

        expect(nested.settings[0]).toMatchObject({ subtab: "filter", searchId: "pid_tuning:filter:rowA:1" });
        expect(parent.settings[0]).toMatchObject({ subtab: "pid", searchId: "pid_tuning:pid:pidTuningProfile:1" });
        expect(parent.settings[1].subtab).toBeUndefined();
    });
});

describe("settings search index plugin: real tabs", () => {
    it("builds an index with unique ids that covers sub-tabs and explicit keys", () => {
        const { settings } = loadIndex();
        const searchIds = settings.map((setting) => setting.searchId);

        expect(settings.length).toBeGreaterThan(100);
        expect(new Set(searchIds).size).toBe(searchIds.length);
        expect(settings).toContainEqual(
            expect.objectContaining({ tab: "pid_tuning", subtab: "pid", labelKey: "pidTuningAntiGravity" }),
        );
        expect(settings).toContainEqual(expect.objectContaining({ tab: "sensors", labelKey: "sensorConfigCalibrate" }));
    });

    it("fails loudly when a mapped sub-tab file no longer exists", () => {
        const nestedViews = { "pid-tuning/Missing.vue": { tab: "pid_tuning", subtab: "x" } };

        expect(() => loadIndex({ nestedViews })).toThrow(/Missing\.vue is listed in nestedViews/);
    });
});
