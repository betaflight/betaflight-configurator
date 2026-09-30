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
import { mount, shallowMount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent } from "vue";
import { Quaternion, Vector3 } from "three";
import Flight3DPanel from "../../src/blackbox-viewer/components/Flight3DPanel.vue";
import { useGraphStore } from "../../src/blackbox-viewer/stores/graph";
import { useSettingsStore } from "../../src/blackbox-viewer/stores/settings.js";
import type { FlightTrack } from "../../src/blackbox-viewer/flight3d/flightTrack";

// WebGL is not available here; the fake records what the panel hands the scene.
interface FakeScene {
    canvas: HTMLCanvasElement;
    canvasInPageAtDispose?: boolean;
    track?: FlightTrack | null;
    attitude?: Quaternion;
}
const scenes: FakeScene[] = [];
vi.mock("../../src/blackbox-viewer/flight3d/flightScene", () => ({
    FlightScene: class implements FakeScene {
        canvas: HTMLCanvasElement;
        canvasInPageAtDispose?: boolean;
        track?: FlightTrack | null;
        attitude?: Quaternion;
        constructor(canvas: HTMLCanvasElement) {
            this.canvas = canvas;
            scenes.push(this);
        }
        setTrack(track: FlightTrack | null) {
            this.track = track;
        }
        setTime(tUs: number, attitude: Quaternion | null) {
            // Only the latest update's attitude; the real scene keeps the previous one on null.
            this.attitude = attitude?.clone();
            return this.track?.positionAt(tUs) ?? null;
        }
        setFollow() {}
        setGroundSource() {}
        resize() {}
        pickTime() {
            return null;
        }
        dispose() {
            this.canvasInPageAtDispose = this.canvas.isConnected;
        }
    },
}));
vi.mock("../../src/blackbox-viewer/playback_controls.js", () => ({ setCurrentBlackboxTime: vi.fn() }));

describe("Flight3DPanel", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        scenes.length = 0;
        vi.stubGlobal(
            "ResizeObserver",
            class {
                observe() {}
                disconnect() {}
            },
        );
    });
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    const mountPanel = () => shallowMount(Flight3DPanel, { attachTo: document.body });

    /** The panel shown and hidden by v-if inside a container that stays in the page, as App.vue does. */
    const mountToggled = () =>
        mount(
            defineComponent({
                components: { Flight3DPanel },
                data: () => ({ open: true }),
                template: `<div><Flight3DPanel v-if="open" /></div>`,
            }),
            { attachTo: document.body, global: { stubs: { UButton: true, USelect: true, UIcon: true } } },
        );

    it("tears the 3D scene down while its canvas is still in the page", async () => {
        // OrbitControls removes a document-level listener through the canvas; once the canvas is
        // detached it cannot, and every closed panel would stay in memory.
        const wrapper = mountToggled();
        await wrapper.setData({ open: false });
        expect(scenes).toHaveLength(1);
        expect(scenes[0].canvasInPageAtDispose).toBe(true);
        wrapper.unmount();
    });

    it("stops taking playback updates once closed", async () => {
        const graphStore = useGraphStore();
        const wrapper = mountToggled();
        expect(graphStore.flight3d).not.toBeNull();
        await wrapper.setData({ open: false });
        expect(graphStore.flight3d).toBeNull();
        wrapper.unmount();
    });

    it("keeps a dragged panel inside the graph and remembers where it was left", async () => {
        const graphStore = useGraphStore();
        const settingsStore = useSettingsStore();
        const wrapper = mountPanel();
        graphStore.flight3d!.resize(1000, 500);
        await wrapper.vm.$nextTick();

        const header = wrapper.find(".cursor-move").element;
        const pointer = (type: string, x: number, y: number) =>
            new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y });
        header.dispatchEvent(pointer("pointerdown", 100, 100));
        window.dispatchEvent(pointer("pointermove", 5100, 5100));
        window.dispatchEvent(pointer("pointerup", 5100, 5100));
        await wrapper.vm.$nextTick();

        // Default size is 35% x 45% of the graph, so the far corner leaves it at 65%, 55%.
        const style = (wrapper.element as HTMLElement).style;
        expect([style.left, style.top, style.width, style.height]).toEqual(["650px", "275px", "350px", "225px"]);
        expect(settingsStore.userSettings.flight3d).toMatchObject({ left: "65.00%", top: "55.00%" });
        wrapper.unmount();
    });

    describe("with every combination of logged sensors", () => {
        const ALL_FIELDS = [
            "loopIteration",
            "time",
            "GPS_numSat",
            "GPS_coord[0]",
            "GPS_coord[1]",
            "GPS_altitude",
            "GPS_speed",
            "GPS_ground_course",
            "baroAlt",
            "imuQuaternion[0]",
            "imuQuaternion[1]",
            "imuQuaternion[2]",
            "heading[0]",
            "heading[1]",
            "heading[2]",
        ];
        const GPS = [
            "loopIteration",
            "time",
            "GPS_numSat",
            "GPS_coord[0]",
            "GPS_coord[1]",
            "GPS_altitude",
            "GPS_speed",
        ];
        const ATTITUDE: Record<string, string[]> = {
            "the FC quaternion": ["imuQuaternion[0]", "imuQuaternion[1]", "imuQuaternion[2]"],
            // Everything else a log may carry about direction; none of it is the nose's heading.
            "no FC quaternion": ["heading[0]", "heading[1]", "heading[2]", "GPS_ground_course"],
        };
        const ALTITUDE: Record<string, string[]> = { "a barometer": ["baroAlt"], "no barometer": [] };

        /** 20 s at 50 Hz flying east at 10 m/s, nose first, climbing 1 m/s; GPS updates at 10 Hz. */
        function fakeLog(fields: string[], numSat = 12) {
            // The FC's yaw is the negative of the compass heading, about its up axis.
            const east = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -Math.PI / 2);
            const frames = Array.from({ length: 1001 }, (_, i) => {
                const tS = i / 50;
                const gpsT = Math.floor(i / 5) / 10;
                const values: Record<string, number> = {
                    loopIteration: i,
                    time: tS * 1e6,
                    GPS_numSat: numSat,
                    "GPS_coord[0]": 484_000_000,
                    "GPS_coord[1]": Math.round((-71.1 + (10 * gpsT) / 73_900) * 1e7),
                    GPS_altitude: Math.round((100 + gpsT) * 10),
                    GPS_speed: 1000,
                    GPS_ground_course: 900,
                    baroAlt: Math.round(tS * 100),
                    "imuQuaternion[0]": Math.round(east.x * 0x7fff),
                    "imuQuaternion[1]": Math.round(east.y * 0x7fff),
                    "imuQuaternion[2]": Math.round(east.z * 0x7fff),
                    // The viewer's gyro-only estimate, 70° off the real heading: never to be shown.
                    "heading[0]": 0,
                    "heading[1]": 0,
                    "heading[2]": (20 * Math.PI) / 180,
                };
                return fields.map((name) => values[name]);
            });
            return {
                getMainFieldIndexByName: (name: string) => (fields.includes(name) ? fields.indexOf(name) : undefined),
                getChunksInTimeRange: () => [{ frames }],
                getMinTime: () => 0,
                getMaxTime: () => 20e6,
                getLogIndex: () => 0,
                getSysConfig: () => ({}),
                getCurrentFrameAtTime: (tUs: number) => ({ current: frames[Math.round(tUs / 20_000)] ?? null }),
            };
        }

        const noseAzimuthDeg = (q: Quaternion) => {
            const nose = new Vector3(1, 0, 0).applyQuaternion(q);
            return (Math.atan2(nose.z, nose.x) * 180) / Math.PI;
        };

        const combos = Object.entries(ATTITUDE).flatMap(([attitude, attitudeFields]) =>
            Object.entries(ALTITUDE).map(([altitude, altitudeFields]) => ({
                name: `${attitude} and ${altitude}`,
                fields: [...GPS, ...attitudeFields, ...altitudeFields],
                hasFcAttitude: attitudeFields.includes("imuQuaternion[0]"),
            })),
        );

        it.each(combos)("draws the path and height with $name", async ({ fields, hasFcAttitude }) => {
            const graphStore = useGraphStore();
            const wrapper = mountPanel();
            graphStore.flight3d!.setFlightLog(fakeLog(fields));
            graphStore.flight3d!.setCurrentTime(10e6);
            await wrapper.vm.$nextTick();

            const scene = scenes[0];
            const track = scene.track!;
            expect(track).toBeTruthy();
            expect(Math.abs(track.positionAt(10e6)!.u - track.groundU - 10)).toBeLessThan(1);
            const shownAltitude = Number(/Alt (-?[\d.]+) m/.exec(wrapper.text())?.[1]);
            expect(Math.abs(shownAltitude - 10)).toBeLessThan(1);
            // Only the FC's own attitude orients the drone; anything else shows a position marker.
            if (hasFcAttitude) {
                expect(noseAzimuthDeg(scene.attitude!)).toBeCloseTo(90, 0);
            } else {
                expect(scene.attitude).toBeUndefined();
            }
            wrapper.unmount();
        });

        it("tells a log without GPS from one whose GPS never had a usable fix", async () => {
            const graphStore = useGraphStore();
            const wrapper = mountPanel();
            graphStore.flight3d!.setFlightLog(fakeLog(ALL_FIELDS.filter((name) => !name.startsWith("GPS_"))));
            await wrapper.vm.$nextTick();
            expect(wrapper.text()).toContain("No GPS data in this log");

            graphStore.flight3d!.setFlightLog({ ...fakeLog(ALL_FIELDS, 3), getLogIndex: () => 1 });
            await wrapper.vm.$nextTick();
            expect(wrapper.text()).toContain("No usable GPS fix in this log");
            wrapper.unmount();
        });
    });
});
