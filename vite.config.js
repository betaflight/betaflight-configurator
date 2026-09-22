/// <reference types="vitest" />
import { defineConfig, normalizePath } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "node:path";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { viteStaticCopy } from "vite-plugin-static-copy";
import pkg from "./package.json" with { type: "json" };
import * as child from "child_process";
import { VitePWA } from "vite-plugin-pwa";
import { resolve } from "path";
import ui from "@nuxt/ui/vite";
import nuxtUiViteOptions from "./nuxt-ui.vite.js";

const commitHash = child.execSync("git rev-parse --short HEAD").toString().trim();

const devHostname = process.env.BF_DEV_HOSTNAME || "local.betaflight.com";

// Check if SSL certificates exist. Skipped when running under `tauri dev`
// because the native webview needs a predictable HTTP endpoint and won't
// trust the mkcert root out of the box.
const certPath = "./local.betaflight.com.pem";
const keyPath = "./local.betaflight.com-key.pem";
const tauriDev = process.env.TAURI_DEV === "1";
const certsExist = !tauriDev && existsSync(certPath) && existsSync(keyPath);
const serverPort = certsExist ? 8443 : 8080;

if (tauriDev) {
    console.log("⚙ TAURI_DEV=1 — forcing HTTP mode for the Tauri shell");
    console.log(`  Server will be available at: http://localhost:${serverPort}`);
} else if (certsExist) {
    console.log("✓ SSL certificates found - HTTPS enabled");
    console.log(`  Server will be available at: https://${devHostname}:8443`);
} else {
    console.log("⚠ SSL certificates not found - Running in HTTP mode");
    console.log("  WebAuthn features will not be available without HTTPS");
    console.log("  See WEBAUTHN_SETUP.md for certificate setup instructions");
    console.log("  Server will be available at: http://localhost:8080");
}

function serveFileFromDirectory(directory) {
    return (req, res, next) => {
        const filePath = req.url.replace(new RegExp(`^/${directory}/`), "");
        const absolutePath = path.resolve(process.cwd(), directory, filePath);

        try {
            // Define binary file extensions that should not be read as UTF-8
            const binaryExtensions = [
                ".png",
                ".jpg",
                ".jpeg",
                ".gif",
                ".webp",
                ".ico",
                ".bmp",
                ".tiff",
                ".tif",
                ".svg",
                ".woff",
                ".woff2",
                ".ttf",
                ".eot",
            ];
            const isBinary = binaryExtensions.some((ext) => filePath.toLowerCase().endsWith(ext));

            // Read file with appropriate encoding
            const fileContents = isBinary ? readFileSync(absolutePath) : readFileSync(absolutePath, "utf-8");

            // Set Content-Type based on file extension
            if (filePath.endsWith(".svg")) {
                res.setHeader("Content-Type", "image/svg+xml");
            } else if (filePath.endsWith(".png")) {
                res.setHeader("Content-Type", "image/png");
            } else if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) {
                res.setHeader("Content-Type", "image/jpeg");
            } else if (filePath.endsWith(".gif")) {
                res.setHeader("Content-Type", "image/gif");
            } else if (filePath.endsWith(".webp")) {
                res.setHeader("Content-Type", "image/webp");
            } else if (filePath.endsWith(".ico")) {
                res.setHeader("Content-Type", "image/x-icon");
            } else if (filePath.endsWith(".json")) {
                res.setHeader("Content-Type", "application/json");
            } else if (filePath.endsWith(".css")) {
                res.setHeader("Content-Type", "text/css");
            } else if (filePath.endsWith(".js")) {
                res.setHeader("Content-Type", "application/javascript");
            }

            res.end(fileContents);
            // eslint-disable-next-line unused-imports/no-unused-vars
        } catch (e) {
            // If file not found or any other error, pass to the next middleware
            next();
        }
    };
}

/**
 * This is plugin to work around the file structure required nwjs.
 * In future this can be dropped if we restructure folder structure
 * to be more web friendly.
 * @returns {import("vite").Plugin}
 */
function serveLocalesPlugin() {
    return {
        name: "serve-locales",
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                if (req.url.startsWith("/locales/")) {
                    serveFileFromDirectory("locales")(req, res, next);
                } else if (req.url.startsWith("/resources/")) {
                    serveFileFromDirectory("resources")(req, res, next);
                } else {
                    next();
                }
            });
        },
    };
}

/**
 * The radio-emulator popup is a secondary MPA entry, not an installable page.
 * VitePWA injects `<link rel="manifest" href="./manifest.webmanifest">` into every
 * HTML entry, which resolves relative to the popup's own directory and 404s.
 * Strip it from everything except the main entry.
 * Registered after VitePWA so its `post` hook runs last.
 * @returns {import("vite").Plugin}
 */
function stripManifestFromSecondaryEntriesPlugin() {
    return {
        name: "strip-manifest-from-secondary-entries",
        // `enforce`/`order` post so this runs after vite-plugin-pwa:build has injected the link.
        enforce: "post",
        apply: "build",
        transformIndexHtml: {
            order: "post",
            handler(html, ctx) {
                if (ctx.path === "/index.html") {
                    return html;
                }
                return html.replace(/<link rel="manifest"[^>]*>/g, "");
            },
        },
    };
}

// These modules are each imported dynamically in one place purely to break an import
// cycle (see the comment at every call site), never to split them into their own chunk.
// Rolldown reports INEFFECTIVE_DYNAMIC_IMPORT because they are also imported statically
// elsewhere -- which is the intent -- so the chunking advice does not apply. Only these
// are silenced, so a genuinely pointless dynamic import added later still warns.
const CYCLE_BREAKING_DYNAMIC_IMPORTS = ["src/js/msp.js", "src/js/serial_backend.js", "src/js/tab_switch.js"];

function isCycleBreakingImport(warning) {
    // The message is prefixed with the (colourised) warning code, so match on the
    // "<id> is dynamically imported by" phrase rather than the start of the string.
    const message = warning.message ?? "";
    return CYCLE_BREAKING_DYNAMIC_IMPORTS.some((id) => message.includes(`${id} is dynamically imported by`));
}


const SETTINGS_SEARCH_MODULE_ID = "virtual:settings-search-index";
const RESOLVED_SETTINGS_SEARCH_MODULE_ID = `\0${SETTINGS_SEARCH_MODULE_ID}`;
const settingsSearchTabsDir = path.resolve(import.meta.dirname, "src/components/tabs");
const normalizedSettingsSearchTabsDir = normalizePath(settingsSearchTabsDir);
const settingsSearchNestedViews = new Map(
    [
        ["pid-tuning/PidSubTab.vue", { tab: "pid_tuning", subtab: "pid" }],
        ["pid-tuning/RatesSubTab.vue", { tab: "pid_tuning", subtab: "rates" }],
        ["pid-tuning/FilterSubTab.vue", { tab: "pid_tuning", subtab: "filter" }],
        ["firmware-flasher/FlasherBoardBuildTab.vue", { tab: "firmware_flasher", subtab: "board-build" }],
        ["firmware-flasher/FlasherFlashTab.vue", { tab: "firmware_flasher", subtab: "flash" }],
    ].map(([relativePath, view]) => [
        normalizePath(path.resolve(settingsSearchTabsDir, relativePath)),
        view,
    ]),
);

const pidTuningParentSettingSubtabs = new Map([
    ["pidTuningProfile", "pid"],
    ["pidProfileName", "pid"],
    ["pidTuningRateProfile", "rates"],
    ["rateProfileName", "rates"],
]);

function getSettingsSearchView(filePath, source) {
    const normalizedPath = normalizePath(filePath);
    const nestedView = settingsSearchNestedViews.get(normalizedPath);

    if (nestedView) {
        return nestedView;
    }

    if (normalizePath(path.dirname(filePath)) !== normalizedSettingsSearchTabsDir) {
        return null;
    }

    const tabMatch = source.match(/<BaseTab\b[^>]*tab-name="([^"]+)"/);
    return tabMatch ? { tab: tabMatch[1], subtab: null } : null;
}

function findSettingsSearchTagEnd(source, start, limit = source.length) {
    let quote = null;

    for (let index = start + 1; index < limit; index += 1) {
        const char = source[index];

        if (quote) {
            if (char === quote) {
                quote = null;
            }
        } else if (char === '"' || char === "'") {
            quote = char;
        } else if (char === ">") {
            return index;
        }
    }

    return -1;
}

function findNextSettingsSearchTag(source, fromIndex, limit = source.length) {
    let start = source.indexOf("<", fromIndex);

    while (start !== -1 && start < limit) {
        if (/[A-Za-z/!]/.test(source[start + 1] ?? "")) {
            const end = findSettingsSearchTagEnd(source, start, limit);
            if (end === -1) {
                return null;
            }

            return { tag: source.slice(start, end + 1), index: start, end };
        }

        start = source.indexOf("<", start + 1);
    }

    return null;
}

function findSettingsSearchTemplateBounds(source) {
    let rootTemplate = findNextSettingsSearchTag(source, 0);

    while (rootTemplate && !/^<template(?:\s|>)/.test(rootTemplate.tag)) {
        rootTemplate = findNextSettingsSearchTag(source, rootTemplate.end + 1);
    }

    if (!rootTemplate) {
        return null;
    }

    let depth = 1;
    let current = findNextSettingsSearchTag(source, rootTemplate.end + 1);

    while (current) {
        if (/^<template(?:\s|>)/.test(current.tag)) {
            depth += 1;
        } else if (current.tag === "</template>") {
            depth -= 1;
            if (depth === 0) {
                return { start: rootTemplate.end + 1, end: current.index };
            }
        }

        current = findNextSettingsSearchTag(source, current.end + 1);
    }

    return null;
}

function isSettingsSearchTag(tag) {
    return (
        tag === "</UiBox>" ||
        tag.startsWith("<UiBox") ||
        tag.startsWith("<SettingRow") ||
        (tag[1] !== "/" && tag.includes("data-setting-search-key="))
    );
}

function findSettingsSearchTags(source) {
    const bounds = findSettingsSearchTemplateBounds(source);
    if (!bounds) {
        return [];
    }

    const tags = [];
    let match = findNextSettingsSearchTag(source, bounds.start, bounds.end);

    while (match) {
        if (isSettingsSearchTag(match.tag)) {
            tags.push({ 0: match.tag, index: match.index });
        }

        match = findNextSettingsSearchTag(source, match.end + 1, bounds.end);
    }

    return tags;
}

function updateSettingsSearchUiBoxStack(tag, uiBoxStack) {
    if (tag.startsWith("<UiBox")) {
        const sectionMatch = tag.match(/:title="\$t\('([^']+)'\)"/);
        uiBoxStack.push({
            sectionKey: sectionMatch?.[1] ?? null,
            expert: /\bv-if="[^"]*expert/i.test(tag),
        });
        return true;
    }

    if (tag === "</UiBox>") {
        uiBoxStack.pop();
        return true;
    }

    return false;
}

function getSettingsSearchLabelKey(tag) {
    const explicitLabelMatch = tag.match(/\bdata-setting-search-key="([^"]+)"/);
    const settingRowLabelMatch = tag.match(/:label="[^"]*\$t\('([^']+)'\)[^"]*"/);
    return explicitLabelMatch?.[1] ?? settingRowLabelMatch?.[1] ?? null;
}

function createSettingsSearchEntry(view, labelKey, occurrence, uiBoxStack) {
    const sectionKey = [...uiBoxStack].reverse().find((uiBox) => uiBox.sectionKey)?.sectionKey ?? null;
    const expert = uiBoxStack.some((uiBox) => uiBox.expert);
    const subtab =
        view.subtab ??
        (view.tab === "pid_tuning" ? pidTuningParentSettingSubtabs.get(labelKey) ?? null : null);
    const searchId = [view.tab, subtab ?? "", labelKey, occurrence].join(":");

    return {
        tab: view.tab,
        ...(subtab ? { subtab } : {}),
        searchId,
        labelKey,
        sectionKey,
        ...(expert ? { expert: true } : {}),
    };
}

function addSettingsSearchIdInsertion(match, tag, searchId, insertions) {
    if (/\bdata-setting-search-id=/.test(tag)) {
        return;
    }

    const insertionOffset = tag.endsWith("/>") ? tag.length - 2 : tag.length - 1;
    insertions.push({
        index: match.index + insertionOffset,
        text: ` data-setting-search-id="${searchId}"`,
    });
}

function applySettingsSearchInsertions(source, insertions) {
    let transformedSource = source;

    for (const insertion of insertions.reverse()) {
        transformedSource =
            transformedSource.slice(0, insertion.index) +
            insertion.text +
            transformedSource.slice(insertion.index);
    }

    return transformedSource;
}

function analyzeSettingsSearchSource(source, view, injectIds = false) {
    const uiBoxStack = [];
    const occurrences = new Map();
    const settings = [];
    const insertions = [];

    for (const match of findSettingsSearchTags(source)) {
        const tag = match[0];

        if (updateSettingsSearchUiBoxStack(tag, uiBoxStack)) {
            continue;
        }

        const labelKey = getSettingsSearchLabelKey(tag);
        if (!labelKey) {
            continue;
        }

        const occurrence = (occurrences.get(labelKey) ?? 0) + 1;
        occurrences.set(labelKey, occurrence);

        const setting = createSettingsSearchEntry(view, labelKey, occurrence, uiBoxStack);
        settings.push(setting);

        if (injectIds) {
            addSettingsSearchIdInsertion(match, tag, setting.searchId, insertions);
        }
    }

    return {
        settings,
        code: applySettingsSearchInsertions(source, insertions),
    };
}

function buildSettingsSearchIndex() {
    const rootFiles = readdirSync(settingsSearchTabsDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith("Tab.vue"))
        .map((entry) => path.resolve(settingsSearchTabsDir, entry.name));
    const sourceFiles = [...new Set([...rootFiles, ...settingsSearchNestedViews.keys()])];
    const settings = [];

    for (const filePath of sourceFiles) {
        const source = readFileSync(filePath, "utf8");
        const view = getSettingsSearchView(filePath, source);

        if (view) {
            settings.push(...analyzeSettingsSearchSource(source, view).settings);
        }
    }

    return settings;
}

function settingsSearchIndexPlugin() {
    return {
        name: "settings-search-index",
        enforce: "pre",
        resolveId(id) {
            return id === SETTINGS_SEARCH_MODULE_ID ? RESOLVED_SETTINGS_SEARCH_MODULE_ID : null;
        },
        load(id) {
            if (id !== RESOLVED_SETTINGS_SEARCH_MODULE_ID) {
                return null;
            }

            return `export const settingsSearchIndex = ${JSON.stringify(buildSettingsSearchIndex())};`;
        },
        transform(code, id) {
            const filePath = id.split("?")[0];

            if (!filePath.endsWith(".vue")) {
                return null;
            }

            const view = getSettingsSearchView(filePath, code);
            if (!view) {
                return null;
            }

            const transformed = analyzeSettingsSearchSource(code, view, true).code;
            return transformed === code ? null : { code: transformed, map: null };
        },
        handleHotUpdate(ctx) {
            if (!normalizePath(ctx.file).startsWith(`${normalizedSettingsSearchTabsDir}/`)) {
                return;
            }

            const virtualModule = ctx.server.moduleGraph.getModuleById(RESOLVED_SETTINGS_SEARCH_MODULE_ID);
            if (!virtualModule) {
                return;
            }

            ctx.server.moduleGraph.invalidateModule(virtualModule);
            return [...ctx.modules, virtualModule];
        },
    };
}

export default defineConfig({
    base: "./", // Important for production APK asset paths
    define: {
        __APP_VERSION__: JSON.stringify(pkg.version),
        __APP_PRODUCTNAME__: JSON.stringify(pkg.productName),
        __APP_REVISION__: JSON.stringify(commitHash),
    },
    build: {
        rollupOptions: {
            input: {
                main: resolve(import.meta.dirname, "src/index.html"),
                receiver_msp: resolve(import.meta.dirname, "src/components/tabs/receiver-msp/receiver_msp.html"),
            },
            onwarn(warning, defaultHandler) {
                if (warning.code === "INEFFECTIVE_DYNAMIC_IMPORT" && isCycleBreakingImport(warning)) {
                    return;
                }
                defaultHandler(warning);
            },
        },
    },
    test: {
        include: ["test/**/*.test.{js,mjs,cjs,ts,mts}"],
        environment: "jsdom",
        setupFiles: ["test/setup.js"],
        root: ".",
        alias: {
            "/images/": `${path.resolve(import.meta.dirname, "src/images")}/`,
        },
    },
    plugins: [
        settingsSearchIndexPlugin(),
        vue(),
        ui(nuxtUiViteOptions),
        serveLocalesPlugin(),
        // Copy runtime assets into the build output. Only the build-time
        // plugin is kept (the dev server serves these via serveLocalesPlugin /
        // Vite root, matching the previous rollup-plugin-copy behaviour).
        // `src` globs are absolute because the Vite root is `src/`, so
        // repo-root-relative patterns would otherwise resolve under `src/`.
        // Only assets that are fetched by URL at runtime belong here. Never add
        // `src/components`: those files are bundled, and copying them raw runs on
        // `writeBundle` — after the bundle is emitted — so the raw
        // `receiver-msp/receiver_msp.html` would overwrite the built MPA entry and
        // leave the popup loading an untransformed module (bare `vue` specifier).
        ...viteStaticCopy({
            targets: [
                { src: normalizePath(path.resolve(import.meta.dirname, "locales")), dest: "." },
                { src: normalizePath(path.resolve(import.meta.dirname, "resources")), dest: "." },
                { src: normalizePath(path.resolve(import.meta.dirname, "src/images")), dest: "." },
            ],
        }).filter((plugin) => plugin.name === "vite-plugin-static-copy:build"),
        VitePWA({
            registerType: "prompt",
            workbox: {
                globPatterns: ["**/*.{js,css,html,ico,png,svg,json,mcm,gltf}"],
                // 5MB
                maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
            },
            includeAssets: ["favicon.ico", "apple-touch-icon.png"],
            manifest: {
                name: pkg.displayName,
                short_name: pkg.productName,
                description: pkg.description,
                theme_color: "#ffffff",
                icons: [
                    {
                        src: "/images/pwa/pwa-192-192.png",
                        sizes: "192x192",
                        type: "image/png",
                    },
                    {
                        src: "/images/pwa/pwa-512-512.png",
                        sizes: "512x512",
                        type: "image/png",
                    },
                ],
            },
        }),
        stripManifestFromSecondaryEntriesPlugin(),
    ],
    // Absolute root so @nuxt/ui's template aliases (#build/ui.css, etc.) resolve to
    // absolute paths; a relative root yields relative aliases and Vite warns about duplicated modules.
    root: path.resolve(import.meta.dirname, "src"),
    resolve: {
        alias: {
            "@": path.resolve(import.meta.dirname, "src"),
            "/src": path.resolve(process.cwd(), "src"),
            vue: path.resolve(import.meta.dirname, "node_modules/vue/dist/vue.esm-bundler.js"),
        },
    },
    server: {
        port: serverPort,
        strictPort: true,
        ...(certsExist && {
            https: {
                key: readFileSync(keyPath),
                cert: readFileSync(certPath),
            },
        }),
        host: "0.0.0.0", // Listen on all network interfaces for Android device access
        allowedHosts: certsExist ? [devHostname] : ["localhost"],
    },
    preview: {
        port: serverPort,
        strictPort: true,
    },
});
