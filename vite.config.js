/// <reference types="vitest" />
import { defineConfig, normalizePath } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { viteStaticCopy } from "vite-plugin-static-copy";
import pkg from "./package.json";
import * as child from "child_process";
import { VitePWA } from "vite-plugin-pwa";
import { resolve } from "path";
import ui from "@nuxt/ui/vite";
import nuxtUiViteOptions from "./nuxt-ui.vite.js";

function getCommitHash() {
    const revision =
        process.env.GIT_COMMIT ||
        process.env.COMMIT_SHA ||
        process.env.VERCEL_GIT_COMMIT_SHA ||
        process.env.CF_PAGES_COMMIT_SHA ||
        process.env.GITHUB_SHA ||
        "";

    if (revision) {
        return revision.slice(0, 7);
    }

    try {
        return child.execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    } catch (_error) {
        return "unknown";
    }
}

const commitHash = getCommitHash();

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

let cachedGithubToken;

function getGithubToken() {
    if (cachedGithubToken !== undefined) {
        return cachedGithubToken;
    }

    cachedGithubToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "";

    if (!cachedGithubToken) {
        try {
            cachedGithubToken = child.execFileSync("gh", ["auth", "token"], {
                encoding: "utf8",
                stdio: ["ignore", "pipe", "ignore"],
            }).trim();
        } catch (_error) {
            cachedGithubToken = "";
        }
    }

    return cachedGithubToken;
}

function githubProxyHeaders(accept) {
    const headers = {
        Accept: accept || "application/vnd.github+json",
        "User-Agent": "GIGFPV-Station-Dev-Proxy",
    };
    const token = getGithubToken();

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    return headers;
}

function isAllowedGithubApiUrl(url) {
    return (
        url.startsWith("https://api.github.com/repos/timmyfpv/GIGFLIGHT/") ||
        url.startsWith("https://api.github.com/repos/timmyfpv/gigflight-config/") ||
        url.startsWith("https://api.github.com/repos/timmyfpv/giglrs/") ||
        url.startsWith("https://api.github.com/repos/timmyfpv/giglrs-targets/")
    );
}

function githubApiProxyPlugin() {
    const allowedReleaseAssetApiPrefixes = [
        "https://api.github.com/repos/timmyfpv/GIGFLIGHT/releases/assets/",
        "https://api.github.com/repos/timmyfpv/giglrs/releases/assets/",
    ];

    return {
        name: "gigfpv-github-api-proxy",
        configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
                const requestUrl = new URL(req.url || "/", "http://localhost");
                const isGithubProxy = requestUrl.pathname === "/api/gigfpv/github";
                const isLegacyReleaseAssetProxy = requestUrl.pathname === "/api/gigfpv/github-release-asset";

                if (!isGithubProxy && !isLegacyReleaseAssetProxy) {
                    next();
                    return;
                }

                const githubUrl = requestUrl.searchParams.get("url");
                if (!githubUrl || !isAllowedGithubApiUrl(githubUrl)) {
                    res.statusCode = 400;
                    res.end("Invalid GIGFPV GitHub API URL");
                    return;
                }

                const accept = isLegacyReleaseAssetProxy
                    ? "application/octet-stream"
                    : requestUrl.searchParams.get("accept") || "application/vnd.github+json";

                if (
                    isLegacyReleaseAssetProxy &&
                    !allowedReleaseAssetApiPrefixes.some((prefix) => githubUrl.startsWith(prefix))
                ) {
                    res.statusCode = 400;
                    res.end("Invalid GIGFPV release asset URL");
                    return;
                }

                try {
                    const response = await fetch(githubUrl, {
                        headers: githubProxyHeaders(accept),
                    });

                    if (!response.ok) {
                        res.statusCode = response.status;
                        res.end(await response.text());
                        return;
                    }

                    const bytes = Buffer.from(await response.arrayBuffer());
                    res.statusCode = 200;
                    res.setHeader("Access-Control-Allow-Origin", "*");
                    res.setHeader("Cache-Control", "no-store");
                    res.setHeader("Content-Type", response.headers.get("content-type") || "application/octet-stream");

                    const disposition = response.headers.get("content-disposition");
                    if (disposition) {
                        res.setHeader("Content-Disposition", disposition);
                    }

                    res.end(bytes);
                } catch (error) {
                    server.config.logger.error(`GIGFPV GitHub API proxy failed: ${error}`);
                    res.statusCode = 502;
                    res.end("Failed to fetch GIGFPV GitHub API URL");
                }
            });
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
                main: resolve(__dirname, "src/index.html"),
                receiver_msp: resolve(__dirname, "src/components/tabs/receiver-msp/receiver_msp.html"),
            },
        },
    },
    test: {
        include: ["test/**/*.test.{js,mjs,cjs}"],
        environment: "jsdom",
        setupFiles: ["test/setup.js"],
        root: ".",
        alias: {
            "/images/": `${path.resolve(__dirname, "src/images")}/`,
        },
    },
    plugins: [
        vue(),
        ui(nuxtUiViteOptions),
        githubApiProxyPlugin(),
        serveLocalesPlugin(),
        // Copy runtime assets into the build output. Only the build-time
        // plugin is kept (the dev server serves these via serveLocalesPlugin /
        // Vite root, matching the previous rollup-plugin-copy behaviour).
        // `src` globs are absolute because the Vite root is `src/`, so
        // repo-root-relative patterns would otherwise resolve under `src/`.
        ...viteStaticCopy({
            targets: [
                { src: normalizePath(path.resolve(__dirname, "locales")), dest: "." },
                { src: normalizePath(path.resolve(__dirname, "resources")), dest: "." },
                { src: normalizePath(path.resolve(__dirname, "src/images")), dest: "." },
                { src: normalizePath(path.resolve(__dirname, "src/components")), dest: "." },
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
    ],
    // Absolute root so @nuxt/ui's template aliases (#build/ui.css, etc.) resolve to
    // absolute paths; a relative root yields relative aliases and Vite warns about duplicated modules.
    root: path.resolve(__dirname, "src"),
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "src"),
            "/src": path.resolve(process.cwd(), "src"),
            vue: path.resolve(__dirname, "node_modules/vue/dist/vue.esm-bundler.js"),
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
