/// <reference types="vitest" />
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue2";
import path from "node:path";
import { readFileSync } from "node:fs";

/**
 * This is plugin to work around the file structure required nwjs.
 * In future this can be dropped if we restructure folder structure
 * to be more web friendly.
 * @returns {import('vite').Plugin}
 */
function serveLocalesPlugin() {
    return {
        name: "serve-locales",
        configureServer(server) {
            return () => {
                server.middlewares.use((req, res, next) => {
                    if (req.url.startsWith("/locales/")) {
                        // Extract the file path from the URL
                        const filePath = req.url.replace(/^\/locales\//, "");
                        const absolutePath = path.resolve(
                            process.cwd(),
                            "locales",
                            filePath,
                        );

                        try {
                            const fileContents = readFileSync(
                                absolutePath,
                                "utf-8",
                            );
                            res.end(fileContents);
                        } catch (e) {
                            // If file not found or any other error, pass to the next middleware
                            next();
                        }
                    } else {
                        next();
                    }
                });
            };
        },
    };
}

export default defineConfig({
    test: {
        // NOTE: this is a replacement location for karma tests.
        //       moving forward we should colocate tests with the
        //       code they test.
        include: ["test/**/*.test.{js,mjs,cjs}"],
        environment: "jsdom",
        setupFiles: ["test/setup.js"],
        root: '.',
    },
    plugins: [vue(), serveLocalesPlugin()],
    root: "./src",
    resolve: {
        alias: {
            "/src": path.resolve(process.cwd(), "src"),
            'vue': path.resolve(__dirname, 'node_modules/vue/dist/vue.esm.js'),
        },
    },
});
