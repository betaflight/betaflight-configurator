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
import { BoxGeometry, Group, Mesh, Quaternion, Vector3 } from "three";
import { FlightScene } from "../../../src/blackbox-viewer/flight3d/flightScene";
import { buildTrack } from "../../../src/blackbox-viewer/flight3d/flightTrack";

const stats = vi.hoisted(() => ({ renders: 0, disposals: 0 }));
// The drone model the fake loader hands over (none unless a test sets one), at once or on `deliver`.
const model = vi.hoisted(() => ({
    factory: null as null | (() => unknown),
    deferred: false,
    deliver: null as null | (() => void),
}));
vi.mock("three", async (original) => {
    const three = await original<typeof import("three")>();
    return {
        ...three,
        WebGLRenderer: class {
            setPixelRatio() {}
            setClearColor() {}
            setSize() {}
            render() {
                stats.renders++;
            }
            dispose() {
                stats.disposals++;
            }
            forceContextLoss() {}
        },
    };
});
vi.mock("three/examples/jsm/loaders/GLTFLoader.js", () => ({
    GLTFLoader: class {
        load(_url: string, onLoad: (gltf: { scene: unknown }) => void) {
            const factory = model.factory;
            if (factory) {
                model.deliver = () => onLoad({ scene: factory() });
                if (!model.deferred) {
                    model.deliver();
                }
            }
        }
    },
}));

afterEach(() => vi.unstubAllGlobals());

describe("flight scene lifecycle", () => {
    it("cancels queued renders and stays idle while the viewer is hidden or disposed", () => {
        const pending = new Map<number, FrameRequestCallback>();
        let id = 0;
        vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
            pending.set(++id, callback);
            return id;
        });
        vi.stubGlobal("cancelAnimationFrame", (key: number) => pending.delete(key));
        const flush = () => {
            const callbacks = [...pending.values()];
            pending.clear();
            for (const callback of callbacks) callback(0);
        };
        const canvas = document.createElement("canvas");
        document.body.append(canvas);
        const scene = new FlightScene(canvas);
        scene.setGroundSource("none");
        scene.setTrack(
            buildTrack(
                [
                    { tUs: 0, lat: 48.4, lon: -71.1, altM: 100 },
                    { tUs: 1e6, lat: 48.40001, lon: -71.1, altM: 90 },
                ],
                null,
            ),
        );
        flush();
        const visibleDraws = stats.renders;
        expect(visibleDraws).toBeGreaterThan(0);
        scene.setTime(500000, null);
        expect(pending.size).toBe(1);
        scene.setActive(false);
        expect(pending.size).toBe(0);
        for (let i = 0; i < 120; i++) {
            scene.setTime(i * 1000, null);
            scene.resize(800, 600);
        }
        flush();
        expect(stats.renders).toBe(visibleDraws);
        scene.setActive(true);
        flush();
        expect(stats.renders).toBe(visibleDraws + 1);
        scene.setTime(500000, null);
        scene.dispose();
        expect(pending.size).toBe(0);
        scene.resize(800, 600);
        scene.setTime(800000, null);
        flush();
        expect(stats.renders).toBe(visibleDraws + 1);
        expect(stats.disposals).toBeGreaterThan(0);
        canvas.remove();
    });

    it("makes the map see-through while any part of the drone is below it", () => {
        const pending: FrameRequestCallback[] = [];
        vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => pending.push(callback));
        vi.stubGlobal("cancelAnimationFrame", () => {});
        const flush = () => {
            for (const callback of pending.splice(0)) callback(0);
        };
        // Shaped like the real quad model before scaling: 8 units wide, 1 unit tall.
        model.factory = () => new Group().add(new Mesh(new BoxGeometry(8, 1, 8)));
        const canvas = document.createElement("canvas");
        document.body.append(canvas);
        try {
            const scene = new FlightScene(canvas);
            // 50 s north at 5 m/s: on the ground, 60 m up, 10 m under the map, 60 m up, skimming at 1 m.
            const height = (t: number) => (t < 10 ? 0 : t < 20 ? 60 : t < 30 ? -10 : t < 36 ? 60 : 1);
            const fixes = Array.from({ length: 501 }, (_, i) => {
                const t = i / 10;
                return { tUs: t * 1e6, lat: 48.4 + (5 * t) / 111_000, lon: -71.1, altM: 100 + height(t) };
            });
            const track = buildTrack(fixes, null)!;
            scene.setTrack(track);
            const ground = (
                scene as unknown as { ground: { group: { children: { material: { transparent: boolean } }[] } } }
            ).ground;
            const seeThroughAt = (tS: number) => {
                const position = scene.setTime(tS * 1e6, new Quaternion()); // level, so the quad is drawn
                flush();
                return { seeThrough: ground.group.children.every((tile) => tile.material.transparent), position };
            };

            expect(seeThroughAt(15).seeThrough).toBe(false);
            expect(seeThroughAt(25).seeThrough).toBe(true);
            expect(seeThroughAt(33).seeThrough).toBe(false);
            // Centre above the map, but the drone as drawn reaches through it.
            const skimming = seeThroughAt(49);
            expect(skimming.position!.u).toBeGreaterThan(track.groundU);
            expect(skimming.seeThrough).toBe(true);
            scene.dispose();
        } finally {
            model.factory = null;
            canvas.remove();
        }
    });

    it("draws the quad once loaded and with the FC's attitude, and a position marker otherwise", () => {
        vi.stubGlobal("requestAnimationFrame", () => 1);
        vi.stubGlobal("cancelAnimationFrame", () => {});
        model.factory = () => new Group().add(new Mesh(new BoxGeometry(8, 1, 8)));
        model.deferred = true;
        const canvas = document.createElement("canvas");
        document.body.append(canvas);
        try {
            const scene = new FlightScene(canvas);
            scene.setGroundSource("none");
            scene.setTrack(
                buildTrack(
                    [
                        { tUs: 0, lat: 48.4, lon: -71.1, altM: 100 },
                        { tUs: 1e6, lat: 48.4001, lon: -71.1, altM: 100 },
                    ],
                    null,
                ),
            );
            const parts = scene as unknown as {
                model: { visible: boolean };
                marker: { visible: boolean };
                drone: { quaternion: Quaternion };
            };
            const east = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -Math.PI / 2);

            scene.setTime(0.5e6, east);
            expect(parts.marker.visible).toBe(true); // the quad model has not loaded yet
            model.deliver!();
            expect([parts.model.visible, parts.marker.visible]).toEqual([true, false]);
            expect(parts.drone.quaternion.equals(east)).toBe(true);

            scene.setTime(0.5e6, null);
            expect([parts.model.visible, parts.marker.visible]).toEqual([false, true]);
            scene.dispose();
        } finally {
            Object.assign(model, { factory: null, deferred: false, deliver: null });
            canvas.remove();
        }
    });
});
