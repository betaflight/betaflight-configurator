import semver from "semver";
import { API_VERSION_1_45, API_VERSION_1_46, API_VERSION_1_47, API_VERSION_1_48 } from "./data_storage";

/**
 * Input limits for the Failsafe tab, per firmware API version.
 *
 * The firmware CLI limits for the failsafe and GPS Rescue settings changed with
 * nearly every release, so the tab has to follow the API version reported by the
 * connected flight controller. Limits are expressed in the units shown in the UI:
 * ascend rate, descend rate and ground speed are entered in m/s while the firmware
 * stores cm/s, and the failsafe delays are entered in seconds while the firmware
 * stores either tenths of a second or seconds, depending on the API version.
 *
 * Entries carry `scale` where the firmware unit differs from the UI unit, so the
 * tab does not have to hardcode a conversion that only holds for some releases.
 *
 * The baseline is API 1.44 (4.3), the oldest version the configurator connects to.
 *
 * @param {string} apiVersion semver string as reported by the flight controller
 * @returns {Object<string, {min: number, max: number, step?: number, scale?: number}>}
 */
export function getFailsafeLimits(apiVersion) {
    const version = semver.valid(apiVersion) ? apiVersion : "0.0.0";

    // Applies each override whose API version the flight controller meets,
    // so the last matching entry wins.
    const pick = (baseline, ...overrides) => {
        let limits = baseline;
        for (const [minimumApiVersion, override] of overrides) {
            if (semver.gte(version, minimumApiVersion)) {
                limits = override;
            }
        }
        return limits;
    };

    return {
        // failsafe_off_delay stores tenths of a second (0-200 -> 0-20s). 1.47 renamed
        // it to failsafe_landing_time and changed the unit to whole seconds (0-250),
        // so the step and the scaling in the tab change with it.
        offDelay: pick({ min: 0, max: 20, step: 0.1, scale: 10 }, [
            API_VERSION_1_47,
            { min: 0, max: 250, step: 1, scale: 1 },
        ]),

        // gps_rescue_initial_alt, renamed to gps_rescue_return_alt in 1.45
        returnAltitude: pick(
            { min: 20, max: 100 },
            [API_VERSION_1_45, { min: 2, max: 255 }],
            [API_VERSION_1_46, { min: 5, max: 1000 }],
        ),

        // gps_rescue_initial_climb, only sent over MSP from 1.46
        initialClimb: { min: 0, max: 100 },

        // gps_rescue_ascend_rate
        ascendRate: pick({ min: 1, max: 25 }, [API_VERSION_1_45, { min: 0.5, max: 25 }]),

        // gps_rescue_ground_speed, renamed to gps_rescue_return_speed in 1.45.
        // 4.3 allows 30-3000 cm/s, so the baseline minimum is 0.3 m/s, not 3.
        groundSpeed: pick({ min: 0.3, max: 30 }, [API_VERSION_1_45, { min: 0, max: 30 }]),

        // gps_rescue_angle, renamed to gps_rescue_max_rescue_angle in 1.45
        // and moved to autopilot_max_angle in 1.48.
        // 4.4 shipped 0-60, and later 1.45 dev builds widened it to 0-80. Take the
        // wider bound so a value stored by such a build is not clamped on load;
        // MSP_SET_GPS_RESCUE does not range check what the tab sends either way.
        angle: pick(
            { min: 0, max: 200 },
            [API_VERSION_1_45, { min: 0, max: 80 }],
            [API_VERSION_1_46, { min: 30, max: 60 }],
            [API_VERSION_1_48, { min: 10, max: 70 }],
        ),

        // gps_rescue_descent_dist
        descentDistance: pick(
            { min: 30, max: 500 },
            [API_VERSION_1_45, { min: 5, max: 500 }],
            [API_VERSION_1_46, { min: 10, max: 500 }],
            [API_VERSION_1_48, { min: 5, max: 500 }],
        ),

        // gps_rescue_descend_rate
        descendRate: pick({ min: 1, max: 5 }, [API_VERSION_1_45, { min: 0.25, max: 5 }]),

        // gps_rescue_throttle_min/max/hover. MSP_GPS_RESCUE still carries them, but
        // from 1.47 they are read from and written to the autopilot settings, which
        // have their own narrower ranges. Hover throttle widened again in 1.48.
        throttleMin: pick({ min: 1000, max: 2000 }, [API_VERSION_1_47, { min: 1050, max: 1400 }]),
        throttleMax: pick({ min: 1000, max: 2000 }, [API_VERSION_1_47, { min: 1400, max: 2000 }]),
        throttleHover: pick(
            { min: 1000, max: 2000 },
            [API_VERSION_1_47, { min: 1100, max: 1700 }],
            [API_VERSION_1_48, { min: 0, max: 1700 }],
        ),

        // gps_rescue_min_dth, renamed to gps_rescue_min_start_dist in 1.45.
        // The meaning changed in 1.46: instead of blocking a rescue that starts
        // close to home, the aircraft now flies out to this distance first, hence
        // the much smaller range.
        minStartDist: pick(
            { min: 50, max: 1000 },
            [API_VERSION_1_45, { min: 20, max: 1000 }],
            [API_VERSION_1_46, { min: 10, max: 30 }],
            [API_VERSION_1_48, { min: 5, max: 30 }],
        ),

        // gps_rescue_min_sats
        minSats: { min: 5, max: 50 },
    };
}
