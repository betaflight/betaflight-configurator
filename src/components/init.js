// This modules is imported and has side effect of attaching the
// `i18n` helper to window and setting up `i18next`
// in the future it should be pure. This means it should
// explicitly export things used by other parts of the app.
import '../js/localization.js';
import '../js/injected_methods';
import i18next from 'i18next';
import Vue from "vue";
import vueI18n from "./vueI18n.js";
import BatteryLegend from "./quad-status/BatteryLegend.vue";
import BetaflightLogo from "./betaflight-logo/BetaflightLogo.vue";
import StatusBar from "./status-bar/StatusBar.vue";
import BatteryIcon from "./quad-status/BatteryIcon.vue";
import FC from '../js/fc.js';
import MSP from '../js/msp.js';
import PortUsage from '../js/port_usage.js';
import PortPicker from './port-picker/PortPicker.vue';
import CONFIGURATOR from '../js/data_storage.js';

// Most of the global objects can go here at first.
// It's a bit of overkill for simple components,
// but these instance would eventually have more children
// which would find the use for those extra properties.
const betaflightModel = {
    CONFIGURATOR,
    FC,
    MSP,
    PortUsage,
};

i18next.on('initialized', function() {

    console.log("i18n initialized, starting Vue framework");

    if (process.env.NODE_ENV === 'development') {
        console.log("Development mode enabled, installing Vue tools");
        Vue.config.devtools = true;
    }

    const app = new Vue({
        i18n: vueI18n,
        el: '#main-wrapper',
        components: {
            BatteryLegend,
            BetaflightLogo,
            StatusBar,
            BatteryIcon,
            PortPicker,
        },
        data: betaflightModel,
    });
});


// Not strictly necessary here, but if needed
// it's always possible to modify this model in
// jquery land to trigger updates in vue
window.vm = betaflightModel;
