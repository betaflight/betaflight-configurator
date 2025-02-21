module.exports = {
    parserOptions: {
        ecmaVersion: 2020,
        sourceType: "module",
    },
    extends: ["plugin:vue/recommended", "prettier"],
    env: {
        node: true,
        jquery: true,
        es2017: true,
        browser: true,
        webextensions: true,
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
