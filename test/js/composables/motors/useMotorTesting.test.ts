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
import { createPinia, setActivePinia } from "pinia";
import { defineComponent, nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";
import MSP from "../../../../src/js/msp";
import MSPCodes from "../../../../src/js/msp/MSPCodes";
import { useMotorTesting } from "../../../../src/composables/motors/useMotorTesting";

vi.mock("../../../../src/js/msp", () => ({ default: { send_message: vi.fn() } }));
vi.mock("../../../../src/js/msp/MSPHelper", () => ({
    mspHelper: { enableArmingForMotorTest: vi.fn(), disableArming: vi.fn() },
}));

type MotorTesting = ReturnType<typeof useMotorTesting>;

function mountMotorTesting() {
    let testing!: MotorTesting;
    const wrapper = mount(
        defineComponent({
            setup() {
                testing = useMotorTesting(ref(false), vi.fn(), false, 1000);
                return () => null;
            },
        }),
    );
    return { wrapper, testing };
}

function setPageHidden(hidden: boolean) {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
    document.dispatchEvent(new Event("visibilitychange"));
}

function motorCommands() {
    return vi.mocked(MSP.send_message).mock.calls.filter(([code]) => code === MSPCodes.MSP_SET_MOTOR);
}

describe("useMotorTesting", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setActivePinia(createPinia());
    });

    afterEach(() => {
        Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    });

    it("stops the motor test when the page is hidden", async () => {
        const { wrapper, testing } = mountMotorTesting();
        testing.motorsTestingEnabled.value = true;
        await nextTick();
        testing.masterValue.value = 1140;
        vi.mocked(MSP.send_message).mockClear();

        setPageHidden(true);
        await nextTick();

        expect(testing.motorsTestingEnabled.value).toBe(false);
        expect(motorCommands()).toHaveLength(1);
        expect(motorCommands()[0][1]).toEqual(new Array(8).fill([1000 & 0xff, 1000 >> 8]).flat());
        wrapper.unmount();
    });

    it("keeps the motor test running when the page becomes visible", async () => {
        const { wrapper, testing } = mountMotorTesting();
        testing.motorsTestingEnabled.value = true;
        await nextTick();

        setPageHidden(false);
        await nextTick();

        expect(testing.motorsTestingEnabled.value).toBe(true);
        wrapper.unmount();
    });

    it("does not stop anything when the page is hidden while the test is off", async () => {
        const { wrapper, testing } = mountMotorTesting();

        setPageHidden(true);
        await nextTick();

        expect(testing.motorsTestingEnabled.value).toBe(false);
        expect(motorCommands()).toHaveLength(0);
        wrapper.unmount();
    });
});
