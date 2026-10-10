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

import MSP from "../../js/msp";
import MSPCodes from "../../js/msp/MSPCodes";
import { useInterval } from "@/composables/useInterval";

/** A live sensor stream the panel can poll; gyro, accel and mag share the one MSP_RAW_IMU pull. */
export type LiveSensorPull = "imu" | "altitude" | "sonar" | "pitot" | "debug";

const PULLS: Record<LiveSensorPull, { name: string; code: number }> = {
    imu: { name: "IMU_pull", code: MSPCodes.MSP_RAW_IMU },
    altitude: { name: "altitude_pull", code: MSPCodes.MSP_ALTITUDE },
    sonar: { name: "sonar_pull", code: MSPCodes.MSP_SONAR },
    pitot: { name: "pitot_pull", code: MSPCodes.MSP_PITOT },
    debug: { name: "debug_pull", code: MSPCodes.MSP_DEBUG },
};

/**
 * MSP traffic for the Sensors tab's live sensor panel: the config it decodes debug values with,
 * and the per-sensor polling. Replies land in the flightController store; the panel only renders.
 */
export function useLiveSensorData() {
    const { addInterval, removeInterval } = useInterval();

    /** Motor config, for motor_poles in the DSHOT_RPM_TELEMETRY debug decode. */
    const loadMotorConfig = async () => {
        await MSP.promise(MSPCodes.MSP_MOTOR_CONFIG);
    };

    /** Advanced config, which carries the active debug mode. */
    const loadAdvancedConfig = async () => {
        await MSP.promise(MSPCodes.MSP_ADVANCED_CONFIG);
    };

    /**
     * Poll one sensor stream until it is stopped or the panel unmounts. The first request goes
     * out immediately; restarting a stream replaces its interval.
     * @param onReply called after each reply, once the store holds the new sample
     */
    const startPolling = (sensor: LiveSensorPull, periodMs: number, onReply: () => void) => {
        const { name, code } = PULLS[sensor];
        addInterval(
            name,
            () => {
                MSP.send_message(code, false, false, onReply);
            },
            periodMs,
            true,
        );
    };

    /** Stop every sensor stream before the panel re-registers the ticked ones. */
    const stopPolling = () => {
        for (const { name } of Object.values(PULLS)) {
            removeInterval(name);
        }
    };

    return { loadMotorConfig, loadAdvancedConfig, startPolling, stopPolling };
}
