module.exports = {
    parserOptions: {
        ecmaVersion: 2020,
        sourceType: "module",
        allowImportExportEverywhere: true,
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
    },
};
