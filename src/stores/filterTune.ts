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

import { defineStore } from "pinia";
import { computed, ref } from "vue";
import MSP from "../js/msp";
import MSPCodes from "../js/msp/MSPCodes";
import EscProtocols from "../js/utils/EscProtocols";
import { isMspCancelled } from "../js/msp/mspErrors";
import { useFrameWizardStore } from "./frameWizard";
import { useFlightControllerStore } from "./fc";
import {
    encodeForgetFrameMap,
    encodeTunePreset,
    encodeRevertFilters,
    harmonicSummary,
    parseFilterTuneStatus,
    parseFrameMap,
    type FilterTuneStatus,
    type FrameMap,
} from "./filterTuneProtocol";

// The status is a progress readout (frames collected, the verdict so far): once a second is enough.
const STATUS_POLL_MS = 1000;
// The FILTER TUNE flight mode's permanent box id (msp_box.c).
export const BOX_FILTER_TUNE = 59;
// The FC writes the frame map to EEPROM from a task while disarmed, a moment after the op.
const MAP_SAVE_SETTLE_MS = 1500;

export type FilterTuneActionResult = "done" | "refused" | "failed";

/** One MSP read: the payload, or null when the FC has no answer or does not know the code. */
async function query(code: number, data?: number[]): Promise<Uint8Array | null> {
    const response = await MSP.promise(code, data);
    if (!response || response.unsupported) {
        return null;
    }
    const view = response.data;
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
}

export const useFilterTuneStore = defineStore("filterTune", () => {
    /** null until probed; false when the firmware has no filter autotune. */
    const supported = ref<boolean | null>(null);
    const status = ref<FilterTuneStatus | null>(null);
    const frameMap = ref<FrameMap | null>(null);
    const busy = ref(false);

    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let polling = false;

    /**
     * The FC is set up for RPM telemetry: DShot, bidirectional, RPM filter on (null until read). The FC's own flag
     * needs live telemetry, which is missing on USB power alone (the ESCs are off).
     */
    const telemetryConfigured = ref<boolean | null>(null);

    /**
     * The motor's KV and stator size (null until read): the D-term rule holds the motors' heat from the ripple to
     * a budget, worked out from them. The stator size follows KV in MSP_MOTOR_CONFIG (API 1.49, 0 when unset).
     */
    const motorSpec = ref<{ kv: number; statorDiameterMm: number; statorHeightMm: number } | null>(null);

    async function readTelemetryConfig() {
        await MSP.promise(MSPCodes.MSP_ADVANCED_CONFIG);
        const motor = await MSP.promise(MSPCodes.MSP_MOTOR_CONFIG);
        const view = motor && !motor.unsupported ? motor.data : null;
        // u16 x3, u8 x4, u16 kv, then u8 stator diameter mm, u8 height 0.1 mm
        motorSpec.value =
            view && view.byteLength >= 14
                ? {
                      kv: view.getUint16(10, true),
                      statorDiameterMm: view.getUint8(12),
                      statorHeightMm: view.getUint8(13) / 10,
                  }
                : null;
        await MSP.promise(MSPCodes.MSP_FILTER_CONFIG);
        const fc = useFlightControllerStore();
        telemetryConfigured.value =
            EscProtocols.IsProtocolDshot(fc.config.apiVersion, fc.pidAdvancedConfig.fast_pwm_protocol) &&
            Boolean(fc.motorConfig.use_dshot_telemetry) &&
            fc.filterConfig.gyro_rpm_notch_harmonics > 0;
    }

    const summary = computed(() => (status.value ? harmonicSummary(status.value) : null));

    // FILTER TUNE has a switch range in the Modes tab (an empty slot has start == end); a mode that is on
    // right now is on a switch whatever the ranges read at load say
    const modeAssigned = computed(
        () =>
            status.value?.modeOn === true ||
            useFlightControllerStore().modeRanges.some(
                (range: { id: number; range: { start: number; end: number } }) =>
                    range.id === BOX_FILTER_TUNE && range.range.start < range.range.end,
            ),
    );

    async function refreshStatus() {
        const bytes = await query(MSPCodes.MSP2_FILTER_TUNE_STATUS);
        const parsed = bytes ? parseFilterTuneStatus(bytes) : null;
        if (supported.value === null || !parsed) {
            supported.value = parsed !== null;
        }
        if (parsed) {
            status.value = parsed;
        }
    }

    async function refreshMap() {
        const bytes = await query(MSPCodes.MSP2_FRAME_MAP);
        frameMap.value = bytes ? parseFrameMap(bytes) : null;
    }

    /** The mixer (for the frame diagram) and the frame map, then the status once a second. */
    async function load() {
        try {
            await MSP.promise(MSPCodes.MSP_MIXER_CONFIG);
            await refreshStatus();
            if (supported.value) {
                await MSP.promise(MSPCodes.MSP_MODE_RANGES);
            }
            if (supported.value) {
                await refreshMap();
                await readTelemetryConfig();
            }
        } catch (error) {
            if (!isMspCancelled(error)) {
                console.warn("Filter autotune load failed:", error);
            }
        }
    }

    /** Whether the firmware has the filter autotune (one status query), for tabs that only need to know. */
    async function probe() {
        if (supported.value !== null) {
            return;
        }
        try {
            await refreshStatus();
        } catch (error) {
            if (!isMspCancelled(error)) {
                console.warn("Filter autotune probe failed:", error);
            }
        }
    }

    function schedule() {
        if (polling && supported.value !== false) {
            pollTimer = setTimeout(tick, STATUS_POLL_MS);
        }
    }

    async function tick() {
        pollTimer = null;
        // A running frame test owns the link (its keepalive is what keeps the motors safe).
        if (!useFrameWizardStore().active) {
            try {
                await refreshStatus();
            } catch (error) {
                if (isMspCancelled(error)) {
                    stopPolling();
                    return;
                }
                console.warn("Filter autotune status poll failed:", error);
            }
        }
        schedule();
    }

    function startPolling() {
        if (!polling) {
            polling = true;
            schedule();
        }
    }

    function stopPolling() {
        polling = false;
        if (pollTimer) {
            clearTimeout(pollTimer);
            pollTimer = null;
        }
    }

    async function setOp(data: number[]): Promise<FilterTuneActionResult> {
        busy.value = true;
        try {
            const reply = await MSP.promise(MSPCodes.MSP2_SET_FRAME_WIZARD, data);
            if (!reply) {
                return "failed";
            }
            return reply.unsupported ? "refused" : "done";
        } catch (error) {
            if (!isMspCancelled(error)) {
                console.warn("Filter autotune action failed:", error);
            }
            return "failed";
        } finally {
            busy.value = false;
        }
    }

    /** Back to the gyro filter settings from before the last applied autotune (refused when armed). */
    async function revert(): Promise<FilterTuneActionResult> {
        const result = await setOp(encodeRevertFilters());
        await refreshStatus().catch(() => undefined);
        return result;
    }

    /** Set the noise / delay slider's stop: the FC takes it at once while disarmed. */
    async function setTunePreset(stop: number): Promise<FilterTuneActionResult> {
        const result = await setOp(encodeTunePreset(stop));
        await refreshStatus().catch(() => undefined);
        return result;
    }

    /** Drop the stored frame map: the autotune needs a new frame test (taps) before it runs again. */
    async function forgetFrameMap(): Promise<FilterTuneActionResult> {
        const result = await setOp(encodeForgetFrameMap());
        await new Promise((resolve) => setTimeout(resolve, MAP_SAVE_SETTLE_MS));
        await refreshMap().catch(() => undefined);
        await refreshStatus().catch(() => undefined);
        return result;
    }

    /** After a frame test run the FC has stored its part of the map. */
    async function afterFrameTest() {
        await new Promise((resolve) => setTimeout(resolve, MAP_SAVE_SETTLE_MS));
        await refreshMap().catch(() => undefined);
        await refreshStatus().catch(() => undefined);
    }

    function detach() {
        stopPolling();
        supported.value = null;
        status.value = null;
        frameMap.value = null;
        telemetryConfigured.value = null;
        motorSpec.value = null;
    }

    return {
        supported,
        status,
        frameMap,
        telemetryConfigured,
        motorSpec,
        busy,
        summary,
        modeAssigned,
        load,
        probe,
        refreshMap,
        startPolling,
        stopPolling,
        revert,
        setTunePreset,
        forgetFrameMap,
        afterFrameTest,
        detach,
    };
});
