// This module is imported for its side effects: setting up i18next
// and initializing the Vue app with plugins and global model.
import "../js/localization.js";
import "../js/injected_methods";
import i18next from "i18next";
import { createApp, reactive } from "vue";
import ui from "@nuxt/ui/vue-plugin";
import tippy from "tippy.js";
import "tippy.js/dist/tippy.css";
import I18NextVue from "i18next-vue";
import FC from "../js/fc.js";
import MSP from "../js/msp.js";
import PortHandler from "../js/port_handler.js";
import PortUsage from "../js/port_usage.js";
import CONFIGURATOR from "../js/data_storage.js";
import { BetaflightComponents } from "../js/vue_components.js";
import { getNuxtUiRouter } from "../js/nuxt_ui_router.js";
import { pinia } from "../js/pinia_instance.js";
import { get as getConfig } from "../js/ConfigStorage.js";

// Connection tracking object
const CONNECTION = reactive({
    timestamp: null,
});

/*
 Most of the global objects can go here at first.
 It's a bit of overkill for simple components,
 but these instance would eventually have more children
 which would find the use for those extra properties.

 FIXME For some reason, some of them (like PortHandler and FC)
 need to be marked as reactive in it's own module, to detect
 changes in arrays so I added the `reactive` wrapper there too.
*/
const betaflightModel = reactive({
    CONFIGURATOR,
    FC,
    MSP,
    PortUsage,
    PortHandler,
    CONNECTION,
    // Reactive expert mode flag to drive tab visibility via Vue
    // Load from ConfigStorage on init
    expertMode: !!getConfig("expertMode").expertMode,
});

tippy.setDefaultProps({
    allowHTML: true,
    appendTo: () => document.body,
    delay: 100,
    interactive: true,
    placement: "right",
    theme: "custom",
    // Un-comment for debugging:
    // hideOnClick: false,
    // trigger: 'click',
});

i18next.on("initialized", function () {
    console.log("i18n initialized, starting Vue framework");

    const app = createApp({
        setup() {
            return betaflightModel;
        },
    });

    app.use(pinia)
        .use(I18NextVue, { i18next })
        .use(BetaflightComponents)
        .use(getNuxtUiRouter())
        .use(ui)
        .mount("#main-wrapper");

    if (process.env.NODE_ENV === "development") {
        console.log("Development mode enabled, installing Vue tools");
        // TODO Vue.config.devtools = true;
        app.config.performance = true;
    }
});

export { betaflightModel };
