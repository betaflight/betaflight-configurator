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

import { createApp, h } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// jsdom has no ResizeObserver; reka-ui's Tooltip (behind UButton's title prop) needs one to mount.
globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
};

// Mock the write path and the dialog so the test isolates the Apply button's wiring.
const { applyGains, recomputeGains, showYesNo } = vi.hoisted(() => ({
    applyGains: vi.fn(),
    recomputeGains: vi.fn(),
    showYesNo: vi.fn(),
}));

vi.mock("@/composables/useAutotune", () => ({
    useAutotune: () => ({ applyGains, recomputeGains }),
}));

vi.mock("@/composables/useDialog", () => ({
    useDialog: () => ({ showYesNo }),
}));

vi.mock("@/stores/connection", () => ({
    useConnectionStore: () => ({ connectionValid: true }),
}));

vi.mock("@/js/localization", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../../src/js/localization")>()),
    i18n: { getMessage: (key: string) => key },
}));

import GainRecommendation from "../../src/components/tabs/autotune/GainRecommendation.vue";
import UApp from "@nuxt/ui/components/App.vue";
import { useAutotuneStore } from "../../src/stores/autotune";
import type { AnalysisResult } from "../../src/composables/useAutotune";

const PROPOSED = {
    slider_master_multiplier: 110,
    slider_pi_gain: 105,
    slider_i_gain: 95,
    slider_d_gain: 120,
    slider_feedforward_gain: 100,
    slider_dterm_filter_multiplier: 100,
};

const FAKE_RESULT = {
    axes: {
        roll: {
            gains: { targetCrossover: 80, maxPhaseMargin: 60, proposed: PROPOSED },
        },
    },
    sysConfig: {},
};

interface Mounted {
    container: HTMLElement;
    unmount(): void;
}

function mountAndSeed(): Mounted {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useAutotuneStore();
    store.analysisResult = FAKE_RESULT as unknown as AnalysisResult;

    const container = document.createElement("div");
    document.body.appendChild(container);
    const app = createApp({ render: () => h(UApp, { portal: false }, { default: () => h(GainRecommendation) }) });
    app.config.globalProperties.$t = ((key: string) => key) as never;
    app.use(pinia);
    app.mount(container);
    return {
        container,
        unmount() {
            app.unmount();
            container.remove();
        },
    };
}

function findButton(container: HTMLElement, text: string): HTMLButtonElement {
    const button = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes(text));
    expect(button).toBeTruthy();
    return button!;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("autotune apply confirmation gate", () => {
    let mounted: Mounted | null = null;

    beforeEach(() => {
        applyGains.mockClear();
        showYesNo.mockClear();
    });

    afterEach(() => {
        mounted?.unmount();
        mounted = null;
        document.body.innerHTML = "";
    });

    it("control: a confirmed apply reaches applyGains", async () => {
        showYesNo.mockResolvedValue(true);
        mounted = mountAndSeed();
        findButton(mounted.container, "autotuneApplyGains").click();
        await flush();
        await flush();
        expect(applyGains).toHaveBeenCalledTimes(1);
        expect(applyGains).toHaveBeenCalledWith(PROPOSED);
    });

    it("declined confirmation leaves the flight controller untouched", async () => {
        showYesNo.mockResolvedValue(false);
        mounted = mountAndSeed();
        findButton(mounted.container, "autotuneApplyGains").click();
        await flush();
        await flush();
        expect(showYesNo).toHaveBeenCalledWith(
            "autotuneApplyConfirmTitle",
            "autotuneApplyConfirmText",
            expect.objectContaining({ destructive: true }),
        );
        expect(applyGains).not.toHaveBeenCalled();
    });
});
