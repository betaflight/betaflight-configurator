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
    DoubleSide,
    Float32BufferAttribute,
    Mesh,
    MeshLambertMaterial,
    ShapeUtils,
    Vector2,
} from "three";
import MVT from "ol/format/MVT";
import { inflateEnds } from "ol/geom/flat/orient";
import { padded, tileRange, tileToLonLat, type LatLonBox, type SurfaceHeight } from "./tileGround";

/**
 * OpenStreetMap buildings for the 3D flight view, as vector tiles from OpenFreeMap: free, with no
 * account or key, and open to cross-origin reads. Its TileJSON names the current data release.
 */
export const BUILDINGS_SOURCE = {
    tileJsonUrl: "https://tiles.openfreemap.org/planet",
    /** The deepest zoom the tiles are made at; it holds every building. */
    zoom: 14,
    // With the OpenStreetMap credit, which the panel shows once for map and buildings alike.
    attribution: "Buildings: OpenFreeMap © OpenMapTiles",
    attributionUrl: "https://openfreemap.org",
};

// A zoom-14 tile is 1-2.4 km wide and a city tile can be several hundred KB, so a long flight
// loads only the tiles it passes over, and at most this many.
export const MAX_BUILDING_TILES = 16;

const BUILDING_COLOR = 0xd9d4ca;

export interface LatLon {
    lat: number;
    lon: number;
}

/** One building (or building part): its outline, then any holes, and its heights in meters. */
export interface Footprint {
    rings: LatLon[][];
    /** Top above the ground. */
    height: number;
    /** Bottom above the ground: above 0 for a part that overhangs, like a bridge between towers. */
    minHeight: number;
}

/** Fetch one vector tile; null when the data has no tile there. */
export type VectorTileLoader = (url: string, signal: AbortSignal) => Promise<ArrayBuffer | null>;

export const fetchVectorTile: VectorTileLoader = async (url, signal) => {
    const response = await fetch(url, { signal });
    if (response.status === 204 || response.status === 404) {
        return null;
    }
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    return response.arrayBuffer();
};

let tileUrl: Promise<string> | null = null;

/** The tile URL template of the current data release, looked up once per session. */
function buildingTileUrl(signal: AbortSignal): Promise<string> {
    tileUrl ??= fetch(BUILDINGS_SOURCE.tileJsonUrl, { signal })
        .then((response) => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return response.json();
        })
        .then((tileJson: { tiles?: string[] }) => {
            const url = tileJson.tiles?.[0];
            if (!url) {
                throw new Error("No tiles in TileJSON");
            }
            return url;
        });
    // A failed lookup (offline, aborted) is tried again next time.
    tileUrl.catch(() => (tileUrl = null));
    return tileUrl;
}

/** The buildings in one tile, read from its "building" layer. */
export function readBuildingTile(data: ArrayBuffer, x: number, y: number, z: number): Footprint[] {
    const format = new MVT({ layers: ["building"] });
    const features = format.readFeatures(data);
    const size = format.readProjection(data)?.getExtent()?.[2] || 4096;
    const footprints: Footprint[] = [];
    for (const feature of features) {
        const ends = feature.getEnds();
        if (feature.getType() !== "Polygon" || !ends) {
            continue;
        }
        const height = Number(feature.get("render_height")) || 0;
        const minHeight = Number(feature.get("render_min_height")) || 0;
        if (feature.get("hide_3d") || height <= minHeight) {
            continue;
        }
        const flat = feature.getFlatCoordinates();
        // One feature can hold several outlines, each followed by its holes.
        for (const polygonEnds of inflateEnds(flat, ends)) {
            const rings: LatLon[][] = [];
            let start = startOf(polygonEnds, ends);
            for (const end of polygonEnds) {
                const ring: LatLon[] = [];
                // The last point repeats the first.
                for (let i = start; i < end - 2; i += 2) {
                    const { lon, lat } = tileToLonLat(x + flat[i] / size, y + flat[i + 1] / size, z);
                    ring.push({ lat, lon });
                }
                if (ring.length >= 3) {
                    rings.push(ring);
                }
                start = end;
            }
            if (rings.length > 0) {
                footprints.push({ rings, height, minHeight });
            }
        }
    }
    return footprints;
}

/** Where the first ring of a polygon starts: the end of the ring before it, or 0. */
function startOf(polygonEnds: number[], ends: number[]): number {
    const i = ends.indexOf(polygonEnds[0]);
    return i > 0 ? ends[i - 1] : 0;
}

/**
 * The tiles to load: all in the padded flight area when that is within MAX_BUILDING_TILES,
 * otherwise those the path passes over, in flight order.
 */
export function buildingTiles(box: LatLonBox, path: LatLon[]): { x: number; y: number }[] {
    const z = BUILDINGS_SOURCE.zoom;
    const range = tileRange(padded(box), z);
    if ((range.x1 - range.x0 + 1) * (range.y1 - range.y0 + 1) <= MAX_BUILDING_TILES) {
        const tiles = [];
        for (let x = range.x0; x <= range.x1; x++) {
            for (let y = range.y0; y <= range.y1; y++) {
                tiles.push({ x, y });
            }
        }
        return tiles;
    }
    const seen = new Set<string>();
    const tiles = [];
    for (const { lat, lon } of path) {
        const t = tileRange({ minLat: lat, maxLat: lat, minLon: lon, maxLon: lon }, z);
        const key = `${t.x0},${t.y0}`;
        if (!seen.has(key)) {
            seen.add(key);
            tiles.push({ x: t.x0, y: t.y0 });
            if (tiles.length === MAX_BUILDING_TILES) {
                break;
            }
        }
    }
    return tiles;
}

/**
 * Load the buildings around a flight, keeping those that start inside the padded flight area. A
 * tile that fails is left out; if every tile fails, or the data release cannot be looked up, this
 * rejects, as does aborting.
 */
export async function loadBuildings(
    box: LatLonBox,
    path: LatLon[],
    signal: AbortSignal,
    loadTile: VectorTileLoader = fetchVectorTile,
    tileUrlTemplate: (signal: AbortSignal) => Promise<string> = buildingTileUrl,
): Promise<Footprint[]> {
    const template = await tileUrlTemplate(signal);
    const z = BUILDINGS_SOURCE.zoom;
    const area = padded(box);
    const inside = ({ lat, lon }: LatLon) =>
        lat >= area.minLat && lat <= area.maxLat && lon >= area.minLon && lon <= area.maxLon;
    const tiles = buildingTiles(box, path);
    let failed = 0;
    const perTile = await Promise.all(
        tiles.map(({ x, y }) => {
            const url = template.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
            return loadTile(url, signal).then(
                (data) => (data ? readBuildingTile(data, x, y, z) : []),
                () => {
                    failed++;
                    return [];
                },
            );
        }),
    );
    signal.throwIfAborted();
    if (tiles.length > 0 && failed === tiles.length) {
        throw new Error("No building tiles loaded");
    }
    return perTile.flat().filter((footprint) => inside(footprint.rings[0][0]));
}

/**
 * The buildings as one lit mesh, each standing on the lowest ground under its outline so none
 * floats on a slope. `toLocal` gives scene North (x) and East (z).
 */
export function buildingsMesh(
    footprints: Footprint[],
    toLocal: (lat: number, lon: number) => { n: number; e: number },
    surface: SurfaceHeight,
): Mesh {
    const positions: number[] = [];
    for (const { rings, height, minHeight } of footprints) {
        const local = rings.map((ring) => ring.map(({ lat, lon }) => toLocal(lat, lon)));
        let base = Infinity;
        for (const { lat, lon } of rings[0]) {
            base = Math.min(base, surface(lat, lon));
        }
        const bottom = base + minHeight;
        const top = base + height;

        for (const ring of local) {
            for (let i = 0; i < ring.length; i++) {
                const a = ring[i];
                const b = ring[(i + 1) % ring.length];
                positions.push(a.n, bottom, a.e, b.n, bottom, b.e, b.n, top, b.e);
                positions.push(a.n, bottom, a.e, b.n, top, b.e, a.n, top, a.e);
            }
        }

        const [outline, ...holes] = local.map((ring) => ring.map(({ n, e }) => new Vector2(n, e)));
        const roofPoints = [outline, ...holes].flat();
        for (const triangle of ShapeUtils.triangulateShape(outline, holes)) {
            for (const k of triangle) {
                positions.push(roofPoints[k].x, top, roofPoints[k].y);
            }
        }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    // Unindexed, so each face keeps its own flat normal. Two-sided, as OSM outlines run either way.
    geometry.computeVertexNormals();
    return new Mesh(geometry, new MeshLambertMaterial({ color: BUILDING_COLOR, side: DoubleSide }));
}
