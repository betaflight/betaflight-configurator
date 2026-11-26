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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, shallowMount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import type { ComponentPublicInstance } from "vue";
import USwitch from "@nuxt/ui/components/Switch.vue";
import FilterSubTab from "../../src/components/tabs/pid-tuning/FilterSubTab.vue";
import { useFlightControllerStore } from "../../src/stores/fc";
import { usePidTuningStore } from "../../src/stores/pidTuning";

const sliders = vi.hoisted(() => ({
    calculateNewGyroFilters: vi.fn(),
    calculateNewDTermFilters: vi.fn(),
}));

// Not importOriginal: the real module pulls in the whole MSP stack.
vi.mock("../../src/composables/useTuningSliders", () => ({
    NON_EXPERT_SLIDER_MIN_GYRO: 50,
    NON_EXPERT_SLIDER_MAX_GYRO: 150,
    NON_EXPERT_SLIDER_MIN_DTERM: 80,
    NON_EXPERT_SLIDER_MAX_DTERM: 120,
    ...sliders,
}));
vi.mock("i18next-vue", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

function mountTab() {
    return shallowMount(FilterSubTab, {
        props: { expertMode: true },
        global: {
            renderStubDefaultSlot: true,
            mocks: { $t: (key: string) => key },
        },
    });
}

type Wrapper = ReturnType<typeof mountTab>;

// Switch order in the template: gyro slider mode first, D-term second.
const sliderSwitch = (wrapper: Wrapper, index: 0 | 1) =>
    wrapper.findAllComponents<ComponentPublicInstance>(USwitch)[index];

describe("Filter slider mode switches", () => {
    let wrapper: Wrapper;
    let fcStore: ReturnType<typeof useFlightControllerStore>;

    beforeEach(async () => {
        vi.resetAllMocks();
        setActivePinia(createPinia());
        fcStore = useFlightControllerStore();
        fcStore.resetState();
        fcStore.config.apiVersion = "1.47.0";
        fcStore.tuningSliders.slider_gyro_filter = 0;
        fcStore.tuningSliders.slider_gyro_filter_multiplier = 120;
        fcStore.tuningSliders.slider_dterm_filter = 0;
        fcStore.tuningSliders.slider_dterm_filter_multiplier = 90;
        Object.values(sliders).forEach((fn) => fn.mockResolvedValue(undefined));
        wrapper = mountTab();
        await flushPromises();
    });

    afterEach(() => {
        wrapper.unmount();
    });

    it("recalculates gyro cutoffs from the current multiplier when the gyro slider is turned on", async () => {
        sliderSwitch(wrapper, 0).vm.$emit("update:modelValue", true);
        await flushPromises();

        expect(fcStore.tuningSliders.slider_gyro_filter).toBe(1);
        expect(sliders.calculateNewGyroFilters).toHaveBeenCalledExactlyOnceWith(1.2);
        expect(sliders.calculateNewDTermFilters).not.toHaveBeenCalled();
    });

    it("recalculates D-term cutoffs from the current multiplier when the D-term slider is turned on", async () => {
        sliderSwitch(wrapper, 1).vm.$emit("update:modelValue", true);
        await flushPromises();

        expect(fcStore.tuningSliders.slider_dterm_filter).toBe(1);
        expect(sliders.calculateNewDTermFilters).toHaveBeenCalledExactlyOnceWith(0.9);
        expect(sliders.calculateNewGyroFilters).not.toHaveBeenCalled();
    });

    it("does not recalculate when a slider is turned off", async () => {
        fcStore.tuningSliders.slider_gyro_filter = 1;
        fcStore.tuningSliders.slider_dterm_filter = 1;
        await flushPromises();

        sliderSwitch(wrapper, 0).vm.$emit("update:modelValue", false);
        sliderSwitch(wrapper, 1).vm.$emit("update:modelValue", false);
        await flushPromises();

        expect(fcStore.tuningSliders.slider_gyro_filter).toBe(0);
        expect(fcStore.tuningSliders.slider_dterm_filter).toBe(0);
        expect(sliders.calculateNewGyroFilters).not.toHaveBeenCalled();
        expect(sliders.calculateNewDTermFilters).not.toHaveBeenCalled();
    });

    describe.each([
        {
            name: "gyro",
            index: 0,
            calculate: sliders.calculateNewGyroFilters,
            fields: ["gyro_lowpass_hz", "gyro_lowpass2_hz", "gyro_lowpass_dyn_min_hz", "gyro_lowpass_dyn_max_hz"],
            mode: "slider_gyro_filter",
        },
        {
            name: "D-term",
            index: 1,
            calculate: sliders.calculateNewDTermFilters,
            fields: ["dterm_lowpass_hz", "dterm_lowpass2_hz", "dterm_lowpass_dyn_min_hz", "dterm_lowpass_dyn_max_hz"],
            mode: "slider_dterm_filter",
        },
    ] as const)("$name slider OFF", ({ index, calculate, fields, mode }) => {
        const MANUAL = [150, 0, 0, 0];
        const CALCULATED = [0, 300, 240, 600];

        const cutoffs = () => fields.map((field) => fcStore.filterConfig[field]);
        const setCutoffs = (values: number[]) =>
            fields.forEach((field, i) => (fcStore.filterConfig[field] = values[i]));

        beforeEach(() => {
            setCutoffs(MANUAL);
            // Stand in for the calculate reply / client-side calculation.
            calculate.mockImplementation(() => {
                setCutoffs(CALCULATED);
                return Promise.resolve(undefined);
            });
        });

        it("restores the manual cutoffs it replaced when turned ON in this session", async () => {
            sliderSwitch(wrapper, index).vm.$emit("update:modelValue", true);
            await flushPromises();
            expect(cutoffs()).toEqual(CALCULATED);

            sliderSwitch(wrapper, index).vm.$emit("update:modelValue", false);
            await flushPromises();

            expect(fcStore.tuningSliders[mode]).toBe(0);
            expect(cutoffs()).toEqual(MANUAL);
        });

        it("restores the manual cutoffs after visiting another sub-tab and coming back", async () => {
            sliderSwitch(wrapper, index).vm.$emit("update:modelValue", true);
            await flushPromises();

            // PidTuningTab renders sub-tabs with v-if: leaving Filter destroys it, returning recreates it.
            wrapper.unmount();
            wrapper = mountTab();
            await flushPromises();

            sliderSwitch(wrapper, index).vm.$emit("update:modelValue", false);
            await flushPromises();

            expect(cutoffs()).toEqual(MANUAL);
        });

        it("keeps the cutoffs when the slider was already ON at load", async () => {
            fcStore.tuningSliders[mode] = 1;
            setCutoffs(CALCULATED);
            await flushPromises();

            sliderSwitch(wrapper, index).vm.$emit("update:modelValue", false);
            await flushPromises();

            expect(cutoffs()).toEqual(CALCULATED);
        });

        it("keeps the cutoffs after a save or reload made them the baseline", async () => {
            sliderSwitch(wrapper, index).vm.$emit("update:modelValue", true);
            await flushPromises();

            usePidTuningStore().markEditsClean();
            sliderSwitch(wrapper, index).vm.$emit("update:modelValue", false);
            await flushPromises();

            expect(cutoffs()).toEqual(CALCULATED);
        });
    });
});
