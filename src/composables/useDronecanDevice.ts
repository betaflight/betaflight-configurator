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

import { computed, ref, type ComputedRef, type Ref } from "vue";
import { getSetting, getSettingInfo, setSetting } from "./useMspSetting";

const ENABLED_SETTING = "dronecan_enabled";
const DEVICE_SETTING = "dronecan_device";

/** One selectable CAN bus, as the bus dropdown renders it. */
export interface CanDeviceOption {
    value: number;
    label: string;
}

export interface DronecanWriteOptions {
    /**
     * Whether this tab has a DroneCAN device selected. True turns the stack on if it is off. It
     * never turns the stack off: a tab only knows about its own device, and another consumer — a
     * compass, an airspeed sensor, ESC telemetry — may still need the bus. Turning it off stays a
     * CLI decision, because only the user knows that.
     */
    enable?: boolean;
}

export interface DronecanDevice {
    /** Whether this build has the DroneCAN stack at all. */
    supported: Ref<boolean>;
    /** Whether the stack is currently running, as last read from or written to the FC. */
    enabled: Ref<boolean>;
    deviceOptions: ComputedRef<CanDeviceOption[]>;
    /** The bus the user has picked; 1-based to match the firmware setting. */
    selectedDevice: Ref<number | null>;
    /** Whether the picked bus differs from the one the FC holds. */
    changed: ComputedRef<boolean>;
    load: () => Promise<void>;
    write: (options?: DronecanWriteOptions) => Promise<void>;
}

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
export function useDronecanDevice(): DronecanDevice {
    const supported = ref(false);
    const enabled = ref(false);
    const selectedDevice = ref<number | null>(null);
    const assignedDevice = ref<number | null>(null);
    const deviceCount = ref(0);

    const changed = computed(() => supported.value && selectedDevice.value !== assignedDevice.value);

    const deviceOptions = computed<CanDeviceOption[]>(() =>
        Array.from({ length: deviceCount.value }, (_, index) => ({
            value: index + 1,
            label: `CAN${index + 1}`,
        })),
    );

    async function load(): Promise<void> {
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
     * @throws when the firmware refuses a write; the caller then skips its persist.
     */
    async function write({ enable = false }: DronecanWriteOptions = {}): Promise<void> {
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

        // Narrowed rather than asserted: both are null until a successful load, and this is only
        // reachable once `supported` is set, but the checker cannot see that across the refs.
        const device = selectedDevice.value;
        if (device !== null && device !== assignedDevice.value) {
            try {
                await setSetting(DEVICE_SETTING, device);
            } catch (error) {
                selectedDevice.value = assignedDevice.value;
                if (enabledWritten) {
                    enabled.value = enabledBefore;
                }
                throw error;
            }
            assignedDevice.value = device;
        }
    }

    return { supported, enabled, deviceOptions, selectedDevice, changed, load, write };
}
