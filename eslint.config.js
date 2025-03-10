import { defineConfig } from "eslint-define-config";
import vuePlugin from "eslint-plugin-vue";
import prettierPlugin from "eslint-plugin-prettier";
import vueParser from "vue-eslint-parser";

export default defineConfig([
    {
        files: ["**/*.js", "**/*.vue"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            globals: {
                cordova: "readonly",
                cordovaUI: "readonly",
                ol: "readonly",
                wNumb: "readonly",
                ConfigStorage: "readonly",
                // start cordova bindings, remove after cordova is removed/replace/modularized
                cordova_serial: "readonly",
                fileChooser: "readonly",
                i18n: "readonly",
                appReady: "readonly",
                cordovaChromeapi: "readonly",
                appAvailability: "readonly",
                // end cordova bindings

                // globals for vite
                __APP_PRODUCTNAME__: "readonly",
                __APP_VERSION__: "readonly",
                __APP_REVISION__: "readonly",
            },
        },
        plugins: {
            vue: vuePlugin,
            prettier: prettierPlugin,
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
