module.exports = {
    parserOptions: {
        ecmaVersion: 2020,
        sourceType: "module",
    },
    extends: [
        "eslint:recommended",
        "plugin:vue/vue3-recommended",
        "plugin:storybook/recommended"
    ],
    env: {
        node: true,
        jquery: true,
        es2017: true,
        browser: true,
        webextensions: true,
    },
    rules: {
        "no-trailing-spaces": "error",
        "eol-last": "error",
        semi: "error",
        "no-extra-semi": "error",
        "comma-dangle": ["error", "always-multiline"],
        "no-var": "error",
        "prefer-template": "error",
        "template-curly-spacing": "error",
        "no-undef": "error",
        'no-duplicate-imports': 'error',
        "no-unused-vars": [
            "error", // or "error"
            {
                "argsIgnorePattern": "^_",
                "caughtErrorsIgnorePattern": "^_",
            },
        ],
        "no-useless-escape": "warn",
        "no-case-declarations": "warn",
        "no-prototype-builtins": "warn",
        "no-inner-declarations": "warn",
        "no-fallthrough": "warn",
    },
    globals: {
        cordova: true,
        cordovaUI: true,
        ol: true,
        wNumb: true,
        ConfigStorage: true,
        // start cordova bindings, remove after cordova is removed/replace/modularized
        cordova_serial: true,
        fileChooser: true,
        i18n: true,
        appReady: true,
        cordovaChromeapi: true,
        appAvailability: true,
        // end cordova bindings

        // globals for vite
        __APP_PRODUCTNAME__: "readonly",
        __APP_VERSION__: "readonly",
        __APP_REVISION__: "readonly",
    },
    // ignore src/dist folders
    ignorePatterns: ["src/dist/*"],
};
