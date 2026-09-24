/*
 * This file is part of Betaflight.
 *
 * Betaflight is free software. You can redistribute this software
 * and/or modify this software under the terms of the GNU General
 * Public License as published by the Free Software Foundation,
 * either version 3 of the License, or (at your option) any later
 * version.
 *
 * Betaflight is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this software.
 *
 * If not, see <http://www.gnu.org/licenses/>.
 */

// This module is imported for its side effects: setting up i18next
// and initializing the Vue app with plugins and global model.
import "../js/localization.js";
import "../js/injected_methods";
import i18next from "i18next";
import { createApp, reactive } from "vue";
import ui from "@nuxt/ui/vue-plugin";
import I18NextVue from "i18next-vue";
import FC from "../js/fc";
import MSP from "../js/msp";
import DeviceHandler from "../js/device_handler.js";
import PortUsage from "../js/port_usage.js";
import CONFIGURATOR from "../js/data_storage";
import { BetaflightComponents } from "../js/vue_components.js";
import { getNuxtUiRouter } from "../js/nuxt_ui_router.js";
import { pinia } from "../js/pinia_instance.js";
import { get as getConfig } from "../js/ConfigStorage";

// Connection tracking object
const CONNECTION = reactive({
    timestamp: null as number | null,
});

/*
 Most of the global objects can go here at first.
 It's a bit of overkill for simple components,
 but these instance would eventually have more children
 which would find the use for those extra properties.

 Members that their own module mutates (DeviceHandler, CONFIGURATOR, ...) are made
 reactive in that module: the reactive() below only tracks writes made through this
 proxy, not writes through the module's own reference. FC is the flightController
 Pinia store, which is reactive already.
*/
const betaflightModel = reactive({
    CONFIGURATOR,
    FC,
    MSP,
    PortUsage,
    DeviceHandler,
    CONNECTION,
    // Reactive expert mode flag to drive tab visibility via Vue
    // Load from ConfigStorage on init
    expertMode: !!getConfig("expertMode").expertMode,
});

export type BetaflightModel = typeof betaflightModel;

declare global {
    // Partial because App.vue installs a stand-in with only `expertMode` when it loads without this module.
    var vm: Partial<BetaflightModel> | undefined;
}

// Keep the legacy global model available while the app finishes moving away from imperative globals.
globalThis.vm = betaflightModel;

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
        // Vue 3 enables devtools in development builds on its own; this adds performance tracing.
        console.log("Development mode enabled, enabling Vue performance tracing");
        app.config.performance = true;
    }
});

export { betaflightModel };
