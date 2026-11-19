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
import { Box3, Vector3 } from "three";
import {
    buildingsMesh,
    buildingTiles,
    loadBuildings,
    MAX_BUILDING_TILES,
    readBuildingTile,
    type Footprint,
} from "../../../src/blackbox-viewer/flight3d/buildings";
import { lonLatToTile, tileToLonLat } from "../../../src/blackbox-viewer/flight3d/tileGround";

// Giza, Egypt: a well-known public landmark, not a flying site.
const LAT0 = 29.9792;
const LON0 = 31.1342;
const Z = 14;
const M_PER_DEG_LAT = 110_850;
const M_PER_DEG_LON = 111_320 * Math.cos((LAT0 * Math.PI) / 180);
const toLocal = (lat: number, lon: number) => ({ n: (lat - LAT0) * M_PER_DEG_LAT, e: (lon - LON0) * M_PER_DEG_LON });

// --- A minimal Mapbox Vector Tile encoder, enough for polygons with numeric and boolean tags. ---

function varint(n: number): number[] {
    const out: number[] = [];
    while (n > 0x7f) {
        out.push((n & 0x7f) | 0x80);
        n = Math.floor(n / 128);
    }
    out.push(n);
    return out;
}
const field = (tag: number, wireType: number) => varint((tag << 3) | wireType);
const bytesField = (tag: number, bytes: number[]) => [...field(tag, 2), ...varint(bytes.length), ...bytes];
const varintField = (tag: number, n: number) => [...field(tag, 0), ...varint(n)];
const zigzag = (n: number) => (n << 1) ^ (n >> 31);

/** Rings as tile pixel points (y down), outer rings clockwise on screen and holes the other way. */
function polygonGeometry(rings: [number, number][][]): number[] {
    const commands: number[] = [];
    let x = 0;
    let y = 0;
    for (const ring of rings) {
        ring.forEach(([px, py], i) => {
            if (i === 0) commands.push((1 & 7) | (1 << 3));
            if (i === 1) commands.push((2 & 7) | ((ring.length - 1) << 3));
            commands.push(zigzag(px - x), zigzag(py - y));
            x = px;
            y = py;
        });
        commands.push(7 | (1 << 3));
    }
    return commands;
}

type Tags = Record<string, number | boolean>;

function encodeTile(features: { rings: [number, number][][]; tags: Tags }[]): ArrayBuffer {
    const keys: string[] = [];
    const values: (number | boolean)[] = [];
    const index = <T>(list: T[], item: T) => (list.includes(item) ? list.indexOf(item) : list.push(item) - 1);
    const encodedFeatures = features.map(({ rings, tags }) => {
        const tagIndexes = Object.entries(tags).flatMap(([k, v]) => [index(keys, k), index(values, v)]);
        const packed = (numbers: number[]) => numbers.flatMap(varint);
        return bytesField(2, [
            ...bytesField(2, packed(tagIndexes)),
            ...varintField(3, 3), // POLYGON
            ...bytesField(4, packed(polygonGeometry(rings))),
        ]);
    });
    const text = (s: string) => [...new TextEncoder().encode(s)];
    const layer = [
        ...varintField(15, 2),
        ...bytesField(1, text("building")),
        ...encodedFeatures.flat(),
        ...keys.flatMap((k) => bytesField(3, text(k))),
        ...values.flatMap((v) => bytesField(4, typeof v === "boolean" ? varintField(7, v ? 1 : 0) : varintField(5, v))),
        ...varintField(5, 4096),
    ];
    return new Uint8Array(bytesField(3, layer)).buffer;
}

const square = (x: number, y: number, size: number): [number, number][] => [
    [x, y],
    [x + size, y],
    [x + size, y + size],
    [x, y + size],
];

const tileOf = (lat: number, lon: number) => {
    const t = lonLatToTile(lon, lat, Z);
    return { x: Math.floor(t.x), y: Math.floor(t.y) };
};

describe("readBuildingTile", () => {
    const { x, y } = tileOf(LAT0, LON0);
    const courtyard = [square(100, 100, 400), [...square(200, 200, 100)].reverse()];

    it("reads each outline with its holes and heights, placed by the tile's corners", () => {
        const data = encodeTile([
            { rings: courtyard, tags: { render_height: 20, render_min_height: 0 } },
            // Two towers in one feature.
            { rings: [square(1000, 1000, 50), square(2000, 2000, 50)], tags: { render_height: 90 } },
        ]);
        const footprints = readBuildingTile(data, x, y, Z);

        expect(footprints.map((f) => [f.rings.length, f.height, f.minHeight])).toEqual([
            [2, 20, 0],
            [1, 90, 0],
            [1, 90, 0],
        ]);
        expect(footprints[0].rings.map((ring) => ring.length)).toEqual([4, 4]);
        const corner = tileToLonLat(x + 100 / 4096, y + 100 / 4096, Z);
        expect(footprints[0].rings[0][0].lat).toBeCloseTo(corner.lat, 9);
        expect(footprints[0].rings[0][0].lon).toBeCloseTo(corner.lon, 9);
        const tower = tileToLonLat(x + 2000 / 4096, y + 2000 / 4096, Z);
        expect(footprints[2].rings[0][0].lat).toBeCloseTo(tower.lat, 9);
    });

    it("leaves out parts hidden from 3D and those without height", () => {
        const data = encodeTile([
            { rings: [square(0, 0, 10)], tags: { render_height: 10, hide_3d: true } },
            { rings: [square(20, 20, 10)], tags: { render_height: 5, render_min_height: 5 } },
            { rings: [square(40, 40, 10)], tags: { render_height: 12, render_min_height: 4 } },
        ]);
        expect(readBuildingTile(data, x, y, Z).map((f) => [f.height, f.minHeight])).toEqual([[12, 4]]);
    });
});

describe("buildingTiles", () => {
    const box = (halfM: number) => ({
        minLat: LAT0 - halfM / M_PER_DEG_LAT,
        maxLat: LAT0 + halfM / M_PER_DEG_LAT,
        minLon: LON0 - halfM / M_PER_DEG_LON,
        maxLon: LON0 + halfM / M_PER_DEG_LON,
    });

    it("loads the whole area around a short flight", () => {
        const tiles = buildingTiles(box(500), []);
        expect(tiles).toContainEqual(tileOf(LAT0, LON0));
        expect(tiles.length).toBeLessThanOrEqual(MAX_BUILDING_TILES);
    });

    it("loads only the tiles a long flight passes over, in flight order, up to the limit", () => {
        // 100 km due east.
        const path = Array.from({ length: 1001 }, (_, i) => ({ lat: LAT0, lon: LON0 + (i * 100) / M_PER_DEG_LON }));
        const tiles = buildingTiles({ minLat: LAT0, maxLat: LAT0, minLon: LON0, maxLon: path.at(-1)!.lon }, path);
        expect(tiles).toHaveLength(MAX_BUILDING_TILES);
        expect(tiles[0]).toEqual(tileOf(LAT0, LON0));
        expect(new Set(tiles.map((t) => t.y))).toEqual(new Set([tileOf(LAT0, LON0).y]));
        expect(tiles.map((t) => t.x)).toEqual(tiles.map((_, i) => tiles[0].x + i));
    });
});

describe("loadBuildings", () => {
    const box = { minLat: LAT0, maxLat: LAT0 + 0.0005, minLon: LON0, maxLon: LON0 + 0.0005 };
    const template = () => Promise.resolve("https://tiles.example/{z}/{x}/{y}.pbf");
    const home = tileOf(LAT0, LON0);
    // Pixel position of the flight's corner in its tile.
    const t = lonLatToTile(LON0, LAT0, Z);
    const px = Math.round((t.x - home.x) * 4096);
    const py = Math.round((t.y - home.y) * 4096);

    it("keeps the buildings in the flight area from the tiles that loaded", async () => {
        const urls: string[] = [];
        const footprints = await loadBuildings(
            box,
            [],
            new AbortController().signal,
            async (url) => {
                urls.push(url);
                if (url !== `https://tiles.example/${Z}/${home.x}/${home.y}.pbf`) {
                    throw new Error("offline");
                }
                return encodeTile([
                    { rings: [square(px, py - 5, 5)], tags: { render_height: 10 } }, // at the flight
                    { rings: [square((px + 2048) % 4096, (py + 2048) % 4096, 5)], tags: { render_height: 10 } }, // ~1 km off
                ]);
            },
            template,
        );
        expect(urls.length).toBeGreaterThan(0);
        expect(footprints).toHaveLength(1);
    });

    it("rejects when no tile loads", async () => {
        await expect(
            loadBuildings(box, [], new AbortController().signal, () => Promise.reject(new Error("offline")), template),
        ).rejects.toThrow();
    });

    it("reads a missing tile as no buildings", async () => {
        await expect(
            loadBuildings(box, [], new AbortController().signal, () => Promise.resolve(null), template),
        ).resolves.toEqual([]);
    });
});

describe("buildingsMesh", () => {
    // 10 m square, 20 m tall, its south-west corner at the origin.
    const corner = (n: number, e: number) => ({ lat: LAT0 + n / M_PER_DEG_LAT, lon: LON0 + e / M_PER_DEG_LON });
    const footprint: Footprint = {
        rings: [[corner(0, 0), corner(0, 10), corner(10, 10), corner(10, 0)]],
        height: 20,
        minHeight: 0,
    };

    it("stands each building on the lowest ground under it, with walls and a roof", () => {
        // Rising 1 m per meter north.
        const mesh = buildingsMesh([footprint], toLocal, (lat) => 5 + (lat - LAT0) * M_PER_DEG_LAT);
        const bounds = new Box3().setFromObject(mesh);
        expect(bounds.min.y).toBeCloseTo(5, 3);
        expect(bounds.max.y).toBeCloseTo(25, 3);
        expect(bounds.min.x).toBeCloseTo(0, 3);
        expect(bounds.max.z).toBeCloseTo(10, 3);

        const position = mesh.geometry.getAttribute("position");
        const normal = mesh.geometry.getAttribute("normal");
        expect(position.count).toBe(4 * 6 + 2 * 3);
        const roof = Array.from({ length: position.count }, (_, i) => i).filter((i) => position.getY(i) > 24.9);
        const walls = roof.filter((i) => Math.abs(normal.getY(i)) < 1e-6);
        // Roof triangles lie flat; every wall is vertical.
        const flat = roof.filter((i) => Math.abs(normal.getY(i)) > 0.999);
        expect(flat).toHaveLength(6);
        expect(walls.length + flat.length).toBe(roof.length);
        mesh.geometry.dispose();
    });

    it("lifts a part that starts above the ground", () => {
        const mesh = buildingsMesh([{ ...footprint, minHeight: 12 }], toLocal, () => 0);
        const bounds = new Box3().setFromObject(mesh);
        expect([bounds.min.y, bounds.max.y]).toEqual([12, 20]);
        expect(bounds.getSize(new Vector3()).x).toBeCloseTo(10, 3);
        mesh.geometry.dispose();
    });
});
