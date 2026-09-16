import { computed, ref } from "vue";
import { getSetting, getSettingInfo, setSetting } from "./useMspSetting";

const ENABLED_SETTING = "dronecan_enabled";
const DEVICE_SETTING = "dronecan_device";

/**
 * The DroneCAN stack: whether it runs, and which CAN bus it is bound to.
 *
 * There is no build option reporting DroneCAN support and no parameter group message for it, so
 * the probe is the setting itself: a build without the stack has no `dronecan_device`, and the
 * firmware answers the request with an error. The same setting's bounds carry the bus count for
 * this board, which the app has no other way to learn — `CANDEV_COUNT` is a compile-time constant
 * that never reaches it.
 *
 * `dronecan_enabled` gets no control of its own. Picking a DroneCAN GPS or compass is already the
 * request to run the stack, and a separate switch only adds a second step that, when missed,
 * leaves a configuration that cannot work and says nothing about why. Callers declare that intent
 * through `write({ enable })` instead.
 *
 * The bus does belong to the user, because it is a real choice: GPS, compass, airspeed and ESC
 * telemetry all ride whichever one this names.
 */
export function useDronecanDevice() {
    const supported = ref(false);
    const enabled = ref(false);
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
        enabled.value = false;
        selectedDevice.value = null;
        assignedDevice.value = null;
        deviceCount.value = 0;

        const device = await getSetting(DEVICE_SETTING);
        if (device === null) {
            return;
        }

        supported.value = true;
        assignedDevice.value = Number(device);
        selectedDevice.value = assignedDevice.value;

        // `max` is CANDEV_COUNT for this board. Falling back to the stored value keeps the bus
        // that is actually assigned selectable on a build whose bounds we could not read.
        const info = await getSettingInfo(DEVICE_SETTING);
        deviceCount.value = info?.max ?? assignedDevice.value;

        enabled.value = (await getSetting(ENABLED_SETTING)) === "ON";
    }

    /**
     * Apply the stack settings this tab is responsible for.
     *
     * @param {object} [options]
     * @param {boolean} [options.enable] whether this tab has a DroneCAN device selected. True turns
     *   the stack on if it is off. It never turns the stack off: a tab only knows about its own
     *   device, and another consumer — a compass, an airspeed sensor, ESC telemetry — may still
     *   need the bus. Turning it off stays a CLI decision, because only the user knows that.
     * @throws {Error} when the firmware refuses a write; the caller then skips its persist.
     */
    async function write({ enable = false } = {}) {
        if (!supported.value) {
            return;
        }

        // What the FC held before this attempt. A `set` reaches the running config immediately but
        // only survives a reboot once the caller persists it, and the caller abandons that on any
        // throw — so a later failure has to put the earlier write back into the pending state
        // rather than leave it reported as settled.
        const enabledBefore = enabled.value;
        let enabledWritten = false;

        if (enable && !enabled.value) {
            await setSetting(ENABLED_SETTING, "ON");
            enabled.value = true;
            enabledWritten = true;
        }

        if (selectedDevice.value !== assignedDevice.value) {
            try {
                await setSetting(DEVICE_SETTING, selectedDevice.value);
            } catch (error) {
                selectedDevice.value = assignedDevice.value;
                if (enabledWritten) {
                    enabled.value = enabledBefore;
                }
                throw error;
            }
            assignedDevice.value = selectedDevice.value;
        }
    }

    return { supported, enabled, deviceOptions, selectedDevice, changed, load, write };
}
