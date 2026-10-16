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

import { createApp } from "vue";
import ui from "@nuxt/ui/vue-plugin";
import ReceiverMspWindow from "./ReceiverMspWindow.vue";
import { mirrorTheme } from "./themeMirror";
import { getNuxtUiRouter } from "../../../js/nuxt_ui_router";

// Import styles for the popup window
import "../../../css/opensans_webfontkit/fonts.css";
import "../../../css/theme.css";
import "../../../css/dark-theme.less";

// Follow the opener's dark mode and colour theme while this window is open.
const opener = globalThis.opener;
if (opener?.document) {
    globalThis.addEventListener("pagehide", mirrorTheme(opener.document, document));
}

// Create and mount Vue app. This popup is a separate document with its own Vue
// instance, so it has to register Nuxt UI itself; the router is required because
// UButton/ULink call vue-router's useRoute().
const app = createApp(ReceiverMspWindow);
app.use(getNuxtUiRouter()).use(ui);
app.mount("#app");
