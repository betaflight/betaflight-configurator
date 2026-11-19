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
import { Box3, BoxGeometry, Group, Mesh, Quaternion, Vector3 } from "three";
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

const terrainLoads = vi.hoisted(() => [] as { box: unknown; signal: AbortSignal; resolve(model: unknown): void }[]);
vi.mock("../../../src/blackbox-viewer/flight3d/terrain", async (original) => ({
    ...(await original<typeof import("../../../src/blackbox-viewer/flight3d/terrain")>()),
    loadElevation: (box: unknown, signal: AbortSignal) =>
        new Promise((resolve) => terrainLoads.push({ box, signal, resolve })),
}));

const buildingLoads = vi.hoisted(
    () => [] as { box: unknown; path: unknown[]; signal: AbortSignal; resolve(f: unknown): void; reject(): void }[],
);
vi.mock("../../../src/blackbox-viewer/flight3d/buildings", async (original) => ({
    ...(await original<typeof import("../../../src/blackbox-viewer/flight3d/buildings")>()),
    loadBuildings: (box: unknown, path: unknown[], signal: AbortSignal) =>
        new Promise((resolve, reject) =>
            buildingLoads.push({ box, path, signal, resolve, reject: () => reject(new Error("offline")) }),
        ),
}));

afterEach(() => vi.unstubAllGlobals());

describe("path colouring", () => {
    it("recolours path and curtain by speed and back, keeping the part flown so far and the quad", () => {
        vi.stubGlobal("requestAnimationFrame", () => 1);
        vi.stubGlobal("cancelAnimationFrame", () => {});
        model.factory = () => new Group().add(new Mesh(new BoxGeometry(8, 1, 8)));
        try {
            const scene = new FlightScene(document.createElement("canvas"));
            scene.setGroundSource("none");
            // 20 s due north, slowing from 20 m/s to a stop while climbing to 50 m: the start is fast
            // but low, the end high but slow, so the two colourings run in opposite directions.
            const fixes = Array.from({ length: 201 }, (_, i) => {
                const t = i / 10;
                return {
                    tUs: i * 100_000,
                    lat: 48.4 + (20 * t - (t * t) / 2) / 111_200,
                    lon: -71.1,
                    altM: 100 + 2.5 * t,
                };
            });
            const track = buildTrack(fixes, null)!;
            scene.setTrack(track);
            scene.setTime(10e6, new Quaternion()); // paused mid-flight with the FC's attitude
            type Inside = {
                traveled: { instanceCount: number };
                path: { geometry: { getAttribute(name: string): { data: { array: ArrayLike<number> } } } }[];
                curtain: { geometry: { getAttribute(name: string): { array: ArrayLike<number> } } };
                model: { visible: boolean };
            };
            const inside = scene as unknown as Inside;
            const colors = () => ({
                path: Array.from(inside.path[0].geometry.getAttribute("instanceColorStart").data.array),
                curtain: Array.from(inside.curtain.geometry.getAttribute("color").array),
            });
            /** Red, green, blue of the first and last vertex. */
            const ends = (rgb: number[]) => [rgb.slice(0, 3), rgb.slice(-3)];
            const distance = (a: number[], b: number[]) => Math.hypot(...a.map((v, i) => v - b[i]));
            const flown = inside.traveled.instanceCount;
            const altitudeScale = scene.colorScale;
            const altitudeColors = colors();
            expect(altitudeScale.coloring).toBe("altitude");
            expect(altitudeScale.max).toBeCloseTo(track.bounds.maxU - track.groundU, 3);
            expect(inside.model.visible).toBe(true);

            scene.setColoring("speed");
            expect(scene.colorScale.coloring).toBe("speed");
            expect(scene.colorScale.max).toBeGreaterThan(15);
            const speedColors = colors();
            for (const part of ["path", "curtain"] as const) {
                // Altitude starts at the bottom of the scale and speed at the top, and the reverse at the end.
                const [altStart, altEnd] = ends(altitudeColors[part]);
                const [speedStart, speedEnd] = ends(speedColors[part]);
                expect(distance(speedStart, altEnd)).toBeLessThan(distance(speedStart, altStart) / 4);
                expect(distance(speedEnd, altStart)).toBeLessThan(distance(speedEnd, altEnd) / 4);
            }
            expect(inside.path).toHaveLength(2);
            expect(inside.traveled.instanceCount).toBe(flown);
            expect(inside.model.visible).toBe(true);

            scene.setColoring("altitude");
            expect(scene.colorScale).toEqual(altitudeScale);
            expect(colors()).toEqual(altitudeColors);
            expect(inside.traveled.instanceCount).toBe(flown);
            expect(inside.model.visible).toBe(true);
            scene.dispose();
        } finally {
            model.factory = null;
        }
    });
});

describe("terrain", () => {
    const ORIGIN = { lat: 29.9792, lon: 31.1342 };
    const trackAt = (lat: number) =>
        buildTrack(
            [
                { tUs: 0, lat, lon: ORIGIN.lon, altM: 60 },
                { tUs: 1e6, lat: lat + 0.001, lon: ORIGIN.lon, altM: 80 },
            ],
            null,
        );
    // Rises 10 m per 100 m north of the origin; nothing south of it.
    const slope = {
        elevationAt: (lat: number) => (lat < ORIGIN.lat - 1e-9 ? null : 200 + (lat - ORIGIN.lat) * 11_085),
    };
    const settle = () => new Promise((resolve) => setTimeout(resolve));

    function sceneWithTrack(lat = ORIGIN.lat) {
        vi.stubGlobal("requestAnimationFrame", () => 1);
        vi.stubGlobal("cancelAnimationFrame", () => {});
        terrainLoads.length = 0;
        const scene = new FlightScene(document.createElement("canvas"));
        const states: string[] = [];
        scene.onTerrainState = (state) => states.push(state);
        scene.setGroundSource("none");
        const track = trackAt(lat)!;
        scene.setTrack(track);
        return { scene, states, track };
    }

    it("loads the flight's terrain once, on first use, and lays the ground over it from the origin", async () => {
        const { scene, states, track } = sceneWithTrack();
        expect(terrainLoads).toHaveLength(0);
        expect(scene.surfaceU(100, 0)).toBe(track.groundU);

        scene.setTerrain(true);
        expect(states).toEqual(["loading"]);
        expect(terrainLoads).toHaveLength(1);
        expect(terrainLoads[0].box).toEqual(track.box);
        terrainLoads[0].resolve(slope);
        await settle();

        expect(states).toEqual(["loading", "ready"]);
        expect(scene.terrainShown).toBe(true);
        expect(scene.surfaceU(0, 0)).toBeCloseTo(track.groundU, 3);
        expect(scene.surfaceU(100, 0)).toBeCloseTo(track.groundU + 10, 1);
        // Where no tile loaded, the ground stays level with the origin.
        expect(scene.surfaceU(-100, 0)).toBeCloseTo(track.groundU, 3);

        scene.setTerrain(false);
        expect(states.at(-1)).toBe("off");
        expect(scene.terrainShown).toBe(false);
        expect(scene.surfaceU(100, 0)).toBe(track.groundU);

        scene.setTerrain(true);
        expect(states.at(-1)).toBe("ready");
        expect(terrainLoads).toHaveLength(1);
        scene.dispose();
    });

    it("drops a load for a flight that has been replaced, and fetches the new one's", async () => {
        const { scene, states } = sceneWithTrack();
        scene.setTerrain(true);
        const first = terrainLoads[0];
        scene.setTrack(trackAt(ORIGIN.lat + 0.01));
        expect(first.signal.aborted).toBe(true);
        expect(terrainLoads).toHaveLength(2);
        first.resolve(slope);
        await settle();
        expect(scene.terrainShown).toBe(false);
        expect(states.at(-1)).toBe("loading");
        scene.dispose();
        expect(terrainLoads[1].signal.aborted).toBe(true);
    });

    it("reports terrain without a height at the takeoff spot as unavailable", async () => {
        const { scene, states } = sceneWithTrack(ORIGIN.lat - 0.01);
        scene.setTerrain(true);
        terrainLoads[0].resolve(slope);
        await settle();
        expect(states).toEqual(["loading", "failed"]);
        expect(scene.terrainShown).toBe(false);
        scene.dispose();
    });
});

describe("buildings", () => {
    const ORIGIN = { lat: 29.9792, lon: 31.1342 };
    const M_PER_DEG_LAT = 110_850;
    const settle = () => new Promise((resolve) => setTimeout(resolve));
    // 10 m square, 30 m tall, 100 m north of the takeoff.
    const tower = {
        rings: [
            [0, 10, 10, 0].map((dn, k) => ({
                lat: ORIGIN.lat + (100 + dn) / M_PER_DEG_LAT,
                lon: ORIGIN.lon + [0, 0, 10, 10][k] / 96_500,
            })),
        ],
        height: 30,
        minHeight: 0,
    };

    function sceneWithTrack() {
        vi.stubGlobal("requestAnimationFrame", () => 1);
        vi.stubGlobal("cancelAnimationFrame", () => {});
        buildingLoads.length = 0;
        terrainLoads.length = 0;
        const scene = new FlightScene(document.createElement("canvas"));
        const states: string[] = [];
        scene.onBuildingsState = (state) => states.push(state);
        scene.setGroundSource("none");
        const track = buildTrack(
            [
                { tUs: 0, lat: ORIGIN.lat, lon: ORIGIN.lon, altM: 60 },
                { tUs: 10e6, lat: ORIGIN.lat + 0.002, lon: ORIGIN.lon, altM: 80 },
            ],
            null,
        )!;
        scene.setTrack(track);
        const mesh = () => (scene as unknown as { buildings: Mesh | null }).buildings;
        const heights = () => {
            const box = new Box3().setFromObject(mesh()!);
            return [box.min.y, box.max.y];
        };
        return { scene, states, track, mesh, heights };
    }

    it("loads the flight's buildings once, on first use, and stands them on the ground or terrain", async () => {
        const { scene, states, track, mesh, heights } = sceneWithTrack();
        expect(buildingLoads).toHaveLength(0);

        scene.setBuildings(true);
        expect(states).toEqual(["loading"]);
        expect(buildingLoads).toHaveLength(1);
        expect(buildingLoads[0].box).toEqual(track.box);
        expect(buildingLoads[0].path.length).toBeGreaterThan(0);
        buildingLoads[0].resolve([tower]);
        await settle();
        expect(states).toEqual(["loading", "ready"]);
        expect(scene.buildingCount).toBe(1);
        expect(heights()[0]).toBeCloseTo(track.groundU, 3);
        expect(heights()[1]).toBeCloseTo(track.groundU + 30, 3);

        // Terrain 10 m higher at the tower than at takeoff lifts it with the ground.
        scene.setTerrain(true);
        terrainLoads[0].resolve({ elevationAt: (lat: number) => 200 + (lat - ORIGIN.lat) * 11_085 });
        await settle();
        expect(heights()[0]).toBeCloseTo(track.groundU + 10, 0);

        scene.setBuildings(false);
        expect(states.at(-1)).toBe("off");
        expect(mesh()).toBeNull();
        expect(scene.buildingCount).toBeNull();

        scene.setBuildings(true);
        expect(states.at(-1)).toBe("ready");
        expect(mesh()).not.toBeNull();
        expect(buildingLoads).toHaveLength(1);
        scene.dispose();
    });

    it("reports a failed load and tries again when switched on next", async () => {
        const { scene, states, mesh } = sceneWithTrack();
        scene.setBuildings(true);
        buildingLoads[0].reject();
        await settle();
        expect(states).toEqual(["loading", "failed"]);
        expect(mesh()).toBeNull();

        scene.setBuildings(false);
        scene.setBuildings(true);
        expect(buildingLoads).toHaveLength(2);
        expect(states.at(-1)).toBe("loading");
        scene.dispose();
    });

    it("drops a load for a flight that has been replaced", async () => {
        const { scene, mesh } = sceneWithTrack();
        scene.setBuildings(true);
        const first = buildingLoads[0];
        scene.setTrack(
            buildTrack(
                [
                    { tUs: 0, lat: 0.5, lon: 0.5, altM: 0 },
                    { tUs: 1e6, lat: 0.501, lon: 0.5, altM: 0 },
                ],
                null,
            ),
        );
        expect(first.signal.aborted).toBe(true);
        first.resolve([tower]);
        await settle();
        expect(mesh()).toBeNull();
        scene.dispose();
    });
});

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
