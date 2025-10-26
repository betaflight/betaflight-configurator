import { defineConfig } from "eslint-define-config";
import vuePlugin from "eslint-plugin-vue";
import prettierPlugin from "eslint-plugin-prettier";
import unusedImportsPlugin from "eslint-plugin-unused-imports";
import vueParser from "vue-eslint-parser";

export default defineConfig([
    {
        files: ["**/*.js", "**/*.vue"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            globals: {
                ol: "readonly",
                wNumb: "readonly",
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
        ignores: ["dist/", "*.json", "*.html", "*.less", "*.css", "package.json"],
    },
    {
        files: ["**/*.vue"],
        languageOptions: {
            parser: vueParser,
        },
        processor: "vue/vue",
    },
]);
