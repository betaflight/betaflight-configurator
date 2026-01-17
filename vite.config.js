/// <reference types="vitest" />
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "node:path";
import { readFileSync, existsSync } from "node:fs";
import copy from "rollup-plugin-copy";
import pkg from "./package.json";
import * as child from "child_process";
import { VitePWA } from "vite-plugin-pwa";
import { resolve } from "path";

const commitHash = child.execSync("git rev-parse --short HEAD").toString().trim();

// Check if SSL certificates exist
const certPath = "./local.betaflight.com.pem";
const keyPath = "./local.betaflight.com-key.pem";
const certsExist = existsSync(certPath) && existsSync(keyPath);
const serverPort = certsExist ? 8443 : 8080;

if (certsExist) {
    console.log("✓ SSL certificates found - HTTPS enabled");
    console.log("  Server will be available at: https://local.betaflight.com:8443");
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
            const fileContents = readFileSync(absolutePath, "utf-8");

            // Set Content-Type based on file extension
            if (filePath.endsWith(".svg")) {
                res.setHeader("Content-Type", "image/svg+xml");
            } else if (filePath.endsWith(".json")) {
                res.setHeader("Content-Type", "application/json");
            } else if (filePath.endsWith(".css")) {
                res.setHeader("Content-Type", "text/css");
            } else if (filePath.endsWith(".js")) {
                res.setHeader("Content-Type", "application/javascript");
            }

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
                receiver_msp: resolve(__dirname, "src/receiver_msp/receiver_msp.html"),
            },
        },
    },
    test: {
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
                { src: "locales/**/*", dest: "src/dist/locales" },
                { src: "resources/**/*", dest: "src/dist/resources" },
                { src: "src/tabs/**/*", dest: "src/dist/tabs" },
                { src: "src/images/**/*", dest: "src/dist/images" },
                { src: "src/components/**/*", dest: "src/dist/components" },
            ],
            hook: "writeBundle",
        }),
        VitePWA({
            registerType: "prompt",
            workbox: {
                globPatterns: ["**/*.{js,css,html,ico,png,svg,json,mcm}"],
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
    root: "./src",
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
        allowedHosts: certsExist ? ["local.betaflight.com"] : ["localhost"],
    },
    preview: {
        port: serverPort,
        strictPort: true,
    },
});
