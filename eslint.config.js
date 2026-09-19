import vuePlugin from "eslint-plugin-vue";
import prettierConfig from "eslint-config-prettier/flat";
import unusedImportsPlugin from "eslint-plugin-unused-imports";
import unicornPlugin from "eslint-plugin-unicorn";
import vueParser from "vue-eslint-parser";
import tseslint from "typescript-eslint";
import globals from "globals";

export default [
    {
        // Build output has to be ignored globally rather than per-config: a `dist/` left in the
        // tree otherwise gets linted as source, and minified bundles produce thousands of errors.
        ignores: ["src/js/webworkers/**", "dist/**", "src/dist/**"],
    },
    {
        files: ["**/*.js", "**/*.ts", "**/*.vue"],
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
            "unused-imports": unusedImportsPlugin,
        },
        rules: {
            // Catches a missing or mistyped import, which otherwise only surfaces as a
            // ReferenceError when the code actually runs in the browser.
            "no-undef": "error",
            "no-var": "error",
            "prefer-template": "error",
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
    ...tseslint.configs.recommended.map((config) => ({ ...config, files: ["**/*.ts", "**/*.vue"] })),
    {
        // The compiler owns undefined names and types in TypeScript; ESLint's no-undef would only
        // re-report them, and flags type-only names it cannot see. A .vue file may still be plain
        // JavaScript, where a missing import only surfaces at runtime, so it keeps the rule.
        files: ["**/*.ts"],
        rules: {
            "no-undef": "off",
        },
    },
    {
        // unused-imports/no-unused-vars already covers both, with the project's `_` convention.
        files: ["**/*.ts", "**/*.vue"],
        rules: {
            "@typescript-eslint/no-unused-vars": "off",
        },
    },
    {
        files: ["**/*.vue"],
        rules: {
            "no-undef": "error",
        },
    },
    {
        files: ["**/*.vue"],
        languageOptions: {
            parser: vueParser,
            parserOptions: {
                parser: tseslint.parser,
            },
        },
        processor: "vue/vue",
    },
    {
        // Vue SFC filenames are PascalCase, matching the component name templates refer to.
        // All 136 `.vue` files already comply, so this is pure lock-in: no allowlist, no
        // renames, it only stops the tree from drifting back. Only `filename-case` is taken
        // from eslint-plugin-unicorn — the rest of the plugin is not this project's style.
        //
        // `checkDirectories: false` because the rule applies its `case` to directory segments
        // too, and this tree's directories are deliberately not PascalCase (`src/components/
        // tabs/pid-tuning/`). Left on, it reports every `.vue` file for living under `src`.
        files: ["**/*.vue"],
        plugins: {
            unicorn: unicornPlugin,
        },
        rules: {
            "unicorn/filename-case": ["error", { case: "pascalCase", checkDirectories: false }],
        },
    },
    {
        // A component that imports MSP reaches past the state layer and talks to the flight
        // controller itself, which is what keeps `FC` authoritative and Pinia a proxy (#4800).
        // MSP belongs in a store action or a composable; the component consumes the result.
        // `src/js/msp.js` (the transport singleton) is banned alongside `src/js/msp/**` —
        // importing it is the same boundary break under a different path.
        // A warning, not an error: 20 components still do this, and they move across as #4800
        // converts each domain. Static imports only — the core rule does not see
        // `await import("@/js/msp")`, which is one reason Phase 1 wants `eslint-plugin-boundaries`.
        files: ["src/components/**/*.js", "src/components/**/*.ts", "src/components/**/*.vue"],
        rules: {
            "no-restricted-imports": [
                "warn",
                {
                    patterns: [
                        {
                            group: ["**/js/msp", "**/js/msp.js", "**/js/msp/**"],
                            message:
                                "MSP does not belong in a component. Move the call into a Pinia store action or a composable and consume the result here (#4800).",
                        },
                    ],
                },
            ],
        },
    },
    {
        // Build and release tooling: real Node scripts, not browser code. Without this
        // block `.mjs` matches no `files` pattern and is linted with zero rules.
        // The root config files are `.js` but equally Node-side, so the Node globals apply
        // there too.
        files: ["**/*.mjs", "*.config.js", "nuxt-ui.vite.js"],
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
    // Must stay last: turns off every core/plugin rule that overlaps with Prettier.
    // The core `indent` rule in particular cannot express Prettier's extra offset for a
    // call inside a ternary branch, so `eslint --fix` and `prettier --write` used to
    // fight over the same lines and `prettier --check` failed on 20 files.
    prettierConfig,
];
