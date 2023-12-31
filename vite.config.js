/// <reference types="vitest" />
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue2";
import path from "node:path";
import { readFileSync } from "node:fs";
import copy from "rollup-plugin-copy";
import pkg from './package.json';
import * as child from 'child_process';
import { VitePWA } from "vite-plugin-pwa";

const commitHash = child.execSync('git rev-parse --short HEAD').toString();

function serveFileFromDirectory(directory) {
    return (req, res, next) => {
        const filePath = req.url.replace(new RegExp(`^/${directory}/`), "");
        const absolutePath = path.resolve(process.cwd(), directory, filePath);

        try {
            const fileContents = readFileSync(absolutePath, "utf-8");
            res.end(fileContents);
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
            return () => {
                server.middlewares.use((req, res, next) => {
                    if (req.url.startsWith("/locales/")) {
                        serveFileFromDirectory("locales")(req, res, next);
                    } else if (req.url.startsWith("/resources/")) {
                        serveFileFromDirectory("resources")(req, res, next);
                    } else {
                        next();
                    }
                });
            };
        },
    };
}

export default defineConfig({
    define: {
        '__APP_VERSION__': JSON.stringify(pkg.version),
        '__APP_PRODUCTNAME__': JSON.stringify(pkg.productName),
        '__APP_REVISION__': JSON.stringify(commitHash),
    },
    test: {
        // NOTE: this is a replacement location for karma tests.
        //       moving forward we should colocate tests with the
        //       code they test.
        include: ["test/**/*.test.{js,mjs,cjs}"],
        environment: "jsdom",
        setupFiles: ["test/setup.js"],
        root: ".",
    },
    plugins: [
        vue(),
        serveLocalesPlugin(),
        copy({
            targets: [
                { src: ["locales", "resources", "src/tabs", "src/images"], dest: "src/dist" },
            ],
            hook: "writeBundle",
        }),
        VitePWA({
            registerType: 'autoUpdate',
            workbox: {
                globPatterns: ['**/*.{js,css,html,ico,png,svg,json,mcm}'],
                // 5MB
                maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
            },
            includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
            manifest: {
                name: pkg.productName,
                short_name: pkg.productName,
                description: pkg.description,
                theme_color: '#ffffff',
                icons: [
                    {
                        src: '/images/pwa/pwa-192-192.png',
                        sizes: '192x192',
                        type: 'image/png',
                    },
                    {
                        src: '/images/pwa/pwa-512-512.png',
                        sizes: '512x512',
                        type: 'image/png',
                    },
                ],
            },
        }),
    ],
    root: "./src",
    resolve: {
        alias: {
            "/src": path.resolve(process.cwd(), "src"),
            "vue": path.resolve(__dirname, "node_modules/vue/dist/vue.esm.js"),
        },
    },
    server: {
        port: 8000,
    },
    preview: {
        port: 8080,
    },
});
