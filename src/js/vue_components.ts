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

import type { App as VueApp, Plugin } from "vue";
import BatteryLegend from "../components/quad-status/BatteryLegend.vue";
import BetaflightLogo from "../components/betaflight-logo/BetaflightLogo.vue";
import StatusBar from "../components/status-bar/StatusBar.vue";
import BatteryIcon from "../components/quad-status/BatteryIcon.vue";
import BottomStatusIcons from "../components/quad-status/BottomStatusIcons.vue";
import DataFlash from "../components/data-flash/DataFlash.vue";
import SensorStatus from "../components/sensor-status/SensorStatus.vue";
import DevicePicker from "../components/device-picker/DevicePicker.vue";
import UserSession from "../components/user-session/UserSession.vue";
import WikiButton from "../components/elements/WikiButton.vue";
import Dialog from "../components/elements/Dialog.vue";
import App from "../App.vue";

// Create a Vue plugin that registers all components globally
export const BetaflightComponents = {
    install(app: VueApp) {
        app.component("App", App);
        // Register all components globally
        app.component("BetaflightLogo", BetaflightLogo);
        app.component("BatteryLegend", BatteryLegend);
        app.component("StatusBar", StatusBar);
        app.component("BatteryIcon", BatteryIcon);
        app.component("BottomStatusIcons", BottomStatusIcons);
        app.component("DataFlash", DataFlash);
        app.component("SensorStatus", SensorStatus);
        app.component("DevicePicker", DevicePicker);
        app.component("UserSession", UserSession);
        app.component("WikiButton", WikiButton);
        app.component("Dialog", Dialog);
    },
} satisfies Plugin;
