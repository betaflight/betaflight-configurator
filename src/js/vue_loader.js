import { createApp } from "vue";
import { BetaflightComponents } from "./vue_components.js";
import I18NextVue from "i18next-vue";
import i18next from "i18next";

const logHead = "[VUE_LOADER]";

// Store Vue app instances for proper cleanup
const vueAppInstances = new WeakMap();

// Function to load tab content while preserving Vue functionality
export function loadContent(contentElement, htmlPath, callback) {
    console.log(logHead, "vueAppInstances", vueAppInstances);
    // Unmount any existing Vue apps before loading new content
    unmountVueApps(contentElement);

    // Load the HTML content
    contentElement.load(htmlPath, function (responseText, textStatus, xhr) {
        // Check if the load was successful
        if (textStatus !== "success") {
            console.error(`${logHead} Failed to load content from ${htmlPath}:`, textStatus, xhr?.status);

            // Call the callback with error information if provided
            if (callback) {
                callback(new Error(`Failed to load content: ${textStatus}`));
            }
            return;
        }

        console.log(`${logHead} Successfully loaded content from ${htmlPath}`);

        // Find all elements that need Vue functionality
        const vueElements = contentElement.find("[data-vue]");

        if (vueElements.length > 0) {
            console.log(`${logHead} Found ${vueElements.length} Vue element(s) to mount`);
        }

        // For each Vue element, create a new Vue app instance
        vueElements.each(function (index) {
            const el = $(this);
            const app = createApp({});

            // Add the components plugin
            app.use(BetaflightComponents);
            app.use(I18NextVue, { i18next });

            // Mount the app to this element and store the instance
            const mountedApp = app.mount(el[0]);
            console.log(
                `${logHead} Mounted Vue app ${index + 1}/${vueElements.length} on element with data-vue attribute`,
            );

            // Store the app instance for later cleanup
            if (!vueAppInstances.has(contentElement[0])) {
                vueAppInstances.set(contentElement[0], []);
            }
            vueAppInstances.get(contentElement[0]).push(app);
        });

        // Call the original callback (success case)
        if (callback) {
            callback();
        }
    });
}

// Helper function to unmount existing Vue apps
function unmountVueApps(contentElement) {
    const apps = vueAppInstances.get(contentElement[0]);
    if (apps && apps.length > 0) {
        console.log(`${logHead} Unmounting ${apps.length} existing Vue app(s)`);
        apps.forEach((app, index) => {
            try {
                app.unmount();
                console.log(`${logHead} Successfully unmounted Vue app ${index + 1}/${apps.length}`);
            } catch (error) {
                console.warn(`${logHead} Error unmounting Vue app ${index + 1}:`, error);
            }
        });
        // Clear the stored apps
        vueAppInstances.set(contentElement[0], []);
        console.log(`${logHead} Cleared Vue app instances from container`);
    }
}
