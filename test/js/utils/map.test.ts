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

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { toLonLat } from "ol/proj";
import { initMap, type MapLayer } from "../../../src/js/utils/map";

const instances: Array<ReturnType<typeof initMap>> = [];

beforeAll(() => {
    // OpenLayers watches its target's size; jsdom has no ResizeObserver, and no layout to observe.
    vi.stubGlobal(
        "ResizeObserver",
        class {
            observe() {}
            unobserve() {}
            disconnect() {}
        },
    );
});

function createMap(options: Parameters<typeof initMap>[0] = {}) {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const instance = initMap({ target, ...options });
    instances.push(instance);
    return instance;
}

afterEach(() => {
    instances.splice(0).forEach((instance) => instance.destroy());
    document.body.innerHTML = "";
});

describe("initMap", () => {
    it.each<MapLayer>(["street", "satellite", "hybrid"])("shows only the %s layer when it is the default", (layer) => {
        const { layers } = createMap({ defaultLayer: layer });

        for (const [key, tile] of Object.entries(layers)) {
            expect(tile.getVisible()).toBe(key === layer);
        }
    });

    it("defaults to satellite at zoom 17 over 0,0", () => {
        const { layers, mapView } = createMap();

        expect(layers.satellite.getVisible()).toBe(true);
        expect(mapView.getZoom()).toBe(17);
        expect(toLonLat(mapView.getCenter()!)).toEqual([0, 0]);
    });

    it("centres the view and the position marker on the given location", () => {
        const { mapView, iconGeometry, iconFeature, iconStyleGPS } = createMap({
            defaultLat: 52.5,
            defaultLon: 4.75,
            defaultZoom: 13,
        });

        const [lon, lat] = toLonLat(mapView.getCenter()!);
        expect(lon).toBeCloseTo(4.75, 9);
        expect(lat).toBeCloseTo(52.5, 9);
        expect(iconGeometry.getCoordinates()).toEqual(mapView.getCenter());
        expect(mapView.getZoom()).toBe(13);
        expect(iconFeature.getStyle()).toBe(iconStyleGPS);
    });

    it("adds the position layer above the three base layers", () => {
        const { map, layers, iconFeature } = createMap();
        const all = map.getLayers().getArray();

        expect(all.slice(0, 3)).toEqual([layers.street, layers.satellite, layers.hybrid]);
        expect(all).toHaveLength(4);
        const positionSource = (all[3] as unknown as { getSource(): { getFeatures(): unknown[] } }).getSource();
        expect(positionSource.getFeatures()).toEqual([iconFeature]);
    });

    it("clears the marker, removes every layer and disposes their sources on destroy", () => {
        const instance = createMap();
        const layers = instance.map.getLayers().getArray() as unknown as Array<{
            getSource(): { dispose(): void; getFeatures?(): unknown[] };
        }>;
        const sources = layers.map((layer) => layer.getSource());
        const disposals = sources.map((source) => vi.spyOn(source, "dispose"));
        const positionSource = sources[3];

        instance.destroy();
        instances.splice(instances.indexOf(instance), 1);

        expect(instance.map.getLayers().getLength()).toBe(0);
        disposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
        expect(positionSource.getFeatures?.()).toEqual([]);
    });
});
