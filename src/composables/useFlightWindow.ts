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

import { computed, onMounted, onUnmounted, ref, watch, type Ref } from "vue";
import { calculateFlightWindow, localDate, type LightWindow } from "../js/utils/flightWindow";

export function useFlightWindow(
    location: { latitude: number | null; longitude: number | null },
    timeZone: Ref<string | null>,
) {
    const now = ref(Date.now());
    const date = computed(() => {
        if (!timeZone.value) return null;
        try {
            return localDate(new Date(now.value), timeZone.value);
        } catch {
            return null;
        }
    });
    const flightWindow = computed(() => {
        if (location.latitude === null || location.longitude === null || !date.value || !timeZone.value) return null;
        return calculateFlightWindow(location.latitude, location.longitude, date.value, timeZone.value);
    });
    const selected = ref<LightWindow | null>(null);
    const selectedKind = ref<LightWindow["kind"] | null>(null);
    watch(flightWindow, () => {
        selected.value = null;
        selectedKind.value = null;
    });
    const activeLightWindow = computed({
        get: () =>
            selectedKind.value
                ? null
                : (selected.value ?? flightWindow.value?.daylight[0] ?? flightWindow.value?.periods[0] ?? null),
        set: (value) => {
            selectedKind.value = null;
            selected.value = value;
        },
    });
    const lightWindowsForKind = (kind: LightWindow["kind"]) =>
        kind === "day"
            ? (flightWindow.value?.daylight ?? [])
            : (flightWindow.value?.periods.filter((period) => period.kind === kind) ?? []);
    const activeLightWindows = computed(() => {
        if (selectedKind.value) return lightWindowsForKind(selectedKind.value);
        return activeLightWindow.value ? [activeLightWindow.value] : [];
    });
    const daylightHighlights = computed(() => {
        if (selectedKind.value === "day") return flightWindow.value?.daylight ?? [];
        return activeLightWindow.value?.kind === "day" ? [activeLightWindow.value] : [];
    });
    const displayLightWindow = (period: LightWindow) =>
        period.kind === "day"
            ? (flightWindow.value?.daylight.find(
                  (window) => window.start <= period.start && window.end >= period.end,
              ) ?? period)
            : period;
    const selectKind = (kind: LightWindow["kind"]) => {
        if (!lightWindowsForKind(kind).length) return;
        selected.value = null;
        selectedKind.value = kind;
    };
    const lightPosition = (time: number) =>
        flightWindow.value
            ? `${Math.max(0, Math.min(100, ((time - flightWindow.value.start) / (flightWindow.value.end - flightWindow.value.start)) * 100))}%`
            : "0%";
    const lightWidth = (period: LightWindow) =>
        flightWindow.value
            ? `${((period.end - period.start) / (flightWindow.value.end - flightWindow.value.start)) * 100}%`
            : "0%";
    const formatter = computed(() =>
        flightWindow.value
            ? new Intl.DateTimeFormat("en-GB", {
                  timeZone: flightWindow.value.timeZone,
                  hour: "2-digit",
                  minute: "2-digit",
                  hourCycle: "h23",
              })
            : null,
    );
    const formatLightTime = (time: number) =>
        time === flightWindow.value?.end ? "24:00" : (formatter.value?.format(time) ?? "-");
    let interval: ReturnType<typeof setInterval>;
    onMounted(() => {
        interval = setInterval(() => {
            now.value = Date.now();
        }, 60_000);
    });
    onUnmounted(() => clearInterval(interval));
    return {
        flightWindow,
        selectKind,
        now,
        selectedLightKind: selectedKind,
        activeLightWindow,
        activeLightWindows,
        daylightHighlights,
        displayLightWindow,
        lightPosition,
        lightWidth,
        formatLightTime,
    };
}
