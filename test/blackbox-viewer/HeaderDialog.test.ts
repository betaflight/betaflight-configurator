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

import { createApp, defineComponent, h, nextTick, type App } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("sortablejs", () => ({
    default: { create: () => ({ destroy: vi.fn() }) },
}));

import HeaderDialog from "../../src/blackbox-viewer/components/HeaderDialog.vue";
import { FIRMWARE_TYPE_BETAFLIGHT } from "../../src/blackbox-viewer/flightlog_fielddefs";
import type { SysConfig } from "../../src/blackbox-viewer/flightlog_parser";

// The header's text as the copy button builds it: every section, one "  name: value" line per field.

const Stub = (tag: string) =>
    defineComponent({
        inheritAttrs: false,
        setup(_, { attrs, slots }) {
            return () => h(tag, attrs, slots.default?.());
        },
    });

let app: App | null = null;

afterEach(() => {
    app?.unmount();
    app = null;
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
});

async function copiedHeader(sysConfig: Record<string, unknown>): Promise<string> {
    const writeText = vi.fn();
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const host = document.createElement("div");
    document.body.appendChild(host);
    app = createApp({
        render: () =>
            h(HeaderDialog, {
                open: true,
                // A partial header: the dialog treats every field it is not given as absent.
                sysConfig: {
                    firmwareType: FIRMWARE_TYPE_BETAFLIGHT,
                    firmwareVersion: "4.5.0",
                    ...sysConfig,
                } as SysConfig,
            }),
    });
    app.component("UButton", Stub("button"));
    app.component("UIcon", Stub("div"));
    app.component("UInput", Stub("div"));
    app.component("UTable", Stub("div"));
    app.mount(host);
    await nextTick();

    const copy = [...host.querySelectorAll("button")].find((b) => b.title === "Copy all parameters to clipboard");
    copy!.click();
    return writeText.mock.calls[0][0] as string;
}

describe("HeaderDialog dynamic lowpass rows", () => {
    it("shows the dynamic gyro and D-term LPF when max is above a non-zero min", async () => {
        const text = await copiedHeader({ gyro_lowpass_dyn_hz: [250, 500], dterm_lpf_dyn_hz: [75, 150] });

        expect(text).toContain("  Dyn LPF Min: 250\n  Dyn LPF Max: 500");
        expect(text).toContain("  Dyn Min Hz: 75\n  Dyn Max Hz: 150");
    });

    it.each([
        ["a zero min", [0, 500]],
        ["a max no higher than the min", [250, 250]],
        ["a missing max", [250, null]],
        ["a missing min", [null, 500]],
    ])("hides them for %s", async (_label, range) => {
        const text = await copiedHeader({ gyro_lowpass_dyn_hz: range, dterm_lpf_dyn_hz: range });

        // A row whose value is absent is dropped, so check each row, not just one.
        expect(text).not.toContain("Dyn LPF");
        expect(text).not.toContain("Dyn Min Hz");
        expect(text).not.toContain("Dyn Max Hz");
    });
});

describe("HeaderDialog notch rows", () => {
    it("shows two notches when the header logs lists", async () => {
        const text = await copiedHeader({ gyro_notch_hz: [400, 300], gyro_notch_cutoff: [300, 200] });

        expect(text).toContain("  Notch 1 Hz: 400\n  Notch 1 Cutoff: 300\n  Notch 2 Hz: 300\n  Notch 2 Cutoff: 200");
    });

    it("skips a cutoff logged as a single value next to a list of notches", async () => {
        const text = await copiedHeader({ gyro_notch_hz: [400, 300], gyro_notch_cutoff: 300 });

        expect(text).toContain("  Notch 1 Hz: 400\n  Notch 2 Hz: 300");
        expect(text).not.toContain("Notch 1 Cutoff");
    });

    it("shows one notch for a single logged value", async () => {
        const text = await copiedHeader({ gyro_notch_hz: 400, gyro_notch_cutoff: 300 });

        expect(text).toContain("  Notch Hz: 400\n  Notch Cutoff: 300");
    });
});

describe("HeaderDialog value formatting", () => {
    it("formats a list-parsed field logged as one value", async () => {
        const text = await copiedHeader({ thrust_linear: 25 });

        expect(text).toContain("  Thrust Linear: 25");
    });
});
