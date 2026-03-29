export default {
    stories: ["../src/**/*.stories.mdx", "../src/**/*.stories.@(js|jsx|ts|tsx)"],
    addons: ["@storybook/addon-links", "@storybook/addon-essentials"],
    framework: "@storybook/vue3",
    staticDirs: [
        { from: "../locales", to: "/locales" },
        { from: "../src/css", to: "/css" },
    ],
};
