import { createApp } from "vue";
import { BetaflightComponents } from "./vue_components.js";
import I18NextVue from "i18next-vue";
import i18next from "i18next";

// Function to load tab content while preserving Vue functionality
export function loadContent(contentElement, htmlPath, callback) {
    // Load the HTML content
    contentElement.load(htmlPath, function () {
        // Find all elements that need Vue functionality
        const vueElements = contentElement.find("[data-vue]");

        // For each Vue element, create a new Vue app instance
        vueElements.each(function () {
            const el = $(this);
            const app = createApp({});

            // Add the components plugin
            app.use(BetaflightComponents);
            app.use(I18NextVue, { i18next });

            // Mount the app to this element
            app.mount(el[0]);
        });

        // Call the original callback
        if (callback) {
            callback();
        }
    });
}
