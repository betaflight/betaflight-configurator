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
};
