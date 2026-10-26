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

import { describe, expect, it, vi } from "vitest";
import { Mesh, MeshBasicMaterial, Texture, TextureLoader, Vector3 } from "three";
import {
    buildGround,
    lonLatToTile,
    MAX_TILES,
    pickZoom,
    tileToLonLat,
    TILE_SOURCES,
    type LatLonBox,
} from "../../../src/blackbox-viewer/flight3d/tileGround";

const LAT0 = 48.4;
const LON0 = -71.1;
const M_PER_DEG_LAT = 111_320;
const M_PER_DEG_LON = M_PER_DEG_LAT * Math.cos((LAT0 * Math.PI) / 180);

function boxAround(halfSizeM: number): LatLonBox {
    return {
        minLat: LAT0 - halfSizeM / M_PER_DEG_LAT,
        maxLat: LAT0 + halfSizeM / M_PER_DEG_LAT,
        minLon: LON0 - halfSizeM / M_PER_DEG_LON,
        maxLon: LON0 + halfSizeM / M_PER_DEG_LON,
    };
}

const toLocal = (lat: number, lon: number) => ({ n: (lat - LAT0) * M_PER_DEG_LAT, e: (lon - LON0) * M_PER_DEG_LON });

describe("slippy tile math", () => {
    it("puts lat/lon 0,0 at the centre of the single zoom-0 tile", () => {
        const t = lonLatToTile(0, 0, 0);
        expect(t.x).toBeCloseTo(0.5, 12);
        expect(t.y).toBeCloseTo(0.5, 12);
    });

    it("round-trips a coordinate through tile space", () => {
        const t = lonLatToTile(LON0, LAT0, 17);
        const back = tileToLonLat(t.x, t.y, 17);
        expect(back.lon).toBeCloseTo(LON0, 9);
        expect(back.lat).toBeCloseTo(LAT0, 9);
    });

    it("numbers tile rows from north to south", () => {
        expect(lonLatToTile(LON0, 48, 15).y).toBeGreaterThan(lonLatToTile(LON0, 49, 15).y);
    });
});

describe("pickZoom", () => {
    /** Tiles buildGround requests for the box (no network). */
    const requested = (box: LatLonBox) => {
        const loader = vi.spyOn(TextureLoader.prototype, "load").mockReturnValue(new Texture());
        const ground = buildGround({ box, source: TILE_SOURCES.map, groundU: 0, toLocal, onTileLoaded: () => {} });
        const count = ground.group.children.length;
        ground.dispose();
        loader.mockRestore();
        return count;
    };

    it("keeps a 5 km flight within the tile budget", () => {
        expect(requested(boxAround(2500))).toBeLessThanOrEqual(MAX_TILES);
    });

    it("keeps useful detail for a 50 km flight, requesting more tiles than the budget", () => {
        expect(pickZoom(boxAround(25_000))).toBe(12);
        expect(requested(boxAround(25_000))).toBeGreaterThan(100);
    });

    it("uses full detail for a hover in one spot", () => {
        expect(pickZoom(boxAround(10))).toBe(19);
    });
});

describe("buildGround", () => {
    it("switches loaded tiles between opaque and see-through on request", () => {
        const images: (() => void)[] = [];
        const loader = vi.spyOn(TextureLoader.prototype, "load").mockImplementation((_url, onLoad) => {
            const texture = new Texture<HTMLImageElement>();
            images.push(() => onLoad?.(texture));
            return texture;
        });
        const faded = buildGround({
            box: boxAround(50),
            source: TILE_SOURCES.map,
            groundU: 0,
            toLocal,
            onTileLoaded: () => {},
        });
        const tiles = faded.group.children as Mesh[];
        // Distinct [transparent, faded, writes depth] states across all tiles.
        const states = () =>
            new Set(
                tiles.map(({ material }) => {
                    const m = material as MeshBasicMaterial;
                    return `${m.transparent} ${m.opacity < 1} ${m.depthWrite}`;
                }),
            );
        try {
            for (const load of images) load();
            expect(tiles.every((tile) => tile.visible && tile.renderOrder > 0)).toBe(true);
            expect(states()).toEqual(new Set(["false false true"]));
            faded.setTranslucent(true);
            expect(states()).toEqual(new Set(["true true false"]));
            faded.setTranslucent(false);
            expect(states()).toEqual(new Set(["false false true"]));
        } finally {
            faded.dispose();
            loader.mockRestore();
        }
    });

    const box = boxAround(300);
    const ground = buildGround({
        box,
        source: TILE_SOURCES.map,
        groundU: -2,
        toLocal,
        onTileLoaded: () => {},
    });
    const meshes = ground.group.children.filter((c): c is Mesh => c instanceof Mesh);
    const corner = (mesh: Mesh, i: number) =>
        new Vector3().fromBufferAttribute(mesh.geometry.getAttribute("position"), i);

    it("lays every tile flat at ground height, north toward +x and east toward +z, facing up", () => {
        expect(meshes.length).toBeGreaterThan(0);
        for (const mesh of meshes) {
            const [nw, ne, sw] = [corner(mesh, 0), corner(mesh, 1), corner(mesh, 2)];
            expect(nw.y).toBe(-2);
            expect(nw.x).toBeGreaterThan(sw.x);
            expect(ne.z).toBeGreaterThan(nw.z);
            const index = mesh.geometry.getIndex()!;
            const [a, b, c] = [0, 1, 2].map((i) => corner(mesh, index.getX(i)));
            const normal = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a));
            expect(normal.y).toBeGreaterThan(0);
        }
    });

    it("covers the whole flight area", () => {
        let minN = Infinity;
        let maxN = -Infinity;
        let minE = Infinity;
        let maxE = -Infinity;
        for (const mesh of meshes) {
            for (let i = 0; i < 4; i++) {
                const v = corner(mesh, i);
                minN = Math.min(minN, v.x);
                maxN = Math.max(maxN, v.x);
                minE = Math.min(minE, v.z);
                maxE = Math.max(maxE, v.z);
            }
        }
        expect(minN).toBeLessThanOrEqual(-300);
        expect(maxN).toBeGreaterThanOrEqual(300);
        expect(minE).toBeLessThanOrEqual(-300);
        expect(maxE).toBeGreaterThanOrEqual(300);
        ground.dispose();
    });
});
