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

import type { PresetsIndexSettings } from "../../src/components/tabs/presets/PresetsRepoIndexed/PresetParser";

/** The `settings` block of the official presets index.json (presets.betaflight.com, 2026-10). */
export const presetsIndexSettings: PresetsIndexSettings = {
    MetapropertyDirective: "#$",
    PresetCategories: { TUNE: "TUNE", RATES: "RATES", OSD: "OSD", OTHER: "OTHER" },
    PresetCategoriesPriorities: { TUNE: 10 ** 12, RATES: 10 ** 4, OSD: 0, OTHER: 0 },
    MetadataTypes: {
        STRING: "STRING",
        STRING_ARRAY: "STRING_ARRAY",
        PRESET_CATEGORY: "PRESET_CATEGORY",
        FILE_PATH: "FILE_PATH",
        BOOLEAN: "BOOLEAN",
        WORDS_ARRAY: "WORDS_ARRAY",
        FILE_PATH_ARRAY: "FILE_PATH_ARRAY",
        PRESET_STATUS: "PRESET_STATUS",
        PRIORITY: "PRIORITY",
        PARSER: "PARSER",
    },
    OptionsDirectives: {
        OPTION_DIRECTIVE: "option",
        BEGIN_OPTION_DIRECTIVE: "option begin",
        END_OPTION_DIRECTIVE: "option end",
        OPTION_CHECKED: "(checked)",
        OPTION_UNCHECKED: "(unchecked)",
        BEGIN_OPTION_GROUP_DIRECTIVE: "option_group begin",
        END_OPTION_GROUP_DIRECTIVE: "option_group end",
        EXCLUSIVE_OPTION_GROUP: "(exclusive)",
    },
    PresetStatusEnum: ["OFFICIAL", "COMMUNITY", "EXPERIMENTAL"],
    ParserEnum: ["TEXT", "MARKED"],
    presetsFileMetadata: {
        title: { type: "STRING", optional: false },
        firmware_version: { type: "STRING_ARRAY", optional: false },
        category: { type: "PRESET_CATEGORY", optional: false },
        status: { type: "PRESET_STATUS", optional: false },
        author: { type: "STRING", optional: true },
        description: { type: "STRING_ARRAY", optional: true },
        include: { type: "FILE_PATH_ARRAY", optional: true },
        keywords: { type: "WORDS_ARRAY", optional: true },
        hidden: { type: "BOOLEAN", optional: true },
        discussion: { type: "STRING", optional: true },
        warning: { type: "STRING", optional: true },
        disclaimer: { type: "STRING", optional: true },
        include_warning: { type: "FILE_PATH_ARRAY", optional: true },
        include_disclaimer: { type: "FILE_PATH_ARRAY", optional: true },
        priority: { type: "PRIORITY", optional: true },
        force_options_review: { type: "BOOLEAN", optional: true },
        parser: { type: "PARSER", optional: true },
    },
};
