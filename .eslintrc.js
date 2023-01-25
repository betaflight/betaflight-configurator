module.exports = {
    parserOptions: {
        ecmaVersion: 2020,
        sourceType: "module",
    },
    extends: ["plugin:vue/recommended"],
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
    },
};
