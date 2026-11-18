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

import { lonLatToTile, padded, pickZoom, tileRange, type LatLonBox } from "./tileGround";

/**
 * Terrain heights for the 3D flight view, from the AWS Terrain Tiles open dataset (Mapzen's
 * "Terrarium" PNG encoding). No account or key is needed and the bucket allows cross-origin reads.
 * Each source region has its own credit; see ATTRIBUTION_URL.
 */
export const TERRAIN_SOURCE = {
    url: "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
    maxZoom: 15,
    attribution: "Terrain: Mapzen, USGS, Copernicus and others",
    attributionUrl: "https://github.com/tilezen/joerd/blob/master/docs/attribution.md",
};

const TILE_SIZE = 256;

/** Heights in meters, row-major from the tile's north-west pixel. */
export type ElevationTile = Float32Array;

/**
 * Terrarium encodes meters above sea level as R * 256 + G + B / 256 - 32768. Below sea level is
 * clamped to 0: the dataset holds the seabed, and a flight over water should see the surface.
 * Land below sea level (polders, the Dead Sea) is rare, and only its depth below 0 is lost.
 */
export function decodeTerrarium(rgba: ArrayLike<number>): ElevationTile {
    const heights = new Float32Array(rgba.length / 4);
    for (let i = 0; i < heights.length; i++) {
        const meters = rgba[i * 4] * 256 + rgba[i * 4 + 1] + rgba[i * 4 + 2] / 256 - 32768;
        heights[i] = Math.max(0, meters);
    }
    return heights;
}

/** Ground height at any point covered by the loaded tiles, bilinear between pixel centres. */
export class ElevationModel {
    constructor(
        readonly zoom: number,
        private readonly tiles: Map<string, ElevationTile>,
    ) {}

    get tileCount(): number {
        return this.tiles.size;
    }

    /** Meters above sea level, or null where no tile loaded. */
    elevationAt(lat: number, lon: number): number | null {
        const t = lonLatToTile(lon, lat, this.zoom);
        const px = t.x * TILE_SIZE - 0.5;
        const py = t.y * TILE_SIZE - 0.5;
        const x0 = Math.floor(px);
        const y0 = Math.floor(py);
        const fx = px - x0;
        const fy = py - y0;
        // A missing neighbour tile drops out of the average instead of pulling the edge to 0.
        let sum = 0;
        let weight = 0;
        for (const [dx, dy, w] of [
            [0, 0, (1 - fx) * (1 - fy)],
            [1, 0, fx * (1 - fy)],
            [0, 1, (1 - fx) * fy],
            [1, 1, fx * fy],
        ]) {
            const height = this.pixel(x0 + dx, y0 + dy);
            if (height !== null && w > 0) {
                sum += height * w;
                weight += w;
            }
        }
        if (weight > 0) {
            return sum / weight;
        }
        // Exactly on a pixel centre whose tile is missing: nothing to weigh.
        return this.pixel(Math.round(px), Math.round(py));
    }

    private pixel(gx: number, gy: number): number | null {
        const tx = Math.floor(gx / TILE_SIZE);
        const ty = Math.floor(gy / TILE_SIZE);
        const tile = this.tiles.get(`${tx},${ty}`);
        if (!tile) {
            return null;
        }
        return tile[(gy - ty * TILE_SIZE) * TILE_SIZE + (gx - tx * TILE_SIZE)];
    }
}

export type TerrainTileLoader = (url: string, signal: AbortSignal) => Promise<ElevationTile>;

/** Fetch one Terrarium PNG and decode its pixels through a canvas. */
export const fetchTerrariumTile: TerrainTileLoader = async (url, signal) => {
    const response = await fetch(url, { signal });
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    const bitmap = await createImageBitmap(await response.blob());
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
        throw new Error("No 2D canvas");
    }
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    return decodeTerrarium(context.getImageData(0, 0, canvas.width, canvas.height).data);
};

/**
 * Load the terrain under a flight: the same padded area and tile budget as the map, at the
 * dataset's deepest zoom at most. A tile that fails is left out; aborting rejects.
 */
export async function loadElevation(
    box: LatLonBox,
    signal: AbortSignal,
    loadTile: TerrainTileLoader = fetchTerrariumTile,
): Promise<ElevationModel> {
    const zoom = pickZoom(box, TERRAIN_SOURCE.maxZoom);
    const range = tileRange(padded(box), zoom);
    const tiles = new Map<string, ElevationTile>();
    const requests: Promise<void>[] = [];
    for (let x = range.x0; x <= range.x1; x++) {
        for (let y = range.y0; y <= range.y1; y++) {
            const url = TERRAIN_SOURCE.url
                .replace("{z}", String(zoom))
                .replace("{x}", String(x))
                .replace("{y}", String(y));
            requests.push(
                loadTile(url, signal).then(
                    (tile) => {
                        if (tile.length === TILE_SIZE * TILE_SIZE) {
                            tiles.set(`${x},${y}`, tile);
                        }
                    },
                    () => {},
                ),
            );
        }
    }
    await Promise.all(requests);
    signal.throwIfAborted();
    return new ElevationModel(zoom, tiles);
}

// WGS84, for the inverse of the scene's local frame.
const SEMIMAJOR = 6378137;
const ECC2 = (1 / 298.257223563) * (2 - 1 / 298.257223563);

/**
 * Latitude/longitude of a local scene position (meters North and East of `origin`). The ellipsoid's
 * radii at the origin give a first guess, about a meter off 5 km out and a hundred at 50 km as the
 * scene's flat frame and the curved earth part; each step through `toLocal`, the scene's own
 * frame, corrects most of what is left.
 */
export function localToLatLon(
    origin: { lat: number; lon: number },
    n: number,
    e: number,
    toLocal?: (lat: number, lon: number) => { n: number; e: number },
): { lat: number; lon: number } {
    const lat0 = (origin.lat * Math.PI) / 180;
    const w = 1 - ECC2 * Math.sin(lat0) ** 2;
    const degPerN = 180 / Math.PI / ((SEMIMAJOR * (1 - ECC2)) / w ** 1.5);
    const degPerE = 180 / Math.PI / ((SEMIMAJOR / Math.sqrt(w)) * Math.cos(lat0));
    let lat = origin.lat + n * degPerN;
    let lon = origin.lon + e * degPerE;
    if (toLocal) {
        for (let step = 0; step < 2; step++) {
            const back = toLocal(lat, lon);
            lat += (n - back.n) * degPerN;
            lon += (e - back.e) * degPerE;
        }
    }
    return { lat, lon };
}
