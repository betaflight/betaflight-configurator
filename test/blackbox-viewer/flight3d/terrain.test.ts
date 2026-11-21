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

import { describe, expect, it } from "vitest";
import {
    decodeTerrarium,
    ElevationModel,
    loadElevation,
    localToLatLon,
    TERRAIN_SOURCE,
    type ElevationTile,
} from "../../../src/blackbox-viewer/flight3d/terrain";
import {
    tileRange,
    padded,
    pickZoom,
    tileToLonLat,
    type LatLonBox,
} from "../../../src/blackbox-viewer/flight3d/tileGround";
import { buildTrack } from "../../../src/blackbox-viewer/flight3d/flightTrack";

const Z = 15;
const TX = 19_000;
const TY = 13_000;

/** A tile whose height is `f(column, row)`. */
function tile(f: (column: number, row: number) => number): ElevationTile {
    const heights = new Float32Array(256 * 256);
    for (let row = 0; row < 256; row++) {
        for (let column = 0; column < 256; column++) {
            heights[row * 256 + column] = f(column, row);
        }
    }
    return heights;
}

/** Lat/lon of a (fractional) pixel centre in tile (TX + dx, TY). */
function at(column: number, row: number, dx = 0) {
    return tileToLonLat(TX + dx + (column + 0.5) / 256, TY + (row + 0.5) / 256, Z);
}

describe("decodeTerrarium", () => {
    it("reads meters from red, green and blue, clamping the seabed to sea level", () => {
        // 32768 + 100.5 = 128 * 256 + 100 + 128 / 256; 32768 - 20 = 127 * 256 + 236.
        const heights = decodeTerrarium([128, 0, 0, 255, 128, 100, 128, 255, 127, 236, 0, 255]);
        expect(Array.from(heights)).toEqual([0, 100.5, 0]);
    });
});

describe("ElevationModel", () => {
    const model = new ElevationModel(
        Z,
        new Map([
            [`${TX},${TY}`, tile((column) => column)],
            [`${TX + 1},${TY}`, tile((column) => 256 + column)],
        ]),
    );

    it("returns the pixel's height at its centre", () => {
        const p = at(10, 20);
        expect(model.elevationAt(p.lat, p.lon)).toBeCloseTo(10, 6);
    });

    it("interpolates between pixels, across a tile edge too", () => {
        const between = at(10.25, 20);
        expect(model.elevationAt(between.lat, between.lon)).toBeCloseTo(10.25, 3);
        const edge = at(255.5, 20);
        expect(model.elevationAt(edge.lat, edge.lon)).toBeCloseTo(255.5, 3);
    });

    it("leaves a missing neighbour out at the edge, and has no height where nothing loaded", () => {
        const west = at(-0.25, 20);
        expect(model.elevationAt(west.lat, west.lon)).toBeCloseTo(0, 6);
        const far = at(10, 20, 5);
        expect(model.elevationAt(far.lat, far.lon)).toBeNull();
    });
});

describe("loadElevation", () => {
    const box: LatLonBox = { minLat: 29.97, maxLat: 29.99, minLon: 31.12, maxLon: 31.14 };

    it("requests the flight's padded area and keeps the tiles that loaded", async () => {
        const urls: string[] = [];
        const model = await loadElevation(box, new AbortController().signal, async (url) => {
            urls.push(url);
            if (urls.length === 1) {
                throw new Error("HTTP 404");
            }
            return tile(() => 50);
        });
        const zoom = pickZoom(box, TERRAIN_SOURCE.maxZoom);
        const range = tileRange(padded(box), zoom);
        const count = (range.x1 - range.x0 + 1) * (range.y1 - range.y0 + 1);
        expect(model.zoom).toBe(zoom);
        expect(urls).toHaveLength(count);
        expect(urls[0]).toBe(
            `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${zoom}/${range.x0}/${range.y0}.png`,
        );
        expect(model.tileCount).toBe(count - 1);
    });

    it("rejects once aborted", async () => {
        const load = new AbortController();
        const pending = loadElevation(box, load.signal, async () => {
            load.abort();
            return tile(() => 0);
        });
        await expect(pending).rejects.toThrow();
    });
});

describe("localToLatLon", () => {
    const track = buildTrack(
        [
            { tUs: 0, lat: 29.9792, lon: 31.1342, altM: 60 },
            { tUs: 1e6, lat: 29.97921, lon: 31.1342, altM: 60 },
        ],
        null,
    )!;
    const toLocal = (lat: number, lon: number) => track.toLocal(lat, lon, track.origin.altM);
    const error = (n: number, e: number, refine: boolean) => {
        const { lat, lon } = localToLatLon(track.origin, n, e, refine ? toLocal : undefined);
        const back = toLocal(lat, lon);
        return Math.hypot(back.n - n, back.e - e);
    };

    it("is close from the ellipsoid alone near the origin", () => {
        expect(error(500, -500, false)).toBeLessThan(0.05);
    });

    it("inverts the track's local frame to a centimeter, 50 km out, refined through it", () => {
        expect(error(0, 5000, false)).toBeGreaterThan(0.5); // a parallel curving away from the flat east
        for (const [n, e] of [
            [50_000, 0],
            [0, 50_000],
            [-35_000, 35_000],
        ]) {
            expect(error(n, e, true)).toBeLessThan(0.01);
        }
    });
});
