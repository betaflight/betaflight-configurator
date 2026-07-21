// Ported from am32-firmware/am32-configurator:
//   src/eeprom.ts
//   utils/buffer-to-settings.ts
//   utils/object-to-settings-array.ts
// Source: https://github.com/am32-firmware/am32-configurator
// License: GPL-3.0-compatible with this application.

import Mcu from "./mcu.js";

export const EepromLayout = {
    BOOT_BYTE: { offset: 0x00, size: 1 },
    LAYOUT_REVISION: { offset: 0x01, size: 1 },
    BOOT_LOADER_REVISION: { offset: 0x02, size: 1 },
    MAIN_REVISION: { offset: 0x03, size: 1 },
    SUB_REVISION: { offset: 0x04, size: 1 },
    MAX_RAMP: { offset: 0x05, size: 1, minEepromVersion: 3 },
    MINIMUM_DUTY_CYCLE: { offset: 0x06, size: 1, minEepromVersion: 3 },
    DISABLE_STICK_CALIBRATION: { offset: 0x07, size: 1, minEepromVersion: 3 },
    ABSOLUTE_VOLTAGE_CUTOFF: { offset: 0x08, size: 1, minEepromVersion: 3 },
    CURRENT_P: { offset: 0x09, size: 1, minEepromVersion: 3 },
    CURRENT_I: { offset: 0x0a, size: 1, minEepromVersion: 3 },
    CURRENT_D: { offset: 0x0b, size: 1, minEepromVersion: 3 },
    ACTIVE_BRAKE_POWER: { offset: 0x0c, size: 1, minEepromVersion: 3 },
    MOTOR_DIRECTION: { offset: 0x11, size: 1 },
    BIDIRECTIONAL_MODE: { offset: 0x12, size: 1 },
    SINUSOIDAL_STARTUP: { offset: 0x13, size: 1 },
    COMPLEMENTARY_PWM: { offset: 0x14, size: 1 },
    VARIABLE_PWM_FREQUENCY: { offset: 0x15, size: 1 },
    STUCK_ROTOR_PROTECTION: { offset: 0x16, size: 1 },
    TIMING_ADVANCE: { offset: 0x17, size: 1 },
    PWM_FREQUENCY: { offset: 0x18, size: 1 },
    STARTUP_POWER: { offset: 0x19, size: 1 },
    MOTOR_KV: { offset: 0x1a, size: 1 },
    MOTOR_POLES: { offset: 0x1b, size: 1 },
    BRAKE_ON_STOP: { offset: 0x1c, size: 1 },
    STALL_PROTECTION: { offset: 0x1d, size: 1 },
    BEEP_VOLUME: { offset: 0x1e, size: 1 },
    INTERVAL_TELEMETRY: { offset: 0x1f, size: 1 },
    SERVO_LOW_THRESHOLD: { offset: 0x20, size: 1 },
    SERVO_HIGH_THRESHOLD: { offset: 0x21, size: 1 },
    SERVO_NEUTRAL: { offset: 0x22, size: 1 },
    SERVO_DEAD_BAND: { offset: 0x23, size: 1 },
    LOW_VOLTAGE_CUTOFF: { offset: 0x24, size: 1 },
    LOW_VOLTAGE_THRESHOLD: { offset: 0x25, size: 1 },
    RC_CAR_REVERSING: { offset: 0x26, size: 1 },
    USE_HALL_SENSORS: { offset: 0x27, size: 1 },
    SINE_MODE_RANGE: { offset: 0x28, size: 1 },
    BRAKE_STRENGTH: { offset: 0x29, size: 1 },
    RUNNING_BRAKE_LEVEL: { offset: 0x2a, size: 1 },
    TEMPERATURE_LIMIT: { offset: 0x2b, size: 1 },
    CURRENT_LIMIT: { offset: 0x2c, size: 1 },
    SINE_MODE_POWER: { offset: 0x2d, size: 1 },
    ESC_PROTOCOL: { offset: 0x2e, size: 1 },
    AUTO_ADVANCE: { offset: 0x2f, size: 1 },
    STARTUP_MELODY: { offset: 0x30, size: 128 },
    CAN_SETTINGS: { offset: 0xb0, size: 16 },
};

function settingApplies(setting, eepromVersion) {
    return !(
        (setting.maxEepromVersion !== undefined && eepromVersion > setting.maxEepromVersion) ||
        (setting.minEepromVersion !== undefined && eepromVersion < setting.minEepromVersion)
    );
}

export function bufferToSettings(buffer, eepromVersion = buffer[EepromLayout.LAYOUT_REVISION.offset] ?? 0) {
    const object = {};

    for (const [prop, setting] of Object.entries(EepromLayout)) {
        if (!settingApplies(setting, eepromVersion)) {
            continue;
        }

        const { size, offset } = setting;
        if (size === 1) {
            object[prop] = buffer[offset];
        } else if (size === 2) {
            object[prop] = (buffer[offset] << 8) | buffer[offset + 1];
        } else if (size > 2) {
            if (prop === "STARTUP_MELODY") {
                object[prop] = Array.from(buffer.subarray(offset, offset + size));
            } else {
                object[prop] = new TextDecoder().decode(buffer.subarray(offset, offset + size)).trim();
            }
        } else {
            throw new Error(`Invalid AM32 EEPROM field size for ${prop}`);
        }
    }

    return object;
}

export function settingsToBuffer(settingsObject, eepromVersion = settingsObject.LAYOUT_REVISION ?? 0) {
    const array = new Uint8Array(Mcu.LAYOUT_SIZE).fill(0xff);

    for (const [prop, setting] of Object.entries(EepromLayout)) {
        if (!settingApplies(setting, eepromVersion)) {
            continue;
        }

        const { size, offset } = setting;
        const value = settingsObject[prop];

        if (size === 1) {
            array[offset] = Number(value ?? 0) & 0xff;
        } else if (size === 2) {
            const numericValue = Number(value ?? 0);
            array[offset] = (numericValue >> 8) & 0xff;
            array[offset + 1] = numericValue & 0xff;
        } else if (size > 2) {
            const length = value?.length ?? 0;
            for (let i = 0; i < size; i++) {
                if (prop === "STARTUP_MELODY") {
                    array[offset + i] = i < length ? Number(value[i]) & 0xff : 0;
                } else {
                    array[offset + i] = i < length ? String(value).charCodeAt(i) : " ".charCodeAt(0);
                }
            }
        } else {
            throw new Error(`Invalid AM32 EEPROM field size for ${prop}`);
        }
    }

    return array;
}

export function compareBytes(first, second) {
    if (first.length !== second.length) {
        return false;
    }
    for (let i = 0; i < first.length; i++) {
        if (first[i] !== second[i]) {
            return false;
        }
    }
    return true;
}
