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

import type * as Leaflet from "leaflet";
import type { FlightLog, LogFrame } from "./flightlog";
import { useSettingsStore } from "./stores/settings";

// The Leaflet global published by leaflet-global.ts (and patched by the plugins below). It is
// read at runtime rather than imported, so that flight3d/flightScene.ts, which only needs
// ALTITUDE_TRAIL_COLORS from this module, does not pull Leaflet in.
declare const L: typeof Leaflet;

declare module "leaflet" {
    /** What leaflet-marker-rotation adds to the options of a marker. */
    interface RotatedMarkerOptions extends MarkerOptions {
        /** Degrees clockwise. */
        rotationAngle?: number;
        rotationOrigin?: string;
    }

    /** L.rotatedMarker, from leaflet-marker-rotation. */
    class RotatedMarker extends Marker {
        constructor(latlng: LatLngExpression, options?: RotatedMarkerOptions);
        setRotationAngle(newAngle: number): this;
        setRotationOrigin(newOrigin: string): this;
    }
    function rotatedMarker(latlng: LatLngExpression, options?: RotatedMarkerOptions): RotatedMarker;

    /**
     * The options of Leaflet.MultiOptionsPolyline, which ships looser typings of its own
     * (global L, `MarkerOptions`): `optionIdxFn` picks which of `options` styles each segment.
     */
    interface AltitudePolylineOptions extends PolylineOptions {
        multiOptions: {
            optionIdxFn: (
                latLng: AltitudeLatLng,
                prevLatLng: AltitudeLatLng,
                index: number,
                allLatLngs: AltitudeLatLng[],
            ) => number;
            fnContext?: object;
            /** The plugin overwrites each entry with a copy that has the base options merged in. */
            options: PolylineOptions[] | ((index: number) => PolylineOptions);
            copyBaseOptions?: boolean;
        };
    }

    /** L.multiOptionsPolyline, from Leaflet.MultiOptionsPolyline: a polyline whose segments are styled differently. */
    function multiOptionsPolyline(latlngs: AltitudeLatLng[], options: AltitudePolylineOptions): FeatureGroup;

    /** A LatLng whose altitude is known, in metres. */
    type AltitudeLatLng = LatLng & { alt: number };
}

type AltitudeLatLng = Leaflet.AltitudeLatLng;

/** The icon of a marker, and the debug circle drawn under it when `debugCircle` is on. */
interface MapMarker<T extends Leaflet.Marker> {
    icon: T;
    circle?: Leaflet.Circle;
}

/** The trail of one log: the plain polyline, and the one coloured by altitude. */
interface TrailLayers {
    polyline: Leaflet.Polyline;
    polylineC: Leaflet.FeatureGroup;
}

/** frame[index], where `index` is undefined (or null) for a field the log does not have. */
function valueAt(frame: LogFrame, index: number | null | undefined): number | null | undefined {
    return index == null ? undefined : frame[index];
}

/**
 * Flight trail colors from lowest to highest altitude, shared by the 2D map and the 3D view.
 * Mutable: Leaflet.MultiOptionsPolyline merges the polyline options into each entry.
 */
export const ALTITUDE_TRAIL_COLORS: { color: string }[] = [
    { color: "#00ffe0bf" },
    { color: "#00ff8cbf" },
    { color: "#00ff02bf" },
    { color: "#75ff00bf" },
    { color: "#e5ff00bf" },
    { color: "#ffb100bf" },
    { color: "#ff4c00bf" },
    { color: "#ff1414" },
];

export class MapGrapher {
    declare initialize: () => void;
    /** Tears down the Leaflet map so the viewer tab can be re-mounted without leaking it. */
    declare destroy: () => void;
    declare reset: () => void;
    declare setFlightLog: (newFlightLog: FlightLog) => void;
    declare setFlightLogIndexs: () => void;
    /** Every 4th frame with coordinates, and the altitude range over all of them. */
    declare getPolylinesData: () => { latlngs: AltitudeLatLng[]; maxAlt: number; minAlt: number };
    declare createAltitudeColoredPolyline: (
        latlngs: AltitudeLatLng[],
        maxAlt: number,
        minAlt: number,
    ) => Leaflet.FeatureGroup;
    declare updateCurrentPosition: () => void;
    declare redrawAll: () => void;
    declare redrawFlightTrail: () => void;
    declare redrawHomeMarker: () => void;
    declare redrawCraftMarker: () => void;
    declare clearMap: (trailIndex: number | null | undefined) => void;
    declare clearMapFlightTrails: (trailIndex: number | null | undefined) => void;
    declare clearMapMarkers: () => void;
    declare resize: (width: number, height: number) => void;
    /** Null unless the frame has a numeric latitude and longitude; degrees are stored as 1e-7 units. */
    declare getCoordinatesFromFrame: (
        frame: LogFrame,
        latIndex: number | null | undefined,
        lngIndex: number | null | undefined,
        altitudeIndex: number | null | undefined,
    ) => AltitudeLatLng | null;
    declare isNumber: (n: unknown) => n is number;
    declare getGroundCourseFromFrame: (frame: LogFrame, groundCourseIndex: number | null | undefined) => number;
    declare getHomeCoordinatesFromFlightLog: (flightLog: FlightLog) => [number, number];
    declare setCurrentTime: (newTime: number) => void;

    constructor() {
        const { userSettings } = useSettingsStore();
        let myMap: Leaflet.Map | null | undefined;
        let currentLogStartDateTime: string | undefined;
        let currentTime: number | null | undefined;
        let craftPosition: AltitudeLatLng | null | undefined;
        let groundCourse: number | null | undefined;
        let homePosition: [number, number] | null | undefined;
        let craftMarker: MapMarker<Leaflet.RotatedMarker> | null | undefined;
        let homeMarker: MapMarker<Leaflet.Marker> | null | undefined;
        let trailLayers = new Map<number, TrailLayers>();
        let previousLogIndex: number | null | undefined;
        let latIndexAtFrame: number | null | undefined;
        let lngIndexAtFrame: number | null | undefined;
        let altitudeIndexAtFrame: number | null | undefined;
        let groundCourseIndexAtFrame: number | null | undefined;
        let flightLog: FlightLog | undefined;

        // Using either before it is set has always thrown a TypeError, as reading a member of undefined does.
        const getMap = (): Leaflet.Map => {
            if (!myMap) {
                throw new TypeError("The map is not initialized");
            }
            return myMap;
        };
        const getFlightLog = (): FlightLog => {
            if (!flightLog) {
                throw new TypeError("No flight log is set");
            }
            return flightLog;
        };

        const coordinateDivider = 10000000;
        const altitudeDivider = 10;
        const grounCourseDivider = 10;

        const mapOptions = {
            center: [0, 0] as Leaflet.LatLngTuple,
            zoom: 1,
        };

        const craftIcon = L.icon({
            iconUrl: "../images/markers/craft.png",
            iconSize: [30, 30],
            iconAnchor: [15, 15],
            className: "icon",
        });

        const homeIcon = L.icon({
            iconUrl: "../images/markers/home.png",
            iconSize: [40, 40],
            iconAnchor: [20, 35],
            className: "icon",
        });

        const polylineOptions = {
            color: "#2db0e3",
            opacity: 0.8,
            smoothFactor: 1,
        };

        const colorTrailGradient = ALTITUDE_TRAIL_COLORS;

        // debug circles can be used to aligh icons at the correct coordinates
        const debugCircle = false;
        const debugCircleOptions = {
            color: "red",
            fillColor: "red",
            fillOpacity: 0.8,
            radius: 1,
        };

        this.initialize = function () {
            if (myMap) {
                return;
            }

            myMap = L.map("mapContainer", mapOptions);

            L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
                maxZoom: 19,
                minZoom: 1,
                attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            }).addTo(myMap);
        };

        // Tear down the Leaflet map so the viewer tab can be re-mounted without leaking
        // the map instance and its DOM/event handlers.
        this.destroy = function () {
            if (myMap) {
                myMap.remove();
                myMap = null;
            }
            trailLayers = new Map();
            craftMarker = null;
            homeMarker = null;
        };

        this.reset = function () {
            if (!myMap) {
                return;
            }
            this.clearMap(previousLogIndex);
            previousLogIndex = null;
            currentTime = null;
            craftPosition = null;
            groundCourse = null;
            homePosition = null;
            craftMarker = null;
            homeMarker = null;
            trailLayers = new Map();
            previousLogIndex = null;
            latIndexAtFrame = null;
            lngIndexAtFrame = null;
            altitudeIndexAtFrame = null;
            groundCourseIndexAtFrame = null;
            myMap.setView(mapOptions.center, mapOptions.zoom);
        };

        this.setFlightLog = function (newFlightLog) {
            flightLog = newFlightLog;

            const newLogStartDateTime = newFlightLog.getSysConfig()["Log start datetime"];
            if (currentLogStartDateTime !== newLogStartDateTime) {
                this.reset();
                currentLogStartDateTime = newLogStartDateTime;
            }

            const logIndex = newFlightLog.getLogIndex();

            // if this log is already proccesed its skipped
            if (trailLayers.has(logIndex)) {
                return;
            }

            this.setFlightLogIndexs();
            const { latlngs, maxAlt, minAlt } = this.getPolylinesData();

            const hasGpsData = latlngs.length > 0;

            if (hasGpsData) {
                const polyline = L.polyline(latlngs, polylineOptions);

                const polylineC = this.createAltitudeColoredPolyline(latlngs, maxAlt, minAlt);

                trailLayers.set(logIndex, { polyline, polylineC });

                homePosition = this.getHomeCoordinatesFromFlightLog(newFlightLog);
            } else {
                console.debug("FlightLog has no gps data.");
            }

            document.getElementById("mapContainer")?.classList.toggle("no-gps-data", !hasGpsData);
        };

        this.setFlightLogIndexs = function () {
            const flightLog = getFlightLog();
            latIndexAtFrame = flightLog.getMainFieldIndexByName("GPS_coord[0]");
            lngIndexAtFrame = flightLog.getMainFieldIndexByName("GPS_coord[1]");
            altitudeIndexAtFrame = flightLog.getMainFieldIndexByName("GPS_altitude");
            groundCourseIndexAtFrame = flightLog.getMainFieldIndexByName("GPS_ground_course");
        };

        this.getPolylinesData = function () {
            const flightLog = getFlightLog();
            const latlngs: AltitudeLatLng[] = [];
            let maxAlt = Number.MIN_VALUE;
            let minAlt = Number.MAX_VALUE;

            const chunks = flightLog.getChunksInTimeRange(flightLog.getMinTime(), flightLog.getMaxTime());

            let frameCount = 0;
            for (const chunk of chunks) {
                for (const frame of chunk.frames) {
                    const coordinates = this.getCoordinatesFromFrame(
                        frame,
                        latIndexAtFrame,
                        lngIndexAtFrame,
                        altitudeIndexAtFrame,
                    );

                    // if there are no coordinates the frame is skipped
                    if (!coordinates) {
                        frameCount++;
                        continue;
                    }

                    // Altitude max and min values can be obtained from the stats but fixing the index at 4 doesn't seem safe
                    // const maxAlt = flightLog.getStats().frame.G.field[4].max / altitudeDivider;
                    // const minAlt = flightLog.getStats().frame.G.field[4].min / altitudeDivider;
                    maxAlt = Math.max(coordinates.alt, maxAlt);
                    minAlt = Math.min(coordinates.alt, minAlt);

                    // 1/4 of the dots is enough to draw the line
                    if (frameCount % 4 === 0) {
                        latlngs.push(coordinates);
                    }
                    frameCount++;
                }
            }
            return { latlngs, maxAlt, minAlt };
        };

        this.createAltitudeColoredPolyline = function (latlngs, maxAlt, minAlt) {
            const divider = colorTrailGradient.length - 1;

            const delta = maxAlt - minAlt;

            const thresholdIncrement = delta / divider;

            const altThresholds: number[] = [];
            let threshold = minAlt;
            for (let i = 0; i < divider; i++) {
                //amount of colors - min and max that are set
                threshold += thresholdIncrement;
                altThresholds.push(threshold);
            }

            return L.multiOptionsPolyline(latlngs, {
                multiOptions: {
                    optionIdxFn: function (latLng) {
                        for (let i = 0; i < altThresholds.length; i++) {
                            if (latLng.alt <= altThresholds[i]) {
                                return i;
                            }
                        }
                        return altThresholds.length;
                    },
                    options: colorTrailGradient,
                },
                weight: 3,
                lineCap: "butt",
                opacity: 1,
                smoothFactor: 1,
            });
        };

        this.updateCurrentPosition = function () {
            try {
                // An unset time never reaches here: setCurrentTime sets it first. Anything that
                // makes the lookup fail (no log, no frame) lands in the catch below.
                if (currentTime == null) {
                    return;
                }
                const frame = getFlightLog().getCurrentFrameAtTime(currentTime);
                if (!frame || !frame.current) {
                    return;
                }
                craftPosition = this.getCoordinatesFromFrame(
                    frame.current,
                    latIndexAtFrame,
                    lngIndexAtFrame,
                    altitudeIndexAtFrame,
                );
                groundCourse = this.getGroundCourseFromFrame(frame.current, groundCourseIndexAtFrame);
            } catch {
                // Frame coordinates unavailable — skip position update
            }
        };

        this.redrawAll = function () {
            if (trailLayers.size <= 0 || !myMap) {
                return;
            }

            this.redrawFlightTrail();
            this.redrawHomeMarker();
            this.redrawCraftMarker();
        };

        this.redrawFlightTrail = function () {
            // If flightLog has changed redraw flight trail
            const currentLogIndex = getFlightLog().getLogIndex();
            if (previousLogIndex !== currentLogIndex) {
                this.clearMap(previousLogIndex);
                const layers = trailLayers.get(currentLogIndex);
                if (layers) {
                    const polyline = userSettings.mapTrailAltitudeColored ? layers.polylineC : layers.polyline;
                    polyline.addTo(getMap());
                    getMap().fitBounds(polyline.getBounds());
                }

                previousLogIndex = currentLogIndex;
            }
        };

        this.redrawHomeMarker = function () {
            if (homePosition) {
                if (homeMarker) {
                    homeMarker.icon.setLatLng(homePosition).addTo(getMap());

                    // debug circle
                    if (debugCircle) {
                        homeMarker.circle?.setLatLng(homePosition).addTo(getMap());
                    }
                } else {
                    const icon = L.marker(homePosition, {
                        icon: homeIcon,
                    }).addTo(getMap());
                    homeMarker = { icon };

                    // debug circle
                    if (debugCircle) {
                        homeMarker.circle = L.circle(homePosition, debugCircleOptions).addTo(getMap());
                    }
                }
            }
        };

        this.redrawCraftMarker = function () {
            if (craftPosition) {
                if (craftMarker) {
                    craftMarker.icon.setLatLng(craftPosition);
                    craftMarker.icon.setRotationAngle(groundCourse ?? 0).addTo(getMap());
                    // debug circle
                    if (debugCircle) {
                        homeMarker?.circle?.setLatLng(craftPosition).addTo(getMap());
                    }
                } else {
                    const icon = L.rotatedMarker(craftPosition, {
                        icon: craftIcon,
                        rotationAngle: groundCourse ?? 0,
                        rotationOrigin: "center center",
                    }).addTo(getMap());
                    craftMarker = { icon };

                    // debug circle
                    if (debugCircle) {
                        craftMarker.circle = L.circle(craftPosition, debugCircleOptions).addTo(getMap());
                    }
                }
            }
        };

        this.clearMap = function (trailIndex) {
            this.clearMapFlightTrails(trailIndex);
            this.clearMapMarkers();
        };

        this.clearMapFlightTrails = function (trailIndex) {
            // A log index is never null or undefined, so those have no trail.
            const layers = trailIndex == null ? undefined : trailLayers.get(trailIndex);
            if (layers) {
                const { polyline: p, polylineC: pc } = layers;
                if (p) {
                    getMap().removeLayer(p);
                }
                if (pc) {
                    getMap().removeLayer(pc);
                }
            }
        };

        this.clearMapMarkers = function () {
            if (homeMarker) {
                if (getMap().hasLayer(homeMarker.icon)) {
                    getMap().removeLayer(homeMarker.icon);
                }
                if (debugCircle && homeMarker.circle && getMap().hasLayer(homeMarker.circle)) {
                    getMap().removeLayer(homeMarker.circle);
                }
            }
            if (craftMarker) {
                if (getMap().hasLayer(craftMarker.icon)) {
                    getMap().removeLayer(craftMarker.icon);
                }
                if (debugCircle && craftMarker.circle && getMap().hasLayer(craftMarker.circle)) {
                    getMap().removeLayer(craftMarker.circle);
                }
            }
        };

        this.resize = function (width, height) {
            if (!userSettings) {
                return;
            }
            const containerstyle = {
                height: (height * Number.parseInt(userSettings.map.size, 10)) / 100,
                width: (width * Number.parseInt(userSettings.map.size, 10)) / 100,
                left: (width * Number.parseInt(userSettings.map.left, 10)) / 100,
                top: (height * Number.parseInt(userSettings.map.top, 10)) / 100,
            };
            const mapEl = document.getElementById("mapContainer");
            if (mapEl) {
                Object.assign(mapEl.style, {
                    height: `${containerstyle.height}px`,
                    width: `${containerstyle.width}px`,
                    left: `${containerstyle.left}px`,
                    top: `${containerstyle.top}px`,
                });
            }
        };

        this.getCoordinatesFromFrame = function (frame, latIndex, lngIndex, altitudeIndex) {
            const lat = valueAt(frame, latIndex);
            const lng = valueAt(frame, lngIndex);
            // A missing altitude is NaN (null reads as 0), exactly as dividing it has always coerced it.
            const alt = Number(valueAt(frame, altitudeIndex));

            // L.latLng() keeps a numeric altitude, which its typings do not promise.
            return this.isNumber(lat) && this.isNumber(lng)
                ? (L.latLng(lat / coordinateDivider, lng / coordinateDivider, alt / altitudeDivider) as AltitudeLatLng)
                : null;
        };

        this.isNumber = function (n): n is number {
            return typeof n === "number" && !Number.isNaN(n);
        };

        this.getGroundCourseFromFrame = function (frame, groundCourseIndex) {
            const gc = valueAt(frame, groundCourseIndex);
            return typeof gc === "number" ? gc / grounCourseDivider : 0;
        };

        this.getHomeCoordinatesFromFlightLog = function (flightLog) {
            const homeFrames = flightLog.getStats().frame.H;
            if (!homeFrames) {
                throw new TypeError("The log has no home frames");
            }
            const home = homeFrames.field;
            return [home[0].min / coordinateDivider, home[1].min / coordinateDivider];
        };

        this.setCurrentTime = function (newTime) {
            currentTime = newTime;
            this.updateCurrentPosition();
            this.redrawAll();
        };
    }
}
