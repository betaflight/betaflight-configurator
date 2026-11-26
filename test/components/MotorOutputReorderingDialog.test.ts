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
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import MotorOutputReorderingDialog from "../../src/components/dialogs/MotorOutputReorderingDialog.vue";

const canvasMock = vi.hoisted(() => ({
    instances: [] as { canvas: HTMLCanvasElement; startOver: ReturnType<typeof vi.fn> }[],
}));

vi.mock("../../src/components/MotorOutputReordering/MotorOutputReorderingCanvas", () => ({
    default: class {
        readyMotors: number[] = [];
        remappingReady = false;
        canvas: HTMLCanvasElement;
        startOver = vi.fn();
        pause = vi.fn();
        constructor(canvas: HTMLCanvasElement) {
            this.canvas = canvas;
            canvasMock.instances.push(this);
        }
    },
}));
vi.mock("../../src/composables/motors/useMotorOutputReordering", () => ({
    useMotorOutputReordering: () => ({ spinOnlyMotor: vi.fn(), saveMotorOutputOrder: vi.fn() }),
}));
vi.mock("../../src/js/localization", () => ({ i18n: { getMessage: (key: string) => key } }));

function mountDialog() {
    return mount(MotorOutputReorderingDialog, {
        props: { droneConfiguration: "Quad X", motorStopValue: 1000, motorSpinValue: 1100 },
        attachTo: document.body,
    });
}

async function agreeAndStart(wrapper: ReturnType<typeof mountDialog>) {
    await wrapper.find('button[role="switch"]').trigger("click");
    const start = wrapper.findAll("button").find((b) => b.text() === "motorOutputReorderDialogAgree");
    if (!start) {
        throw new Error("no start button");
    }
    await start.trigger("click");
    await wrapper.vm.$nextTick();
}

describe("MotorOutputReorderingDialog", () => {
    beforeEach(() => {
        canvasMock.instances.length = 0;
        vi.useFakeTimers();
        setActivePinia(createPinia());
        // jsdom has no showModal; the keydown handler only acts while the dialog is open.
        HTMLDialogElement.prototype.showModal = function () {
            this.setAttribute("open", "");
        };
    });

    afterEach(() => {
        vi.useRealTimers();
        document.body.innerHTML = "";
    });

    it("binds a new canvas after an emergency stop re-renders the main content", async () => {
        const wrapper = mountDialog();
        (wrapper.vm as unknown as { show: () => void }).show();

        await agreeAndStart(wrapper);
        expect(canvasMock.instances).toHaveLength(1);

        // Any non-arrow key is an emergency stop: it hides the main content and so removes the canvas.
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
        await wrapper.vm.$nextTick();
        expect(wrapper.find("canvas").exists()).toBe(false);

        await agreeAndStart(wrapper);

        expect(canvasMock.instances).toHaveLength(2);
        const rendered = wrapper.find("canvas").element;
        expect(canvasMock.instances[1].canvas).toBe(rendered);
        expect(canvasMock.instances[0].canvas).not.toBe(rendered);
        expect(canvasMock.instances[0].startOver).not.toHaveBeenCalled();

        wrapper.unmount();
    });
});
