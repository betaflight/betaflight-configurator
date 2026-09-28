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

import {
    BufferGeometry,
    Float32BufferAttribute,
    Group,
    Mesh,
    MeshBasicMaterial,
    SRGBColorSpace,
    TextureLoader,
} from "three";
import type { Texture } from "three";

export type GroundSourceId = "map" | "satellite" | "none";

const SEE_THROUGH_OPACITY = 0.35;

export interface TileSource {
    url: string;
    maxZoom: number;
    attribution: string;
}

export const TILE_SOURCES: Record<Exclude<GroundSourceId, "none">, TileSource> = {
    // Same tile server the viewer's 2D map already uses.
    map: {
        url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        maxZoom: 19,
        attribution: "© OpenStreetMap contributors",
    },
    // Same imagery the GPS tab uses (src/js/utils/map.js).
    satellite: {
        url: "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
        maxZoom: 20,
        attribution: "Imagery © Google",
    },
};

export interface LatLonBox {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
}

/** Fractional Web Mercator tile coordinates. */
export function lonLatToTile(lon: number, lat: number, z: number): { x: number; y: number } {
    const n = 2 ** z;
    const latRad = (lat * Math.PI) / 180;
    return {
        x: ((lon + 180) / 360) * n,
        y: ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
    };
}

/** Longitude/latitude of a tile's north-west corner. */
export function tileToLonLat(x: number, y: number, z: number): { lon: number; lat: number } {
    const n = 2 ** z;
    return {
        lon: (x / n) * 360 - 180,
        lat: (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI,
    };
}

export function tileRange(box: LatLonBox, z: number): { x0: number; x1: number; y0: number; y1: number } {
    const nw = lonLatToTile(box.minLon, box.maxLat, z);
    const se = lonLatToTile(box.maxLon, box.minLat, z);
    return { x0: Math.floor(nw.x), x1: Math.floor(se.x), y0: Math.floor(nw.y), y1: Math.floor(se.y) };
}

/** The box with a 20% margin on each side. */
function padded(box: LatLonBox): LatLonBox {
    const lat = (box.maxLat - box.minLat) * 0.2;
    const lon = (box.maxLon - box.minLon) * 0.2;
    return { minLat: box.minLat - lat, maxLat: box.maxLat + lat, minLon: box.minLon - lon, maxLon: box.maxLon + lon };
}

/** Deepest zoom whose tiles cover the padded box with at most `maxTiles` requests. */
export function pickZoom(box: LatLonBox, maxTiles = 36, zMin = 12, zMax = 19): number {
    const area = padded(box);
    for (let z = zMax; z > zMin; z--) {
        const r = tileRange(area, z);
        if ((r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1) <= maxTiles) {
            return z;
        }
    }
    return zMin;
}

export interface GroundOptions {
    box: LatLonBox;
    source: TileSource;
    /** Scene height of the ground plane. */
    groundU: number;
    /** Local scene position (x = North, z = East) of a lat/lon on the ground. */
    toLocal(lat: number, lon: number): { n: number; e: number };
    /** Called whenever a tile finishes loading, so the scene can re-render. */
    onTileLoaded(): void;
}

export interface Ground {
    group: Group;
    /**
     * The map is a flat reference plane, not terrain, so the recorded altitude can pass below it.
     * While the craft is below, the map is drawn see-through so the craft and path stay visible.
     */
    setTranslucent(translucent: boolean): void;
    dispose(): void;
}

/**
 * One mesh per tile, each placed by its own corners, so the mosaic lines up with the flight
 * path exactly. Textures come from the browser's HTTP cache on re-open.
 */
export function buildGround(options: GroundOptions): Ground {
    const { box, source, groundU, toLocal, onTileLoaded } = options;
    const z = pickZoom(box, 36, 12, source.maxZoom);
    const range = tileRange(padded(box), z);

    const group = new Group();
    const loader = new TextureLoader().setCrossOrigin("anonymous");
    const textures: Texture[] = [];
    let disposed = false;

    for (let x = range.x0; x <= range.x1; x++) {
        for (let y = range.y0; y <= range.y1; y++) {
            const corners = [
                [x, y],
                [x + 1, y],
                [x, y + 1],
                [x + 1, y + 1],
            ].map(([cx, cy]) => {
                const { lon, lat } = tileToLonLat(cx, cy, z);
                return toLocal(lat, lon);
            });
            const geometry = new BufferGeometry();
            geometry.setAttribute(
                "position",
                new Float32BufferAttribute(
                    corners.flatMap((c) => [c.n, groundU, c.e]),
                    3,
                ),
            );
            geometry.setAttribute("uv", new Float32BufferAttribute([0, 1, 1, 1, 0, 0, 1, 0], 2));
            geometry.setIndex([0, 2, 1, 1, 2, 3]); // wound to face up

            const material = new MeshBasicMaterial();
            const tile = new Mesh(geometry, material);
            tile.renderOrder = 10; // after the path, so a see-through map blends over the part below it
            tile.visible = false; // until its image arrives; a blank tile would still hide what is behind it
            group.add(tile);

            const url = source.url.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
            loader.load(url, (texture) => {
                if (disposed) {
                    texture.dispose();
                    return;
                }
                texture.colorSpace = SRGBColorSpace;
                textures.push(texture);
                material.map = texture;
                material.needsUpdate = true;
                tile.visible = true;
                onTileLoaded();
            });
        }
    }

    return {
        group,
        setTranslucent(translucent) {
            for (const object of group.children) {
                const material = (object as Mesh).material as MeshBasicMaterial;
                material.transparent = translucent;
                material.opacity = translucent ? SEE_THROUGH_OPACITY : 1;
                material.depthWrite = !translucent;
                material.needsUpdate = true;
            }
        },
        dispose() {
            disposed = true;
            group.traverse((object) => {
                if (object instanceof Mesh) {
                    object.geometry.dispose();
                    (object.material as MeshBasicMaterial).dispose();
                }
            });
            for (const texture of textures) {
                texture.dispose();
            }
        },
    };
}
