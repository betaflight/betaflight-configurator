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

import type { Component } from "vue";
import HelpTab from "../components/tabs/HelpTab.vue";
import LandingTab from "../components/tabs/LandingTab.vue";
import PortsTab from "../components/tabs/PortsTab.vue";
import ServosTab from "../components/tabs/ServosTab.vue";
import ConfigurationTab from "../components/tabs/ConfigurationTab.vue";
import UserProfileTab from "../components/tabs/UserProfileTab.vue";
import BackupsTab from "../components/tabs/BackupsTab.vue";
import LoggingTab from "../components/tabs/LoggingTab.vue";
import GpsTab from "../components/tabs/GpsTab.vue";
import AuxiliaryTab from "../components/tabs/AuxiliaryTab.vue";
import OnboardLoggingTab from "../components/tabs/OnboardLoggingTab.vue";
import FirmwareFlasherTab from "../components/tabs/FirmwareFlasherTab.vue";
import AdjustmentsTab from "../components/tabs/AdjustmentsTab.vue";
import CliTab from "../components/tabs/CliTab.vue";
import PowerTab from "../components/tabs/PowerTab.vue";
import SensorsTab from "../components/tabs/SensorsTab.vue";
import FlightPlanTab from "../components/tabs/FlightPlanTab.vue";
import LedStripTab from "../components/tabs/LedStripTab.vue";
import FailsafeTab from "../components/tabs/FailsafeTab.vue";
import MotorsTab from "../components/tabs/MotorsTab.vue";
import FrameTab from "../components/tabs/FrameTab.vue";
import ReceiverTab from "../components/tabs/ReceiverTab.vue";
import OsdTab from "../components/tabs/OsdTab.vue";
import SetupTab from "../components/tabs/SetupTab.vue";
import PidTuningTab from "../components/tabs/PidTuningTab.vue";
import PreflightTab from "../components/tabs/PreflightTab.vue";
import VtxTab from "../components/tabs/VtxTab.vue";
import PresetsTab from "../components/tabs/PresetsTab.vue";
import AutotuneTab from "../components/tabs/AutotuneTab.vue";
import BlackboxViewerTab from "../components/tabs/BlackboxViewerTab.vue";

export const VueTabComponents = {
    help: HelpTab,
    landing: LandingTab,
    ports: PortsTab,
    servos: ServosTab,
    configuration: ConfigurationTab,
    user_profile: UserProfileTab,
    backups: BackupsTab,
    logging: LoggingTab,
    gps: GpsTab,
    auxiliary: AuxiliaryTab,
    onboard_logging: OnboardLoggingTab,
    firmware_flasher: FirmwareFlasherTab,
    adjustments: AdjustmentsTab,
    cli: CliTab,
    power: PowerTab,
    sensors: SensorsTab,
    flight_plan: FlightPlanTab,
    led_strip: LedStripTab,
    failsafe: FailsafeTab,
    motors: MotorsTab,
    frame: FrameTab,
    receiver: ReceiverTab,
    osd: OsdTab,
    setup: SetupTab,
    pid_tuning: PidTuningTab,
    preflight: PreflightTab,
    vtx: VtxTab,
    presets: PresetsTab,
    autotune: AutotuneTab,
    blackbox_viewer: BlackboxViewerTab,
} satisfies Record<string, Component>;
