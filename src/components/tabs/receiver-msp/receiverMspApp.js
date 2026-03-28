import { createApp } from "vue";
import ReceiverMspWindow from "./ReceiverMspWindow.vue";
import windowWatcherUtil from "../../../js/utils/window_watchers";

// Import styles for the popup window
import "../../../css/opensans_webfontkit/fonts.css";
import "../../../css/theme.css";
import "../../../css/dark-theme.less";

// Set up dark theme watcher to receive theme changes from the parent window
windowWatcherUtil.bindWatchers(globalThis, {
    darkTheme: (val) => {
        document.body.classList.toggle("dark-theme", val);
    },
});

// Create and mount Vue app
const app = createApp(ReceiverMspWindow);
app.mount("#app");
