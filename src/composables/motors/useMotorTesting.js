/**
 * Motor Testing Composable
 * Handles motor testing logic with safety features
 * Based on original motors.js motorsEnableTestMode handler
 */

import { ref, watch, onUnmounted } from "vue";
import MSP from "@/js/msp";
import MSPCodes from "@/js/msp/MSPCodes";
import { mspHelper } from "@/js/msp/MSPHelper";
import DshotCommand from "@/js/utils/DshotCommand";
import { i18n } from "@/js/localization";

export function useMotorTesting(configHasChanged, showWarningDialog, digitalProtocolConfigured) {
    const motorsTestingEnabled = ref(false);
    const motorValues = ref(new Array(8).fill(1000));
    const masterValue = ref(1000);

    // Safety: Keys that don't trigger motor stop
    const ignoreKeys = new Set(["PageUp", "PageDown", "End", "Home", "ArrowUp", "ArrowDown", "AltLeft", "AltRight"]);

    /**
     * Keyboard safety handler - stops motors on any key press
     */
    const disableMotorTest = (e) => {
        if (motorsTestingEnabled.value && !ignoreKeys.has(e.code)) {
            motorsTestingEnabled.value = false;
        }
    };

    /**
     * Enable motor testing
     * - Sends DShot extended telemetry command
     * - Sets up keyboard listener
     * - Disables arming
     */
    const enableMotorTesting = () => {
        // Only send DShot command for digital protocols
        if (digitalProtocolConfigured?.value ?? digitalProtocolConfigured) {
            const buffer = [];
            buffer.push8(DshotCommand.dshotCommandType_e.DSHOT_CMD_TYPE_BLOCKING);
            buffer.push8(255); // Send to all ESCs
            buffer.push8(1); // 1 command
            buffer.push8(13); // Enable extended dshot telemetry
            MSP.send_message(MSPCodes.MSP2_SEND_DSHOT_COMMAND, buffer);
        }

        // Add keyboard safety listener
        document.addEventListener("keydown", disableMotorTest);

        // Disable arming during motor testing
        mspHelper.setArmingEnabled(false, false);
    };

    /**
     * Disable motor testing
     * - Removes keyboard listener
     * - Re-enables arming
     * - Sends DShot motor stop command for digital protocols
     * - Stops all motors
     */
    const disableMotorTesting = () => {
        // Remove keyboard listener
        document.removeEventListener("keydown", disableMotorTest);

        // Re-enable arming
        mspHelper.setArmingEnabled(true, true);

        // For digital protocols, send motor stop command to prevent spinning after reboot
        if (digitalProtocolConfigured?.value ?? digitalProtocolConfigured) {
            const buffer = [];
            buffer.push8(DshotCommand.dshotCommandType_e.DSHOT_CMD_TYPE_BLOCKING);
            buffer.push8(DshotCommand.ALL_MOTORS); // Send to all ESCs
            buffer.push8(1); // 1 command
            buffer.push8(DshotCommand.dshotCommands_e.DSHOT_CMD_MOTOR_STOP); // Motor stop command
            MSP.send_message(MSPCodes.MSP2_SEND_DSHOT_COMMAND, buffer);
        }

        // Explicitly stop all motors to prevent spinning after reboot
        stopAllMotors();
    };

    /**
     * Watch motor testing enable/disable
     */
    watch(motorsTestingEnabled, (enabled) => {
        // CRITICAL SAFETY: Prevent testing if configuration has changed
        if (enabled && configHasChanged.value) {
            const message = i18n.getMessage("motorsDialogSettingsChanged");
            showWarningDialog(message);
            // Force disable
            motorsTestingEnabled.value = false;
            return;
        }

        if (enabled) {
            enableMotorTesting();
        } else {
            disableMotorTesting();
        }
    });

    // Cleanup on unmount
    onUnmounted(() => {
        if (motorsTestingEnabled.value) {
            // Restore arming state before removing event listener
            mspHelper.setArmingEnabled(true, true);
            document.removeEventListener("keydown", disableMotorTest);
        }
    });

    /**
     * Send motor values to FC
     * `@param` {number[]} values - Motor values (length 8), each 1000-2000
     */
    const sendMotorCommand = (values) => {
        const buffer = [];
        for (let i = 0; i < values.length; i++) {
            const value = values[i];
            buffer.push(value & 0xff);
            buffer.push((value >> 8) & 0xff);
        }
        MSP.send_message(MSPCodes.MSP_SET_MOTOR, buffer);
    };

    /**
     * Stop all motors immediately
     */
    const stopAllMotors = (stopValue = 1000) => {
        const values = new Array(8).fill(stopValue);
        sendMotorCommand(values);
        motorValues.value = values;
        masterValue.value = stopValue;
    };

    return {
        motorsTestingEnabled,
        motorValues,
        masterValue,
        sendMotorCommand,
        stopAllMotors,
    };
}
