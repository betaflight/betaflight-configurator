import Vue from "vue";
import VueI18Next from "@panter/vue-i18next";

Vue.use(VueI18Next);

// NOTE: this relies on global `i18next` eventually
// it should be consumed through modules.
const vueI18n = new VueI18Next(i18next);

export default vueI18n;
