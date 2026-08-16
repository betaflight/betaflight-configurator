import { computed, ref } from "vue";
import {
    findCliError,
    findCliSettingRange,
    findCliSettingValue,
    isMspCliSupported,
    send as cliSend,
} from "./useMspCliSession";

const SETTING = "dronecan_device";

/**
 * Which CAN bus the DroneCAN stack is bound to.
 *
 * Support is probed with the setting itself: a build without DroneCAN answers `get` with an
 * INVALID NAME error. The reply also carries the bus count for this board, which the app has no
 * other way to learn — `CANDEV_COUNT` is a compile-time constant that never reaches it.
 *
 * `USE_DRONECAN` is a build option now, but it is not what decides this. Firmware built between
 * DroneCAN landing and the option existing reports neither, and `checkBuildOption` answers true
 * for anything it cannot see, so a board would be believed either way. The probe is exact, and
 * the bus count needs the round trip regardless.
 *
 * The bus is a property of the whole DroneCAN stack rather than of any one feature: GPS, compass,
 * airspeed and ESC telemetry all ride whichever bus this names.
 */
export function useDronecanDevice() {
    const supported = ref(false);
    const selectedDevice = ref(null);
    const assignedDevice = ref(null);
    const deviceCount = ref(0);

    const changed = computed(() => supported.value && selectedDevice.value !== assignedDevice.value);

    const deviceOptions = computed(() =>
        Array.from({ length: deviceCount.value }, (_, index) => ({
            value: index + 1,
            label: `CAN${index + 1}`,
        })),
    );

    async function load() {
        supported.value = false;
        selectedDevice.value = null;
        assignedDevice.value = null;
        deviceCount.value = 0;

        if (!isMspCliSupported()) {
            return;
        }

        const lines = await cliSend(`get ${SETTING}`);
        if (findCliError(lines)) {
            return;
        }

        const value = findCliSettingValue(lines, SETTING);
        if (value === null) {
            return;
        }

        const range = findCliSettingRange(lines);

        supported.value = true;
        deviceCount.value = range ? range.max : Number(value);
        assignedDevice.value = Number(value);
        selectedDevice.value = assignedDevice.value;
    }

    async function write() {
        if (!changed.value) {
            return;
        }

        const error = findCliError(await cliSend(`set ${SETTING} = ${selectedDevice.value}`));
        if (error) {
            throw new Error(error);
        }

        assignedDevice.value = selectedDevice.value;
    }

    return { supported, deviceOptions, selectedDevice, changed, load, write };
}
