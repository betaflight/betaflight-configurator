/** <command> ::= "board_name" <name>
 *            | "board_name"
 *            | "dshot_telemetry_info"
 *            | "exit"
 *            | "mcu_id"
 *            | "rc_smoothing_info"
 *            | "save"
 *            | "sd_info"
 *            | "status"
 *            | "tasks"
 *            | "version"
 *            | "vtx_info"
 *
 *  <name> ::= <string>
 *
 *  <string> ::= <char> <string>
 *             | <char>
 *
 *  <char> ::= "a" | "b" | "c" | ... | "z"
 *           | "A" | "B" | "C" | ... | "Z"
 *           | "0" | "1" | ... | "9"
 *           | "_"
 */

import MSPCodes from "../msp/MSPCodes";

function validateCraftName(name) {
    // only extend ascii characters are allowed
    // up to 16 characters in length
    return /^[\x00-\xFF]{1,16}$/.test(name);
}

const encoder = new TextEncoder();

// TODO: some commands return single item, some array, need
// to think which api is better in long run
const MSP_COMMANDS = {
    // TODO: should we support old board name based on MSP1?
    board_name(args) {
        if (args.length === 0) {
            return {
                code: MSPCodes.MSP2_GET_TEXT,
                data: [MSPCodes.CRAFT_NAME],
            };
        }
        // TODO: what happens if we pass in more arguments
        // TODO: what happens if we pass in space into name argument?
        if (args.length === 1) {
            const isValidName = validateCraftName(args[0]);
            if (isValidName) {
                return {
                    code: MSPCodes.MSP2_SET_TEXT,
                    // TODO: shoule we validate name
                    data: [
                        MSPCodes.CRAFT_NAME,
                        ...encoder.encode(args[0]),
                    ],
                };
            } else {
                // TODO: should we throw an error here?
                throw new Error("Invalid craft name");
            }
        }
    },
    // TODO: what should we be doing with multiple msp commands?
    version() {
        return [
            {
                code: MSPCodes.MSP_BOARD_INFO,
            },
            {
                code: MSPCodes.MSP_BUILD_INFO,
            },
            {
                code: MSPCodes.MSP_API_VERSION,
            },
        ];
    },
    status() {
        return [
            {
                code: MSPCodes.MSP_BOARD_INFO,
            },
            {
                code: MSPCodes.MSP_STATUS, // MSP_STATUS_EX seems to return the same thing
            },
            {
                code: MSPCodes.MSP2_SENSOR_CONFIG_ACTIVE,
            },
            {
                code: MSPCodes.MSP2_GET_TEXT,
                data: [MSPCodes.BUILD_KEY],
            },
            {
                code: MSPCodes.MSP2_GET_TEXT,
                // NOTE: seems to be missing from our constants
                data: [MSPCodes.MSP2TEXT_RELEASENAME],
            },
            {
                code: MSPCodes.MSP_RTC,
            },
            {
                code: MSPCodes.MSP_BATTERY_STATE, // MSP_ANALOG seems to have similar values think when we could use it?
            },
            {
                code: MSPCodes.MSP_SDCARD_SUMMARY, // need to verify if this is enough
            },
            {
                code: MSPCodes.MSP_GPS_CONFIG,
            },
            {
                code: MSPCodes.MSP_RAW_GPS,
            },
            {
                code: MSPCodes.MSP_COMP_GPS,
            },
            {
                code: MSPCodes.MSP_GPSSVINFO, // this seems to only exist in firmware but not configurator atm
            },
        ];
    },
    tasks() {
        // NOTE: literally nothing in MSP is obviously matching this CLI command
        throw new Error("Not implemented");
    },
    dshot_telemetry_info() {
        return {
            code: MSPCodes.MSP_MOTOR_TELEMETRY,
        };
    },
    exit() {
        // NOTE does it even make sense to have `exit` if it's msp driven?
        throw new Error("Not implemented");
    },
    mcu_id() {
        return {
            code: MSPCodes.MSP_UID,
        };
    },
    rc_smoothing_info() {
        return {
            code: MSPCodes.MSP_RX_CONFIG,
        };
    },
    save() {
        return [
            {
                code: MSPCodes.MSP_SET_BOARD_INFO, // not sure, because that one gets input and saves
            },
            {
                code: MSPCodes.MSP_SET_SIGNATURE, // not sure, because that one gets input and saves
            },
        ];
    },
    sd_info() {
        return {
            code: MSPCodes.MSP_SDCARD_SUMMARY,
        };
    },
    vtx_info() {
        return {
            code: MSPCodes.MSP2_GET_VTX_DEVICE_STATUS, // or MSP_VTX_CONFIG?
        };
    },
};

// TODO: think if it's worth splitting this
//       up into tokenization and parsing
export function parse(input) {
    const parts = input.trim().split(/\s+/);
    const commandName = parts[0].toLowerCase();
    const args = parts.slice(1);

    if (commandName in MSP_COMMANDS) {
        return MSP_COMMANDS[commandName](args);
    } else {
        throw new Error("Unsupported command");
    }
}
