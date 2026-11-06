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
import { createPinia } from "pinia";
import ui from "@nuxt/ui/vue-plugin";
import I18NextVue from "i18next-vue";
import LogWindow from "./LogWindow.vue";
import { mirrorTheme } from "../../js/utils/themeMirror";
import { getNuxtUiRouter } from "../../js/nuxt_ui_router";
import { followLog, type LogWindowHost } from "../../js/log_window";

import "../../css/opensans_webfontkit/fonts.css";
import "../../css/theme.css";
import "../../css/dark-theme.less";

const host = globalThis as typeof globalThis & LogWindowHost;
const { i18next, logChannel } = host;

// The opener hands these over when it creates the window; a reload loses them, and the
// window cannot mirror the log without them.
if (!i18next || !logChannel) {
    globalThis.close();
} else {
    const opener = globalThis.opener as Window | null;
    if (opener?.document) {
        globalThis.addEventListener("pagehide", mirrorTheme(opener.document, document));
    }
    document.title = i18next.t("tabLog");

    const app = createApp(LogWindow);
    app.use(createPinia()).use(getNuxtUiRouter()).use(ui).use(I18NextVue, { i18next });
    app.mount("#app");
    globalThis.addEventListener("pagehide", followLog(logChannel));
}
