import { createApp } from "vue";
import ui from "@nuxt/ui/vue-plugin";
import ReceiverMspWindow from "./ReceiverMspWindow.vue";
import windowWatcherUtil from "../../../js/utils/window_watchers";
import { getNuxtUiRouter } from "../../../js/nuxt_ui_router";

// Import styles for the popup window
import "../../../css/opensans_webfontkit/fonts.css";
import "../../../css/theme.css";
import "../../../css/dark-theme.less";

// Set up dark theme watcher to receive theme changes from the parent window
windowWatcherUtil.bindWatchers(globalThis, {
    darkTheme: (val) => {
        document.documentElement.classList.toggle("dark", val);
    },
});

// Create and mount Vue app. This popup is a separate document with its own Vue
// instance, so it has to register Nuxt UI itself; the router is required because
// UButton/ULink call vue-router's useRoute().
const app = createApp(ReceiverMspWindow);
app.use(getNuxtUiRouter()).use(ui);
app.mount("#app");
