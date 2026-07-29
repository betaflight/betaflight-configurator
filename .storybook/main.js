import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mergeConfig } from "vite";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export default {
    // Stories live under src/components. Scoped here (rather than "../src/**")
    // so the Vite build output in src/dist is not indexed as duplicates.
    stories: ["../src/**/*.mdx", "../src/components/**/*.stories.@(js|jsx|ts|tsx)"],
    addons: ["@storybook/addon-links", "@storybook/addon-docs"],
    framework: "@storybook/vue3-vite",
    staticDirs: [
        { from: "../locales", to: "/locales" },
        { from: "../src/css", to: "/css" },
    ],
    // The app resolves absolute "/images/*" asset URLs via its Vite `root: src`
    // config. Storybook uses its own root, so alias them explicitly here.
    async viteFinal(config) {
        return mergeConfig(config, {
            resolve: {
                alias: {
                    "/images/": `${resolve(projectRoot, "src/images")}/`,
                },
            },
        });
    },
};
