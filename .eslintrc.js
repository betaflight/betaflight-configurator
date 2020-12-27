module.exports = {
    parserOptions: {
        ecmaVersion: 2020,
        sourceType: "module"
    },
    extends: ["plugin:vue/recommended"],
    env: {
        node: true,
        jquery: true,
        es2017: true,
        browser: true,
        webextensions: true
    },
    rules: {
        "no-trailing-spaces": "error",
        "eol-last": "error"
    }
};
