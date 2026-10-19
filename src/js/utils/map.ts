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

import { View, Map, Feature } from "ol";
import { fromLonLat } from "ol/proj";
import { Tile, Vector as LayerVector } from "ol/layer";
import { OSM, XYZ, Vector as SourceVector } from "ol/source";
import { Icon, Style } from "ol/style";
import { Point } from "ol/geom";
import type Layer from "ol/layer/Layer";

const DEFAULT_ZOOM = 17;
const DEFAULT_LON = 0;
const DEFAULT_LAT = 0;
const ICON_IMAGE_GPS = "/images/icons/cf_icon_position.png";
const ICON_IMAGE_MAG = "/images/icons/cf_icon_position_mag.png";
const ICON_IMAGE_NOFIX = "/images/icons/cf_icon_position_nofix.png";

/** The base layers initMap() creates; exactly one is visible at a time. */
export type MapLayer = "street" | "satellite" | "hybrid";

export interface MapOptions {
    /** The element, or its id, to render into. */
    target?: string | HTMLElement;
    defaultZoom?: number;
    defaultLon?: number;
    defaultLat?: number;
    defaultLayer?: MapLayer;
}

/**
 * Create and configure an OpenLayers map instance for the GPS tab.
 * UI bindings (layer selection, fullscreen, zoom buttons) are handled by the Vue component.
 */
export function initMap(options: MapOptions = {}) {
    const {
        target = "map",
        defaultZoom = DEFAULT_ZOOM,
        defaultLon = DEFAULT_LON,
        defaultLat = DEFAULT_LAT,
        defaultLayer = "satellite",
    } = options;

    const lonLat = fromLonLat([defaultLon, defaultLat]);

    const mapView = new View({
        center: lonLat,
        zoom: defaultZoom,
    });

    const devicePixelRatio = window.devicePixelRatio || 1;

    const layers: Record<MapLayer, Tile> = {
        street: new Tile({
            // OSM serves 256px tiles only, so unlike XYZ it takes no tilePixelRatio.
            source: new OSM(),
            visible: defaultLayer === "street",
        }),
        satellite: new Tile({
            source: new XYZ({
                url: "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
                tilePixelRatio: devicePixelRatio,
            }),
            visible: defaultLayer === "satellite",
        }),
        hybrid: new Tile({
            source: new XYZ({
                url: "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
                tilePixelRatio: devicePixelRatio,
            }),
            visible: defaultLayer === "hybrid",
        }),
    };

    const map = new Map({
        target,
        layers: [layers.street, layers.satellite, layers.hybrid],
        view: mapView,
        controls: [],
    });

    const iconGPS = new Icon({
        anchor: [0.5, 1],
        opacity: 1,
        scale: 0.5,
        src: ICON_IMAGE_GPS,
    });

    const iconMag = new Icon({
        anchor: [0.5, 1],
        opacity: 1,
        scale: 0.5,
        src: ICON_IMAGE_MAG,
    });

    const iconNoFix = new Icon({
        anchor: [0.5, 1],
        opacity: 1,
        scale: 0.5,
        src: ICON_IMAGE_NOFIX,
    });

    const iconStyleGPS = new Style({
        image: iconGPS,
    });

    const iconStyleMag = new Style({
        image: iconMag,
    });

    const iconStyleNoFix = new Style({
        image: iconNoFix,
    });

    const iconGeometry = new Point(lonLat);

    const iconFeature = new Feature({
        geometry: iconGeometry,
    });

    iconFeature.setStyle(iconStyleGPS);

    const vectorSource = new SourceVector({
        features: [iconFeature],
    });

    const currentPositionLayer = new LayerVector({
        source: vectorSource,
    });

    map.addLayer(currentPositionLayer);

    const destroy = () => {
        // Clear vector source features
        vectorSource.clear();

        // Get all layers and dispose of them
        const allLayers = map.getLayers().getArray().slice(); // Clone array to avoid mutation during iteration
        allLayers.forEach((layer) => {
            map.removeLayer(layer);
            // Dispose of layer's source if it exists. Callers only add tile and vector layers,
            // never a group, so every layer here has a source.
            const source = (layer as Layer).getSource();
            if (source && typeof source.dispose === "function") {
                source.dispose();
            }
        });

        // Dispose of the map (handles view, interactions, event listeners, controls, etc.)
        map.dispose();
    };

    return {
        map,
        mapView,
        layers,
        iconStyleMag,
        iconStyleGPS,
        iconStyleNoFix,
        iconFeature,
        iconGeometry,
        destroy,
    };
}
