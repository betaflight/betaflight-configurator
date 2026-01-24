<template>
    <div class="gui_box grey flight-plan-map">
        <div class="gui_box_titlebar">
            <div class="spacer_box_title" v-html="$t('flightPlanMap')"></div>
        </div>
        <div class="spacer_box">
            <div class="map-container">
                <div ref="mapRef" class="map"></div>
                <div v-if="isLoading" class="map-loading">
                    <div class="loading-message">
                        {{ $t("flightPlanLoading") }}
                    </div>
                </div>
            </div>
            <div class="map-instructions">
                <p v-html="$t('flightPlanMapInstructions')"></p>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from "vue";
import { initMap } from "@/js/utils/map";
import { fromLonLat, toLonLat } from "ol/proj";
import { Feature } from "ol";
import { Point, LineString } from "ol/geom";
import { Vector as LayerVector } from "ol/layer";
import { Vector as SourceVector } from "ol/source";
import { Style, Stroke, Circle, Fill, Text } from "ol/style";
import { DragPan } from "ol/interaction";
import { useFlightPlan } from "@/composables/useFlightPlan";

const { waypoints, sortedWaypoints, selectedWaypointUid, selectWaypoint, addWaypointAtLocation, updateWaypoint } =
    useFlightPlan();

const mapRef = ref(null);
const mapInstance = ref(null);
const waypointLayer = ref(null);
const pathLayer = ref(null);
const draggingWaypointUid = ref(null);
const dragPanInteraction = ref(null);
const isDragging = ref(false);
const dragStartCoordinate = ref(null);
const isLoading = ref(true);

// Initialize map and layers
onMounted(() => {
    if (!mapRef.value) {
        console.error("Map ref not available");
        return;
    }

    // Get user's location and initialize map
    // Zoom level 15 shows approximately 1 nautical mile (1852m) in view
    const defaultZoom = 15;
    const fallbackLat = 0;
    const fallbackLon = 0;

    // Try to get user's geolocation
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                console.log("User location obtained:", latitude, longitude);

                // Initialize map at user's location
                mapInstance.value = initMap({
                    target: mapRef.value,
                    defaultZoom: defaultZoom,
                    defaultLat: latitude,
                    defaultLon: longitude,
                    defaultLayer: "satellite",
                });

                console.log("Map initialized at user location");
                setupMapLayers();
            },
            (error) => {
                console.warn("Geolocation failed, using fallback:", error.message);

                // Initialize map at fallback location
                mapInstance.value = initMap({
                    target: mapRef.value,
                    defaultZoom: defaultZoom,
                    defaultLat: fallbackLat,
                    defaultLon: fallbackLon,
                    defaultLayer: "satellite",
                });

                console.log("Map initialized at fallback location");
                setupMapLayers();
            },
            {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 0,
            },
        );
    } else {
        console.warn("Geolocation not supported, using fallback");

        // Initialize map at fallback location
        mapInstance.value = initMap({
            target: mapRef.value,
            defaultZoom: defaultZoom,
            defaultLat: fallbackLat,
            defaultLon: fallbackLon,
            defaultLayer: "satellite",
        });

        console.log("Map initialized at fallback location");
        setupMapLayers();
    }
});

// Setup map layers and event handlers
const setupMapLayers = () => {
    if (!mapInstance.value) {
        console.error("Map instance not available");
        return;
    }

    // Create path line layer (magenta line) - add first so it renders behind waypoints
    pathLayer.value = new LayerVector({
        source: new SourceVector(),
        style: new Style({
            stroke: new Stroke({
                color: "#FF00FF", // Magenta
                width: 3,
            }),
        }),
    });
    mapInstance.value.map.addLayer(pathLayer.value);

    // Create waypoint marker layer with numbered circles - add second so it renders on top
    waypointLayer.value = new LayerVector({
        source: new SourceVector(),
    });
    mapInstance.value.map.addLayer(waypointLayer.value);

    // Get reference to the default DragPan interaction
    mapInstance.value.map.getInteractions().forEach((interaction) => {
        if (interaction instanceof DragPan) {
            dragPanInteraction.value = interaction;
        }
    });

    // Manual drag handling using pointer events
    // Handle pointer down - start dragging
    mapInstance.value.map.on("pointerdown", (event) => {
        const feature = mapInstance.value.map.forEachFeatureAtPixel(event.pixel, (feat) => feat, {
            layerFilter: (layer) => layer === waypointLayer.value,
        });

        if (feature) {
            const waypointUid = feature.get("waypointUid");
            if (waypointUid) {
                // Prevent default map dragging
                event.preventDefault();

                // Start dragging this waypoint
                isDragging.value = true;
                draggingWaypointUid.value = waypointUid;
                dragStartCoordinate.value = event.coordinate;

                // Disable map panning
                if (dragPanInteraction.value) {
                    dragPanInteraction.value.setActive(false);
                }

                console.log("Started dragging waypoint:", waypointUid);
            }
        }
    });

    // Handle pointer move - update waypoint position during drag
    mapInstance.value.map.on("pointermove", (event) => {
        if (isDragging.value && draggingWaypointUid.value) {
            // Update the feature position in real-time
            const waypointSource = waypointLayer.value.getSource();
            const features = waypointSource.getFeatures();
            const feature = features.find((f) => f.get("waypointUid") === draggingWaypointUid.value);

            if (feature) {
                // Update feature geometry
                feature.getGeometry().setCoordinates(event.coordinate);

                // Update path in real-time
                updatePathDuringDrag(draggingWaypointUid.value, event.coordinate);
            }
        } else {
            // Update cursor when hovering over waypoints
            const hit = mapInstance.value.map.hasFeatureAtPixel(event.pixel, {
                layerFilter: (layer) => layer === waypointLayer.value,
            });
            mapInstance.value.map.getTargetElement().style.cursor = hit ? "move" : "";
        }
    });

    // Handle pointer up - end dragging
    mapInstance.value.map.on("pointerup", (event) => {
        if (isDragging.value && draggingWaypointUid.value) {
            // Check if we actually moved
            const movedDistance = Math.sqrt(
                Math.pow(event.coordinate[0] - dragStartCoordinate.value[0], 2) +
                    Math.pow(event.coordinate[1] - dragStartCoordinate.value[1], 2),
            );

            if (movedDistance > 1) {
                // Moved more than 1 pixel - any movement counts as drag
                // Get final coordinates
                const coords = toLonLat(event.coordinate);
                const latitude = coords[1];
                const longitude = coords[0];

                console.log("Waypoint dragged to:", latitude, longitude);

                // Update waypoint in state
                updateWaypoint(draggingWaypointUid.value, {
                    latitude,
                    longitude,
                });
            } else {
                // It was just a click - select the waypoint
                console.log("Waypoint clicked (not dragged):", draggingWaypointUid.value);
                selectWaypoint(draggingWaypointUid.value);

                // Reset the feature position since we didn't actually drag
                updateMapFeatures(false); // Don't auto-fit on click
            }

            // Clean up dragging state
            isDragging.value = false;
            draggingWaypointUid.value = null;
            dragStartCoordinate.value = null;

            // Re-enable map panning
            if (dragPanInteraction.value) {
                dragPanInteraction.value.setActive(true);
            }
        }
    });

    // Click handler - add new waypoint when clicking on empty map
    mapInstance.value.map.on("click", (event) => {
        // Don't add waypoint if we were dragging
        if (isDragging.value) {
            return;
        }

        // Check if a waypoint marker was clicked
        const waypointClicked = mapInstance.value.map.hasFeatureAtPixel(event.pixel, {
            layerFilter: (layer) => layer === waypointLayer.value,
        });

        // Only add new waypoint if clicking on empty map (not on a waypoint)
        if (!waypointClicked) {
            const coords = toLonLat(event.coordinate);
            const latitude = coords[1];
            const longitude = coords[0];

            console.log("Map clicked at:", latitude, longitude);
            addWaypointAtLocation(latitude, longitude);
        }
    });

    // Initial map update
    updateMapFeatures();

    // Map is now ready
    isLoading.value = false;
};

// Update path lines during drag in real-time
const updatePathDuringDrag = (draggingUid, newCoordinates) => {
    if (!pathLayer.value) {
        return;
    }

    const pathSource = pathLayer.value.getSource();
    pathSource.clear();

    // Build coordinates array with the updated position for the dragging waypoint
    const coordinates = [];
    sortedWaypoints.value.forEach((wp) => {
        let coord;
        if (wp.uid === draggingUid) {
            // Use the current dragged position
            coord = newCoordinates;
        } else {
            // Use the stored position
            coord = fromLonLat([wp.longitude, wp.latitude]);
        }
        coordinates.push(coord);
    });

    // Draw magenta line connecting waypoints
    if (coordinates.length > 1) {
        const lineFeature = new Feature({
            geometry: new LineString(coordinates),
        });
        pathSource.addFeature(lineFeature);
    }
};

// Update map features when waypoints change
const updateMapFeatures = (autoFit = true) => {
    if (!waypointLayer.value || !pathLayer.value) {
        console.log("Layers not ready yet");
        return;
    }

    const waypointSource = waypointLayer.value.getSource();
    const pathSource = pathLayer.value.getSource();

    // Clear existing features
    waypointSource.clear();
    pathSource.clear();

    const sorted = sortedWaypoints.value;

    if (!sorted.length) {
        console.log("No waypoints to display");
        return;
    }

    console.log(`Updating map with ${sorted.length} waypoints`);

    // Add markers for each waypoint with order numbers
    const coordinates = [];
    sorted.forEach((wp) => {
        const coord = fromLonLat([wp.longitude, wp.latitude]);
        coordinates.push(coord);

        // Create numbered marker
        const feature = new Feature({
            geometry: new Point(coord),
            waypointUid: wp.uid,
            waypointOrder: wp.order + 1,
        });

        // Check if this waypoint is selected or being dragged
        const isSelected = selectedWaypointUid.value === wp.uid;
        const isDragging = draggingWaypointUid.value === wp.uid;

        // Determine color: green for dragging, orange for selected, blue for normal
        let fillColor = "#0080FF"; // Blue for normal
        let radius = 10;
        let strokeWidth = 2;
        let fontSize = "bold 12px sans-serif";

        if (isDragging) {
            fillColor = "#00FF00"; // Green for dragging
            radius = 16;
            strokeWidth = 3;
            fontSize = "bold 14px sans-serif";
        } else if (isSelected) {
            fillColor = "#FF8C00"; // Orange for selected
            radius = 14;
            strokeWidth = 3;
            fontSize = "bold 13px sans-serif";
        }

        // Style with numbered circle
        feature.setStyle(
            new Style({
                image: new Circle({
                    radius: radius,
                    fill: new Fill({
                        color: fillColor,
                    }),
                    stroke: new Stroke({
                        color: "#FFFFFF",
                        width: strokeWidth,
                    }),
                }),
                text: new Text({
                    text: String(wp.order + 1),
                    fill: new Fill({
                        color: "#FFFFFF",
                    }),
                    font: fontSize,
                }),
            }),
        );

        waypointSource.addFeature(feature);
    });

    // Draw magenta line connecting waypoints in order
    if (coordinates.length > 1) {
        const lineFeature = new Feature({
            geometry: new LineString(coordinates),
        });
        pathSource.addFeature(lineFeature);
        console.log(`Drew path line connecting ${coordinates.length} waypoints`);
    }

    // Auto-fit map to show all waypoints (only if requested)
    if (autoFit && coordinates.length > 0) {
        const extent = waypointSource.getExtent();
        mapInstance.value.mapView.fit(extent, {
            padding: [50, 50, 50, 50],
            maxZoom: 15,
            duration: 500,
        });
        console.log("Map fitted to waypoints");
    }
};

// Watch waypoints and update map
watch(() => waypoints.value, updateMapFeatures, { deep: true });

// Watch dragging state and update map to show green marker
watch(
    () => draggingWaypointUid.value,
    (newUid) => {
        if (!mapInstance.value) {
            return;
        }
        // Update map features to show dragging styling (green marker) when drag starts
        // When newUid is null (drag ended), updateMapFeatures will be called by the update handlers
        if (newUid) {
            updateMapFeatures(false); // Don't auto-fit when starting to drag
        }
    },
);

// Watch selected waypoint and update map focus
watch(
    () => selectedWaypointUid.value,
    (selectedUid) => {
        if (!mapInstance.value || !selectedUid) {
            return;
        }

        // Update map features to show selection styling (don't auto-fit)
        updateMapFeatures(false);

        // Find the selected waypoint and pan to it
        const selectedWaypoint = sortedWaypoints.value.find((wp) => wp.uid === selectedUid);
        if (selectedWaypoint) {
            const coord = fromLonLat([selectedWaypoint.longitude, selectedWaypoint.latitude]);

            // Smoothly animate to the selected waypoint
            mapInstance.value.mapView.animate({
                center: coord,
                duration: 500,
            });

            console.log("Map centered on selected waypoint:", selectedWaypoint.order + 1);
        }
    },
);

// Cleanup on unmount
onUnmounted(() => {
    console.log("Cleaning up map");
    if (mapInstance.value?.destroy) {
        mapInstance.value.destroy();
    }
});
</script>

<style scoped>
.flight-plan-map {
    /* Inherits standard gui_box styling */
}

.map-container {
    height: 480px;
    border-radius: 4px;
    overflow: hidden;
    border: 1px solid var(--surface-500);
    background: var(--surface-100);
    position: relative;
}

.map {
    width: 100%;
    height: 100%;
}

.map-loading {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--surface-100);
    z-index: 1000;
}

.loading-message {
    font-size: 1rem;
    color: var(--text);
    font-weight: 500;
}

.map-instructions {
    margin-top: 0.5rem;
    padding: 0.5rem;
    background: var(--surface-100);
    border-radius: 4px;
    font-size: 0.75rem;
    color: var(--surface-700);
    text-align: center;
}

.map-instructions p {
    margin: 0;
}

@media (max-width: 1055px) {
    .map-container {
        height: 320px;
    }
}
</style>
