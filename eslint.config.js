import vuePlugin from "eslint-plugin-vue";
import prettierPlugin from "eslint-plugin-prettier";
import unusedImportsPlugin from "eslint-plugin-unused-imports";
import vueParser from "vue-eslint-parser";
import globals from "globals";

export default [
    {
        // Build output has to be ignored globally rather than per-config: a `dist/` left in the
        // tree otherwise gets linted as source, and minified bundles produce thousands of errors.
        ignores: ["src/js/webworkers/**", "dist/**", "src/dist/**"],
    },
    {
        files: ["**/*.js", "**/*.vue"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            globals: {
                ...globals.browser,
                // Not a real Node environment: Vite statically replaces `process.env.*` at build
                // time, and Analytics.js feature-detects `process` before touching it.
                process: "readonly",
                ol: "readonly",
                ConfigStorage: "readonly",
                // globals for vite
                __APP_PRODUCTNAME__: "readonly",
                __APP_VERSION__: "readonly",
                __APP_REVISION__: "readonly",
            },
        },
        plugins: {
            vue: vuePlugin,
            prettier: prettierPlugin,
            "unused-imports": unusedImportsPlugin,
        },
        rules: {
            // Catches a missing or mistyped import, which otherwise only surfaces as a
            // ReferenceError when the code actually runs in the browser.
            "no-undef": "error",
            "no-var": "error",
            "prefer-template": "error",
            "comma-dangle": ["error", "always-multiline"],
            indent: [
                "error",
                4,
                {
                    SwitchCase: 1,
                },
            ],
            "unused-imports/no-unused-imports": "error",
            "unused-imports/no-unused-vars": [
                "warn",
                {
                    vars: "all",
                    varsIgnorePattern: "^_",
                    args: "after-used",
                    argsIgnorePattern: "^_",
                },
            ],
        },
        ignores: ["dist/", "src/dist/", "*.json", "*.html", "*.less", "*.css", "package.json"],
    },
    {
        // vendor.js pulls in Leaflet and its plugins for their side effects, and they register
        // themselves on `window.L` rather than exporting anything. `chrome` is the Chrome Apps
        // storage path, absent everywhere else, which is why pref_storage guards on it.
        files: ["src/blackbox-viewer/**/*.js", "src/blackbox-viewer/**/*.vue"],
        languageOptions: {
            globals: {
                L: "readonly",
                chrome: "readonly",
            },
        },
    },
    {
        files: ["**/*.vue"],
        languageOptions: {
            parser: vueParser,
        },
        processor: "vue/vue",
    },
    {
        // Build and release tooling: real Node scripts, not browser code. Without this
        // block `.mjs` matches no `files` pattern and is linted with zero rules.
        files: ["**/*.mjs"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            globals: {
                ...globals.node,
            },
        },
        plugins: {
            "unused-imports": unusedImportsPlugin,
        },
        rules: {
            "no-unused-vars": "off",
            "unused-imports/no-unused-imports": "error",
            "unused-imports/no-unused-vars": [
                "warn",
                {
                    vars: "all",
                    varsIgnorePattern: "^_",
                    args: "after-used",
                    argsIgnorePattern: "^_",
                },
            ],
            "no-undef": "error",
        },
    },
];
