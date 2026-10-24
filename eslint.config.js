import vuePlugin from "eslint-plugin-vue";
import prettierConfig from "eslint-config-prettier/flat";
import unusedImportsPlugin from "eslint-plugin-unused-imports";
import vueParser from "vue-eslint-parser";
import tseslint from "typescript-eslint";
import globals from "globals";
import boundariesPlugin from "eslint-plugin-boundaries";

export default [
    {
        // Build output has to be ignored globally rather than per-config: a `dist/` left in the
        // tree otherwise gets linted as source, and minified bundles produce thousands of errors.
        ignores: ["dist/**", "src/dist/**"],
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
        // vendor.ts pulls in Leaflet and its plugins for their side effects, and they register
        // themselves on `window.L` rather than exporting anything. `chrome` is the Chrome Apps
        // storage path, absent everywhere else, which is why pref_storage guards on it.
        // TypeScript files get both from their declarations; a .vue file still runs no-undef.
        files: ["src/blackbox-viewer/**/*.vue"],
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
            // Shared styles belong in theme.css or nuxt-ui.css; a component's own styles nest
            // under its root class instead of relying on `scoped` (#4995, #5542).
            "vue/enforce-style-attribute": ["error", { allow: ["plain", "module"] }],
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
    {
        // The app is TypeScript (#5542), and tsconfig.json has `allowJs: false`.
        files: ["src/**/*.js"],
        // The MSP debug tools are dev-only and loaded on demand, so they stay JavaScript behind a
        // .d.ts for their entry point. The vendored three.js renderer stays close to its upstream
        // source, typed by a .d.ts.
        ignores: ["src/js/msp/debug/**", "src/js/utils/three/**"],
        rules: {
            "no-restricted-syntax": [
                "error",
                {
                    selector: "Program",
                    message: "The app is TypeScript-only: write a .ts file instead (#5542).",
                },
            ],
        },
    },
    {
        // A component that imports MSP talks to the flight controller itself, past the store
        // that keeps FC state authoritative (#4800): MSP belongs in a store action or a composable.
        // `src/js/**` is the transport layer that MSP itself is built from, so it may use it too.
        // Type-only imports carry no runtime dependency, so they stay allowed (OSD's MspResponse).
        files: ["src/**/*.js", "src/**/*.ts", "src/**/*.vue"],
        plugins: {
            boundaries: boundariesPlugin,
        },
        settings: {
            "import/resolver": {
                typescript: { project: "./tsconfig.json" },
            },
            // First match wins, so the MSP clients are carved out before the catch-all.
            "boundaries/elements": [
                {
                    type: "msp-client",
                    pattern: ["src/stores/**", "src/composables/**", "src/js/**"],
                    partialMatch: false,
                },
                { type: "ui", pattern: "src/**", partialMatch: false },
            ],
            "boundaries/files": [{ category: "msp", pattern: ["src/js/msp.ts", "src/js/msp/**"] }],
        },
        rules: {
            "boundaries/dependencies": [
                "error",
                {
                    default: "allow",
                    policies: [
                        {
                            from: { element: { type: "ui" } },
                            disallow: {
                                to: { file: { categories: "msp" } },
                                dependency: { kind: "value" },
                            },
                            message:
                                "Only stores, composables and src/js may import MSP: move the call into a store action or a composable (#4800).",
                        },
                    ],
                },
            ],
        },
    },
    // Must stay last: turns off every core/plugin rule that overlaps with Prettier.
    // The core `indent` rule in particular cannot express Prettier's extra offset for a
    // call inside a ternary branch, so `eslint --fix` and `prettier --write` used to
    // fight over the same lines and `prettier --check` failed on 20 files.
    prettierConfig,
];
