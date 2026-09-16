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
 * Both belong to the whole stack rather than to any one feature: GPS, compass, airspeed and ESC
 * telemetry all ride whichever bus this names, and all of them stay silent while it is disabled.
 * `dronecan_enabled` defaults to off, so a board that is wired and built correctly still reports
 * nothing until it is turned on — which is why it is surfaced next to the provider that needs it.
 */
export function useDronecanDevice() {
    const supported = ref(false);
    const selectedEnabled = ref(false);
    const assignedEnabled = ref(false);
    const selectedDevice = ref(null);
    const assignedDevice = ref(null);
    const deviceCount = ref(0);

    const changed = computed(
        () =>
            supported.value &&
            (selectedEnabled.value !== assignedEnabled.value || selectedDevice.value !== assignedDevice.value),
    );

    const deviceOptions = computed(() =>
        Array.from({ length: deviceCount.value }, (_, index) => ({
            value: index + 1,
            label: `CAN${index + 1}`,
        })),
    );

    async function load() {
        supported.value = false;
        selectedEnabled.value = false;
        assignedEnabled.value = false;
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

        assignedEnabled.value = (await getSetting(ENABLED_SETTING)) === "ON";
        selectedEnabled.value = assignedEnabled.value;
    }

    // Each write is applied on its own and rolled back if the firmware refuses it, so a rejected
    // change never lingers in the UI as though it had taken. The throw stops the caller before it
    // persists anything.
    async function write() {
        if (!changed.value) {
            return;
        }

        // What the FC held before this attempt. A `set` reaches the running config immediately but
        // only survives a reboot once the caller persists it, and the caller abandons that on any
        // throw -- so a later failure has to put the earlier write back into the pending state
        // rather than leave it reported as settled.
        const enabledBefore = assignedEnabled.value;
        let enabledWritten = false;

        if (selectedEnabled.value !== assignedEnabled.value) {
            try {
                await setSetting(ENABLED_SETTING, selectedEnabled.value ? "ON" : "OFF");
            } catch (error) {
                selectedEnabled.value = assignedEnabled.value;
                throw error;
            }
            assignedEnabled.value = selectedEnabled.value;
            enabledWritten = true;
        }

        if (selectedDevice.value !== assignedDevice.value) {
            try {
                await setSetting(DEVICE_SETTING, selectedDevice.value);
            } catch (error) {
                selectedDevice.value = assignedDevice.value;
                if (enabledWritten) {
                    assignedEnabled.value = enabledBefore;
                }
                throw error;
            }
            assignedDevice.value = selectedDevice.value;
        }
    }

    return { supported, enabled: selectedEnabled, deviceOptions, selectedDevice, changed, load, write };
}
