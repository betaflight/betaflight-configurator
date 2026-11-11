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

import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, nextTick, reactive, ref } from "vue";
import { useFlightWindow } from "../../src/composables/useFlightWindow";

function setup(timeZone = "Europe/Berlin") {
    const location = reactive({ latitude: 52.52 as number | null, longitude: 13.405 as number | null });
    const zone = ref<string | null>(timeZone);
    let chart!: ReturnType<typeof useFlightWindow>;
    const wrapper = mount(
        defineComponent({
            setup() {
                chart = useFlightWindow(location, zone);
                return () => null;
            },
        }),
    );
    return { wrapper, location, zone, chart };
}

afterEach(() => vi.useRealTimers());

describe("flight window lifecycle", () => {
    it("updates the marker without recalculating the day's solar periods, then rolls over at local midnight", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-06-21T21:58:00Z"));
        const { wrapper, chart } = setup();
        const before = chart.flightWindow.value;
        chart.selectKind("blue");
        await vi.advanceTimersByTimeAsync(60_000);
        expect(chart.flightWindow.value).toBe(before);
        expect(chart.formatLightTime(chart.now.value)).toBe("23:59");
        await vi.advanceTimersByTimeAsync(60_000);
        await nextTick();
        expect(chart.flightWindow.value?.date).toBe("2026-06-22");
        expect(chart.formatLightTime(chart.now.value)).toBe("00:00");
        expect(chart.activeLightWindow.value?.kind).toBe("day");
        wrapper.unmount();
        expect(vi.getTimerCount()).toBe(0);
    });

    it("changes location/timezone and discards the old selection", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-06-21T12:00:00Z"));
        const { wrapper, location, zone, chart } = setup();
        chart.selectKind("blue");
        location.latitude = 1.87;
        location.longitude = -157.4;
        zone.value = "Pacific/Kiritimati";
        await nextTick();
        expect(chart.flightWindow.value?.date).toBe("2026-06-22");
        expect(chart.formatLightTime(chart.now.value)).toBe("02:00");
        expect(chart.activeLightWindow.value?.kind).toBe("day");
        zone.value = "invalid-zone";
        await nextTick();
        expect(chart.flightWindow.value).toBeNull();
        expect(chart.activeLightWindow.value).toBeNull();
        zone.value = null;
        await nextTick();
        expect(chart.flightWindow.value).toBeNull();
        wrapper.unmount();
    });

    it("highlights all periods of a legend type instead of cycling through them", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-06-21T12:00:00Z"));
        const { wrapper, chart } = setup();
        chart.selectKind("blue");
        expect(chart.selectedLightKind.value).toBe("blue");
        expect(chart.activeLightWindows.value.map((period) => period.phase)).toEqual([
            "preflightMorning",
            "preflightEvening",
        ]);
        const bluePeriods = chart.activeLightWindows.value;
        chart.selectKind("blue");
        expect(chart.activeLightWindows.value).toEqual(bluePeriods);
        chart.selectKind("day");
        expect(chart.selectedLightKind.value).toBe("day");
        expect(chart.activeLightWindows.value).toEqual(chart.flightWindow.value?.daylight);
        const morningBlue = chart.flightWindow.value!.periods.find((period) => period.kind === "blue")!;
        chart.activeLightWindow.value = chart.displayLightWindow(morningBlue);
        expect(chart.selectedLightKind.value).toBeNull();
        expect(chart.activeLightWindows.value).toEqual([chart.activeLightWindow.value]);
        expect(chart.activeLightWindow.value?.phase).toBe("preflightMorning");
        wrapper.unmount();
    });
});
