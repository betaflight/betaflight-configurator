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

// Tiles are requested once per log (the browser caches them), all at one zoom: the deepest that
// covers the flight within MAX_TILES. MIN_ZOOM is a deliberate floor, not a budget: coarser tiles
// are over 10 km wide and show nothing useful, so a larger flight requests more tiles instead
// (over 100 for a flight spanning 50 km). Revisit if long-range users report slow loading.
export const MAX_TILES = 64;
const MIN_ZOOM = 12;

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
    // Same imagery the GPS tab uses (src/js/utils/map.ts).
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

/**
 * The box with a margin on every side of 20% of its longer side, in meters: a long, thin flight
 * still gets scenery beside the path, not only beyond its ends.
 */
export function padded(box: LatLonBox): LatLonBox {
    const cosLat = Math.cos((((box.minLat + box.maxLat) / 2) * Math.PI) / 180);
    const longerDeg = Math.max(box.maxLat - box.minLat, (box.maxLon - box.minLon) * cosLat); // as latitude
    const lat = longerDeg * 0.2;
    const lon = lat / cosLat;
    return { minLat: box.minLat - lat, maxLat: box.maxLat + lat, minLon: box.minLon - lon, maxLon: box.maxLon + lon };
}

/** Deepest zoom whose tiles cover the padded box within MAX_TILES, but no coarser than MIN_ZOOM. */
export function pickZoom(box: LatLonBox, zMax = 19): number {
    const area = padded(box);
    for (let z = zMax; z > MIN_ZOOM; z--) {
        const r = tileRange(area, z);
        if ((r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1) <= MAX_TILES) {
            return z;
        }
    }
    return MIN_ZOOM;
}

/** Scene height of the ground at a lat/lon. */
export type SurfaceHeight = (lat: number, lon: number) => number;

// Squares per tile side on terrain: about one per terrain pixel at the dataset's zoom 15, and at
// most 64 tiles x 33 x 33 vertices. A flat map needs only the corners.
const TERRAIN_SEGMENTS = 32;

export interface GroundOptions {
    box: LatLonBox;
    source: TileSource;
    /** Scene height of the flat ground. */
    groundU: number;
    /** Local scene position (x = North, z = East) of a lat/lon on the ground. */
    toLocal(lat: number, lon: number): { n: number; e: number };
    /** Called whenever a tile finishes loading, so the scene can re-render. */
    onTileLoaded(): void;
    /** Terrain to drape the map over; flat at groundU without. */
    surface?: SurfaceHeight | null;
}

export interface Ground {
    group: Group;
    /**
     * The recorded altitude can pass below the map: a flat map is a reference plane, not terrain,
     * and terrain is coarser than the ground the craft flew over. While the craft is below, the map
     * is drawn see-through so the craft and path stay visible.
     */
    setTranslucent(translucent: boolean): void;
    /** Drape the map over terrain, or lay it flat again (null). */
    setSurface(surface: SurfaceHeight | null): void;
    dispose(): void;
}

/**
 * A tile as a grid of `segments` squares a side. Vertices run west to east, then north to south,
 * so with one segment they are the NW, NE, SW and SE corners.
 */
function tileGeometry(
    x: number,
    y: number,
    z: number,
    segments: number,
    toLocal: GroundOptions["toLocal"],
    height: SurfaceHeight,
): BufferGeometry {
    const positions: number[] = [];
    const uvs: number[] = [];
    const index: number[] = [];
    for (let j = 0; j <= segments; j++) {
        for (let i = 0; i <= segments; i++) {
            const { lon, lat } = tileToLonLat(x + i / segments, y + j / segments, z);
            const { n, e } = toLocal(lat, lon);
            positions.push(n, height(lat, lon), e);
            uvs.push(i / segments, 1 - j / segments);
        }
    }
    const row = segments + 1;
    for (let j = 0; j < segments; j++) {
        for (let i = 0; i < segments; i++) {
            const nw = j * row + i;
            const ne = nw + 1;
            const sw = nw + row;
            const se = sw + 1;
            index.push(nw, sw, ne, ne, sw, se); // wound to face up
        }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
    geometry.setIndex(index);
    return geometry;
}

/**
 * One mesh per tile, each placed by its own corners, so the mosaic lines up with the flight
 * path exactly. Textures come from the browser's HTTP cache on re-open.
 */
export function buildGround(options: GroundOptions): Ground {
    const { box, source, groundU, toLocal, onTileLoaded } = options;
    const z = pickZoom(box, source.maxZoom);
    const range = tileRange(padded(box), z);

    const group = new Group();
    const loader = new TextureLoader().setCrossOrigin("anonymous");
    const textures: Texture[] = [];
    const tiles: { mesh: Mesh; x: number; y: number }[] = [];
    let disposed = false;

    const geometryFor = (x: number, y: number, surface: SurfaceHeight | null | undefined) =>
        surface
            ? tileGeometry(x, y, z, TERRAIN_SEGMENTS, toLocal, surface)
            : tileGeometry(x, y, z, 1, toLocal, () => groundU);

    for (let x = range.x0; x <= range.x1; x++) {
        for (let y = range.y0; y <= range.y1; y++) {
            const material = new MeshBasicMaterial();
            const tile = new Mesh(geometryFor(x, y, options.surface), material);
            tile.renderOrder = 10; // after the path, so a see-through map blends over the part below it
            tile.visible = false; // until its image arrives; a blank tile would still hide what is behind it
            group.add(tile);
            tiles.push({ mesh: tile, x, y });

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
        setSurface(surface) {
            for (const { mesh, x, y } of tiles) {
                mesh.geometry.dispose();
                mesh.geometry = geometryFor(x, y, surface);
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
