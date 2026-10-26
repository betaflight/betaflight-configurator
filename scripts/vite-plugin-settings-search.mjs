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

/**
 * Vite plugin that builds the global settings search index.
 *
 * Tab templates are parsed with the Vue SFC compiler (not regex), so the index
 * is always derived from the templates being compiled and cannot drift from
 * the UI. The same pass tags every indexed element with a stable
 * `data-setting-search-id`, which the search UI uses to find and focus it.
 *
 * Indexed elements:
 *   - <SettingRow> / <SettingColumn> with a translated `:label`
 *   - any element with a static `data-setting-search-key="i18nKey"`
 * The section breadcrumb comes from the nearest enclosing <UiBox :title>.
 * Rows inside a <UiBox v-if="...expert..."> are flagged as Expert Mode only.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { normalizePath } from "vite";
import { MagicString, parse as parseSfc } from "@vue/compiler-sfc";

export const SETTINGS_SEARCH_MODULE_ID = "virtual:settings-search-index";
const RESOLVED_MODULE_ID = `\0${SETTINGS_SEARCH_MODULE_ID}`;

// Stable values of the public @vue/compiler-core NodeTypes enum.
const NODE_ELEMENT = 1;
const NODE_ATTRIBUTE = 6;
const NODE_DIRECTIVE = 7;

const SEARCH_ID_ATTR = "data-setting-search-id";
const SEARCH_KEY_ATTR = "data-setting-search-key";
const SEARCH_RUNTIME_KEY_ATTR = "data-setting-search-key-runtime";

// First translation call in an expression: $t('key'), t("key"), i18n.getMessage('key').
const TRANSLATION_CALL = /(?:\$t|\bt|\bi18n\.getMessage)\(\s*(["'`])([^"'`]+)\1\s*[,)]/;

/**
 * Sub-tab components are rendered inside a parent tab, so the tab/sub-tab they
 * belong to cannot be read from the file itself. Paths are relative to the tabs
 * directory. A missing file fails the build instead of silently dropping results.
 */
export const DEFAULT_NESTED_VIEWS = {
    "pid-tuning/PidSubTab.vue": { tab: "pid_tuning", subtab: "pid" },
    "pid-tuning/RatesSubTab.vue": { tab: "pid_tuning", subtab: "rates" },
    "pid-tuning/FilterSubTab.vue": { tab: "pid_tuning", subtab: "filter" },
    "firmware-flasher/FlasherBoardBuildTab.vue": { tab: "firmware_flasher", subtab: "board-build" },
    "firmware-flasher/FlasherFlashTab.vue": { tab: "firmware_flasher", subtab: "flash" },
};

/** Settings in a parent tab's own template that belong to one of its sub-tabs. */
export const DEFAULT_PARENT_SETTING_SUBTABS = {
    pid_tuning: {
        pidTuningProfile: "pid",
        pidProfileName: "pid",
        pidTuningRateProfile: "rates",
        rateProfileName: "rates",
    },
};

function toPascalCase(tag) {
    return tag.replace(/(^|-)(\w)/g, (_, __, char) => char.toUpperCase());
}

function findProp(node, name) {
    for (const prop of node.props) {
        if (prop.type === NODE_ATTRIBUTE && prop.name === name) {
            return { bound: false, value: prop.value?.content ?? "" };
        }

        if (prop.type === NODE_DIRECTIVE && prop.name === "bind" && prop.arg?.isStatic && prop.arg.content === name) {
            return { bound: true, value: prop.exp?.content ?? "" };
        }
    }

    return null;
}

function findDirective(node, name) {
    return node.props.find((prop) => prop.type === NODE_DIRECTIVE && prop.name === name) ?? null;
}

function translationKey(prop) {
    if (!prop?.bound) {
        return null;
    }

    return prop.value.match(TRANSLATION_CALL)?.[2] ?? null;
}

function getLabelKey(node, component) {
    const explicitKey = findProp(node, SEARCH_KEY_ATTR);
    if (explicitKey && !explicitKey.bound && explicitKey.value) {
        return explicitKey.value;
    }

    if (component === "SettingRow" || component === "SettingColumn") {
        return translationKey(findProp(node, "label"));
    }

    return null;
}

function getUiBoxInfo(node) {
    const condition = findDirective(node, "if")?.exp?.content ?? "";

    return {
        sectionKey: translationKey(findProp(node, "title")),
        expert: /expert/i.test(condition),
    };
}

/**
 * Converts a template-relative offset to a file offset. Newer compiler versions
 * already report file offsets; the check keeps this correct either way.
 */
function resolveTagOffset(source, node, templateOffset) {
    const expected = `<${node.tag}`;
    const offset = node.loc.start.offset;

    if (source.startsWith(expected, offset)) {
        return offset;
    }

    if (source.startsWith(expected, offset + templateOffset)) {
        return offset + templateOffset;
    }

    return -1;
}

/**
 * Parses one view's SFC source.
 *
 * @param {string} source SFC source
 * @param {{ tab: string, subtab: string | null }} view tab the file renders into
 * @param {object} [options]
 * @param {string} [options.filename] used in error messages
 * @param {Record<string, string>} [options.parentSettingSubtabs] labelKey -> subtab for this tab
 * @returns {{ settings: object[], unsearchable: number[], magicString: MagicString | null }}
 *   `settings` are index entries, `unsearchable` lists line numbers of setting rows that
 *   have no translatable label, and `magicString` holds the id-injected source (null
 *   when nothing was injected).
 */
export function analyzeSettingsSearchSource(source, view, options = {}) {
    const { filename = "anonymous.vue", parentSettingSubtabs = {} } = options;
    const { descriptor, errors } = parseSfc(source, { filename, sourceMap: false });
    const result = { settings: [], unsearchable: [], magicString: null };

    if (errors.length > 0 || !descriptor.template?.ast) {
        return result;
    }

    const templateOffset = descriptor.template.loc.start.offset;
    const occurrences = new Map();
    const uiBoxStack = [];
    let magicString = null;

    const visit = (node) => {
        if (node.type !== NODE_ELEMENT) {
            return;
        }

        const component = toPascalCase(node.tag);
        const isUiBox = component === "UiBox";

        if (isUiBox) {
            uiBoxStack.push(getUiBoxInfo(node));
        }

        const labelKey = getLabelKey(node, component);
        const existingId = findProp(node, SEARCH_ID_ATTR);

        if (labelKey && !existingId) {
            const occurrence = (occurrences.get(labelKey) ?? 0) + 1;
            occurrences.set(labelKey, occurrence);

            const subtab = view.subtab ?? parentSettingSubtabs[labelKey] ?? null;
            const sectionKey = uiBoxStack.findLast((uiBox) => uiBox.sectionKey)?.sectionKey ?? null;
            const expert = uiBoxStack.some((uiBox) => uiBox.expert);
            const searchId = [view.tab, subtab ?? "", labelKey, occurrence].join(":");

            result.settings.push({
                tab: view.tab,
                ...(subtab ? { subtab } : {}),
                searchId,
                labelKey,
                sectionKey,
                ...(expert ? { expert: true } : {}),
            });

            const tagOffset = resolveTagOffset(source, node, templateOffset);
            if (tagOffset !== -1) {
                magicString ??= new MagicString(source);
                magicString.appendLeft(tagOffset + 1 + node.tag.length, ` ${SEARCH_ID_ATTR}="${searchId}"`);
            }
        } else if (
            (component === "SettingRow" || component === "SettingColumn") &&
            !existingId &&
            !findProp(node, SEARCH_RUNTIME_KEY_ATTR)
        ) {
            result.unsearchable.push(node.loc.start.line);
        }

        node.children.forEach(visit);

        if (isUiBox) {
            uiBoxStack.pop();
        }
    };

    descriptor.template.ast.children.forEach(visit);
    result.magicString = magicString;
    return result;
}

function readTabName(source) {
    const { descriptor } = parseSfc(source, { sourceMap: false });
    const root = descriptor.template?.ast?.children.find((node) => node.type === NODE_ELEMENT);

    if (!root || toPascalCase(root.tag) !== "BaseTab") {
        return null;
    }

    const tabName = findProp(root, "tab-name") ?? findProp(root, "tabName");
    return tabName && !tabName.bound ? tabName.value : null;
}

/**
 * @param {object} [options]
 * @param {string} [options.tabsDir] directory holding the *Tab.vue components
 * @param {Record<string, {tab: string, subtab: string}>} [options.nestedViews]
 * @param {Record<string, Record<string, string>>} [options.parentSettingSubtabs]
 */
export default function settingsSearchIndexPlugin(options = {}) {
    const tabsDir = normalizePath(path.resolve(options.tabsDir ?? "src/components/tabs"));
    const parentSettingSubtabs = options.parentSettingSubtabs ?? DEFAULT_PARENT_SETTING_SUBTABS;
    const nestedViews = new Map(
        Object.entries(options.nestedViews ?? DEFAULT_NESTED_VIEWS).map(([relativePath, view]) => [
            normalizePath(path.resolve(tabsDir, relativePath)),
            view,
        ]),
    );

    function getView(filePath, source) {
        const nestedView = nestedViews.get(filePath);
        if (nestedView) {
            return nestedView;
        }

        if (normalizePath(path.dirname(filePath)) !== tabsDir || !filePath.endsWith("Tab.vue")) {
            return null;
        }

        const tab = readTabName(source);
        return tab ? { tab, subtab: null } : null;
    }

    function analyze(filePath, source) {
        const view = getView(filePath, source);
        if (!view) {
            return null;
        }

        return analyzeSettingsSearchSource(source, view, {
            filename: filePath,
            parentSettingSubtabs: parentSettingSubtabs[view.tab],
        });
    }

    function buildIndex(warn) {
        for (const filePath of nestedViews.keys()) {
            if (!existsSync(filePath)) {
                throw new Error(
                    `[settings-search] ${filePath} is listed in nestedViews but does not exist. ` +
                        "Update the plugin options in vite.config.js.",
                );
            }
        }

        const rootFiles = readdirSync(tabsDir, { withFileTypes: true })
            .filter((entry) => entry.isFile() && entry.name.endsWith("Tab.vue"))
            .map((entry) => normalizePath(path.join(tabsDir, entry.name)));
        const settings = [];

        for (const filePath of new Set([...rootFiles, ...nestedViews.keys()])) {
            const analysis = analyze(filePath, readFileSync(filePath, "utf8"));
            if (!analysis) {
                continue;
            }

            settings.push(...analysis.settings);

            if (analysis.unsearchable.length > 0) {
                warn(
                    `[settings-search] ${path.relative(process.cwd(), filePath)}: setting rows on line(s) ` +
                        `${analysis.unsearchable.join(", ")} have no translated :label or ${SEARCH_KEY_ATTR} ` +
                        "and will not appear in settings search.",
                );
            }
        }

        return settings;
    }

    return {
        name: "settings-search-index",
        enforce: "pre",
        resolveId(id) {
            return id === SETTINGS_SEARCH_MODULE_ID ? RESOLVED_MODULE_ID : null;
        },
        load(id) {
            if (id !== RESOLVED_MODULE_ID) {
                return null;
            }

            const settings = buildIndex((message) => this.warn(message));
            return `export const settingsSearchIndex = ${JSON.stringify(settings)};`;
        },
        transform(code, id) {
            const filePath = normalizePath(id.split("?")[0]);

            // Only the SFC itself; skip the per-block sub-requests (?vue&type=...).
            if (!filePath.endsWith(".vue") || id.includes("?")) {
                return null;
            }

            const magicString = analyze(filePath, code)?.magicString;
            if (!magicString) {
                return null;
            }

            return {
                code: magicString.toString(),
                map: magicString.generateMap({ hires: true, source: filePath, includeContent: true }),
            };
        },
        handleHotUpdate(ctx) {
            if (!normalizePath(ctx.file).startsWith(`${tabsDir}/`)) {
                return;
            }

            const indexModule = ctx.server.moduleGraph.getModuleById(RESOLVED_MODULE_ID);
            if (!indexModule) {
                return;
            }

            ctx.server.moduleGraph.invalidateModule(indexModule);
            return [...ctx.modules, indexModule];
        },
    };
}
