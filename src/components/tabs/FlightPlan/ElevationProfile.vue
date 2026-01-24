<template>
    <div class="gui_box grey elevation-profile">
        <div class="gui_box_titlebar">
            <div class="spacer_box_title" v-html="$t('flightPlanElevationProfile')"></div>
        </div>
        <div class="spacer_box">
            <div class="profile-stats" v-if="waypoints.length > 0">
                <span class="stat">
                    <strong>{{ $t("flightPlanDistance") }}:</strong> {{ formatDistance(totalDistance) }}
                </span>
                <span class="stat">
                    <strong>{{ $t("flightPlanMinAlt") }}:</strong> {{ minAltitude }}ft
                </span>
                <span class="stat">
                    <strong>{{ $t("flightPlanMaxAlt") }}:</strong> {{ maxAltitude }}ft
                </span>
                <span class="stat">
                    <strong>{{ $t("flightPlanGroundElev") }}:</strong> {{ groundElevation }}ft
                </span>
                <span class="stat">
                    <strong>{{ $t("flightPlanMaxGroundElev") }}:</strong> {{ maxGroundElevation }}ft
                </span>
            </div>

            <div class="profile-chart-container" v-if="waypoints.length > 0">
                <svg
                    ref="chartSvg"
                    :viewBox="`0 0 ${chartWidth} ${chartHeight}`"
                    class="profile-chart"
                    @mousemove="handleMouseMove"
                    @mouseleave="handleMouseLeave"
                >
                    <!-- Y-axis grid lines and labels -->
                    <g class="y-axis">
                        <line
                            v-for="tick in yAxisTicks"
                            :key="`y-${tick.value}`"
                            :x1="padding.left"
                            :y1="tick.y"
                            :x2="chartWidth - padding.right"
                            :y2="tick.y"
                            class="grid-line"
                        />
                        <text
                            v-for="tick in yAxisTicks"
                            :key="`y-label-${tick.value}`"
                            :x="padding.left - 5"
                            :y="tick.y + 3"
                            class="axis-label"
                            text-anchor="end"
                        >
                            {{ tick.value }}ft
                        </text>
                    </g>

                    <!-- X-axis grid lines and labels -->
                    <g class="x-axis">
                        <line
                            v-for="(point, index) in profilePoints"
                            :key="`x-${index}`"
                            :x1="point.x"
                            :y1="padding.top"
                            :x2="point.x"
                            :y2="chartHeight - padding.bottom"
                            class="grid-line-light"
                        />
                        <text
                            v-for="(point, index) in profilePoints"
                            :key="`x-label-${index}`"
                            :x="point.x"
                            :y="chartHeight - padding.bottom + 15"
                            class="axis-label"
                            text-anchor="middle"
                        >
                            {{ formatDistance(point.distance) }}
                        </text>
                    </g>

                    <!-- Terrain area fill (ground elevation at each waypoint) -->
                    <path v-if="terrainAreaPath" :d="terrainAreaPath" class="terrain-area" />

                    <!-- Terrain line (ground elevation profile) -->
                    <path v-if="terrainLinePath" :d="terrainLinePath" class="terrain-line" />

                    <!-- Average ground elevation reference line -->
                    <line
                        v-if="groundElevation > 0"
                        :x1="padding.left"
                        :y1="scaleY(groundElevation)"
                        :x2="chartWidth - padding.right"
                        :y2="scaleY(groundElevation)"
                        class="ground-line"
                    />
                    <text
                        v-if="groundElevation > 0"
                        :x="chartWidth - padding.right - 5"
                        :y="scaleY(groundElevation) - 3"
                        class="ground-label"
                        text-anchor="end"
                    >
                        {{ $t("flightPlanAvgGround") }}
                    </text>

                    <!-- Elevation area fill -->
                    <path :d="areaPath" class="elevation-area" />

                    <!-- Elevation line -->
                    <path :d="linePath" class="elevation-line" />

                    <!-- Waypoint markers -->
                    <g class="waypoint-markers">
                        <circle
                            v-for="(point, index) in profilePoints"
                            :key="`marker-${index}`"
                            :cx="point.x"
                            :cy="point.y"
                            :r="point.uid === selectedWaypointUid ? 4 : 3"
                            :class="['waypoint-marker', { selected: point.uid === selectedWaypointUid }]"
                            @click="handleWaypointClick(point.uid)"
                            @mouseenter="handleMarkerHover(point, index)"
                        />
                        <text
                            v-for="(point, index) in profilePoints"
                            :key="`label-${index}`"
                            :x="point.x"
                            :y="point.y - 8"
                            class="waypoint-label"
                            text-anchor="middle"
                        >
                            WP{{ index + 1 }}
                        </text>
                    </g>

                    <!-- Hover tooltip -->
                    <g v-if="hoveredPoint" class="hover-tooltip">
                        <rect
                            :x="hoveredPoint.tooltipX - 50"
                            :y="hoveredPoint.tooltipY - 40"
                            width="100"
                            height="38"
                            class="tooltip-bg"
                            rx="3"
                        />
                        <text
                            :x="hoveredPoint.tooltipX"
                            :y="hoveredPoint.tooltipY - 25"
                            class="tooltip-text"
                            text-anchor="middle"
                        >
                            WP{{ hoveredPoint.index + 1 }}
                        </text>
                        <text
                            :x="hoveredPoint.tooltipX"
                            :y="hoveredPoint.tooltipY - 12"
                            class="tooltip-text"
                            text-anchor="middle"
                        >
                            {{ $t("flightPlanAlt") }}: {{ hoveredPoint.altitude }}ft
                        </text>
                        <text
                            :x="hoveredPoint.tooltipX"
                            :y="hoveredPoint.tooltipY + 1"
                            class="tooltip-text"
                            text-anchor="middle"
                        >
                            {{ $t("flightPlanDist") }}: {{ formatDistance(hoveredPoint.distance) }}
                        </text>
                    </g>
                </svg>
            </div>

            <div v-else class="no-waypoints">
                <p>{{ $t("flightPlanNoWaypointsForProfile") }}</p>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import { useFlightPlan } from "@/composables/useFlightPlan";

const { sortedWaypoints, selectedWaypointUid, selectWaypoint } = useFlightPlan();
const waypoints = sortedWaypoints;

const chartSvg = ref(null);
const hoveredPoint = ref(null);

// Chart dimensions (50% smaller)
const chartWidth = 800;
const chartHeight = 150;
const padding = {
    top: 20,
    right: 20,
    bottom: 35,
    left: 45,
};

// Ground elevation in feet AMSL (fetched from API)
const groundElevation = ref(0); // Average ground elevation for display
const terrainSamples = ref([]); // Terrain samples with {distance, elevation, lat, lon}
const isFetchingElevation = ref(false);
const elevationFetchSeq = ref(0); // Monotonic sequence to prevent race conditions

// Terrain sampling interval in nautical miles
const TERRAIN_SAMPLE_INTERVAL_NM = 0.2;

// Conversion constants
const METERS_TO_FEET = 3.28084;
const METERS_TO_NAUTICAL_MILES = 1 / 1852;
const NAUTICAL_MILES_TO_METERS = 1852;

// Calculate distance between two points using Haversine formula
const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371000; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
};

// Interpolate a point along a great circle path
// fraction is between 0 (start) and 1 (end)
const interpolatePoint = (lat1, lon1, lat2, lon2, fraction) => {
    const φ1 = (lat1 * Math.PI) / 180;
    const λ1 = (lon1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const λ2 = (lon2 * Math.PI) / 180;

    const d = calculateDistance(lat1, lon1, lat2, lon2) / 6371000; // Angular distance in radians

    const a = Math.sin((1 - fraction) * d) / Math.sin(d);
    const b = Math.sin(fraction * d) / Math.sin(d);

    const x = a * Math.cos(φ1) * Math.cos(λ1) + b * Math.cos(φ2) * Math.cos(λ2);
    const y = a * Math.cos(φ1) * Math.sin(λ1) + b * Math.cos(φ2) * Math.sin(λ2);
    const z = a * Math.sin(φ1) + b * Math.sin(φ2);

    const φ = Math.atan2(z, Math.sqrt(x * x + y * y));
    const λ = Math.atan2(y, x);

    return {
        latitude: (φ * 180) / Math.PI,
        longitude: (λ * 180) / Math.PI,
    };
};

// Format distance for display (convert meters to nautical miles)
const formatDistance = (meters) => {
    const nauticalMiles = meters * METERS_TO_NAUTICAL_MILES;
    return `${nauticalMiles.toFixed(2)}nm`;
};

// Calculate profile points with cumulative distance
const profilePoints = computed(() => {
    if (waypoints.value.length === 0) {
        return [];
    }

    let cumulativeDistance = 0;
    const points = waypoints.value.map((wp, index) => {
        if (index > 0) {
            const prevWp = waypoints.value[index - 1];
            cumulativeDistance += calculateDistance(prevWp.latitude, prevWp.longitude, wp.latitude, wp.longitude);
        }

        return {
            uid: wp.uid,
            altitude: wp.altitude,
            distance: cumulativeDistance,
            latitude: wp.latitude,
            longitude: wp.longitude,
        };
    });

    return points;
});

// Total distance
const totalDistance = computed(() => {
    if (profilePoints.value.length === 0) {
        return 0;
    }
    return profilePoints.value[profilePoints.value.length - 1].distance;
});

// Min and max altitude (already in feet from waypoint data)
const minAltitude = computed(() => {
    if (waypoints.value.length === 0) {
        return 0;
    }
    return Math.round(Math.min(...waypoints.value.map((wp) => wp.altitude)));
});

const maxAltitude = computed(() => {
    if (waypoints.value.length === 0) {
        return 0;
    }
    return Math.round(Math.max(...waypoints.value.map((wp) => wp.altitude)));
});

// Max ground elevation from terrain samples
const maxGroundElevation = computed(() => {
    if (terrainSamples.value.length === 0) {
        return 0;
    }
    return Math.round(Math.max(...terrainSamples.value.map((sample) => sample.elevation)));
});

// Combined maximum for y-axis scaling (considers both flight path and terrain)
const combinedMax = computed(() => {
    return Math.max(maxAltitude.value, maxGroundElevation.value);
});

// Y-axis ticks
const yAxisTicks = computed(() => {
    const min = 0; // Always start at sea level (0 ft AMSL)
    const max = combinedMax.value;
    const range = max - min;
    const tickCount = 5;
    const step = Math.ceil(range / (tickCount - 1) / 10) * 10 || 50; // Round to nearest 10

    const ticks = [];
    const startValue = Math.floor(min / step) * step;

    for (let i = 0; i < tickCount; i++) {
        const value = startValue + i * step;
        const y = scaleY(value);
        ticks.push({ value, y });
    }

    return ticks;
});

// Scale functions
const scaleX = (distance) => {
    const total = totalDistance.value || 1;
    const plotWidth = chartWidth - padding.left - padding.right;
    return padding.left + (distance / total) * plotWidth;
};

const scaleY = (altitude) => {
    const min = 0; // Always start at sea level (0 ft AMSL)
    const max = combinedMax.value; // Use combined max to include terrain heights
    const range = max - min || 100; // Default range if all altitudes are the same
    const plotHeight = chartHeight - padding.top - padding.bottom;

    // Add 10% padding to top only (keep bottom at 0)
    const paddedMin = min;
    const paddedMax = max + range * 0.1;
    const paddedRange = paddedMax - paddedMin;

    return chartHeight - padding.bottom - ((altitude - paddedMin) / paddedRange) * plotHeight;
};

// Calculate SVG path for elevation line
const linePath = computed(() => {
    if (profilePoints.value.length === 0) {
        return "";
    }

    const points = profilePoints.value.map((point) => {
        const x = scaleX(point.distance);
        const y = scaleY(point.altitude);
        return { x, y, ...point };
    });

    // Store scaled points for marker rendering
    profilePoints.value.forEach((point, index) => {
        point.x = points[index].x;
        point.y = points[index].y;
    });

    const pathParts = points.map((point, index) => {
        const command = index === 0 ? "M" : "L";
        return `${command} ${point.x} ${point.y}`;
    });

    return pathParts.join(" ");
});

// Calculate SVG path for area fill
const areaPath = computed(() => {
    if (profilePoints.value.length === 0) {
        return "";
    }

    const baseY = chartHeight - padding.bottom;
    const points = profilePoints.value.map((point) => ({
        x: scaleX(point.distance),
        y: scaleY(point.altitude),
    }));

    const topPath = points
        .map((point, index) => {
            const command = index === 0 ? "M" : "L";
            return `${command} ${point.x} ${point.y}`;
        })
        .join(" ");

    const bottomPath = [`L ${points[points.length - 1].x} ${baseY}`, `L ${points[0].x} ${baseY}`, "Z"].join(" ");

    return `${topPath} ${bottomPath}`;
});

// Calculate SVG path for terrain line using sampled elevations
const terrainLinePath = computed(() => {
    if (terrainSamples.value.length === 0) {
        return "";
    }

    const points = terrainSamples.value.map((sample) => {
        return {
            x: scaleX(sample.distance),
            y: scaleY(sample.elevation),
        };
    });

    const pathParts = points.map((point, index) => {
        const command = index === 0 ? "M" : "L";
        return `${command} ${point.x} ${point.y}`;
    });

    return pathParts.join(" ");
});

// Calculate SVG path for terrain area fill using sampled elevations
const terrainAreaPath = computed(() => {
    if (terrainSamples.value.length === 0) {
        return "";
    }

    const baseY = chartHeight - padding.bottom;
    const points = terrainSamples.value.map((sample) => {
        return {
            x: scaleX(sample.distance),
            y: scaleY(sample.elevation),
        };
    });

    const topPath = points
        .map((point, index) => {
            const command = index === 0 ? "M" : "L";
            return `${command} ${point.x} ${point.y}`;
        })
        .join(" ");

    const bottomPath = [`L ${points[points.length - 1].x} ${baseY}`, `L ${points[0].x} ${baseY}`, "Z"].join(" ");

    return `${topPath} ${bottomPath}`;
});

// Event handlers
const handleWaypointClick = (uid) => {
    selectWaypoint(uid);
};

const handleMarkerHover = (point, index) => {
    hoveredPoint.value = {
        ...point,
        index,
        tooltipX: point.x,
        tooltipY: point.y,
    };
};

const handleMouseMove = (event) => {
    // Keep current hover if over a marker
};

const handleMouseLeave = () => {
    hoveredPoint.value = null;
};

// Fetch ground elevation at 0.2nm intervals along the flight path
const fetchGroundElevation = async () => {
    if (waypoints.value.length === 0) {
        groundElevation.value = 0;
        terrainSamples.value = [];
        return;
    }

    // Increment sequence token and capture it for this fetch
    elevationFetchSeq.value++;
    const currentSeq = elevationFetchSeq.value;

    isFetchingElevation.value = true;

    try {
        // Generate terrain samples at 0.2nm intervals along the entire flight path
        const samples = [];
        let cumulativeDistance = 0;

        for (let i = 0; i < waypoints.value.length; i++) {
            const wp = waypoints.value[i];

            if (i === 0) {
                // Add first waypoint
                samples.push({
                    latitude: wp.latitude,
                    longitude: wp.longitude,
                    distance: 0,
                });
            } else {
                const prevWp = waypoints.value[i - 1];
                const segmentDistance = calculateDistance(prevWp.latitude, prevWp.longitude, wp.latitude, wp.longitude);

                const segmentDistanceNM = segmentDistance * METERS_TO_NAUTICAL_MILES;

                // Generate samples along this segment
                const numSamples = Math.floor(segmentDistanceNM / TERRAIN_SAMPLE_INTERVAL_NM);

                for (let j = 1; j <= numSamples; j++) {
                    const fraction = (j * TERRAIN_SAMPLE_INTERVAL_NM) / segmentDistanceNM;
                    const point = interpolatePoint(
                        prevWp.latitude,
                        prevWp.longitude,
                        wp.latitude,
                        wp.longitude,
                        fraction,
                    );

                    const sampleDistance = cumulativeDistance + fraction * segmentDistance;
                    samples.push({
                        latitude: point.latitude,
                        longitude: point.longitude,
                        distance: sampleDistance,
                    });
                }

                // Add current waypoint
                cumulativeDistance += segmentDistance;
                samples.push({
                    latitude: wp.latitude,
                    longitude: wp.longitude,
                    distance: cumulativeDistance,
                });
            }
        }

        console.log(`Generated ${samples.length} terrain samples at ${TERRAIN_SAMPLE_INTERVAL_NM}nm intervals`);

        // Fetch elevations for all samples (API accepts up to 100 locations per request)
        const allElevations = [];
        const batchSize = 100;

        for (let i = 0; i < samples.length; i += batchSize) {
            const batch = samples.slice(i, i + batchSize);
            const locations = batch.map((s) => ({
                latitude: s.latitude,
                longitude: s.longitude,
            }));

            const response = await fetch("https://api.open-elevation.com/api/v1/lookup", {
                method: "POST",
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ locations }),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            if (data.results && data.results.length > 0) {
                allElevations.push(...data.results.map((result) => Math.round(result.elevation * METERS_TO_FEET)));
            }

            // Small delay between batches to avoid rate limiting
            if (i + batchSize < samples.length) {
                await new Promise((resolve) => setTimeout(resolve, 100));
            }
        }

        // Only apply updates if this is still the latest fetch
        if (currentSeq === elevationFetchSeq.value) {
            // Combine samples with elevations
            terrainSamples.value = samples.map((sample, index) => ({
                ...sample,
                elevation: allElevations[index] || 0,
            }));

            // Calculate average ground elevation for display
            if (allElevations.length > 0) {
                const sum = allElevations.reduce((acc, val) => acc + val, 0);
                groundElevation.value = Math.round(sum / allElevations.length);
                console.log(
                    `Terrain elevations fetched: ${allElevations.length} samples, avg ${groundElevation.value}ft AMSL`,
                );
            }
        } else {
            console.log(`Discarding stale elevation data (seq ${currentSeq} vs current ${elevationFetchSeq.value})`);
        }
    } catch (error) {
        console.error("Failed to fetch ground elevation:", error);
        // Only clear data if this is still the latest fetch
        if (currentSeq === elevationFetchSeq.value) {
            groundElevation.value = 0;
            terrainSamples.value = [];
        }
    } finally {
        // Only clear loading flag if this is still the latest fetch
        if (currentSeq === elevationFetchSeq.value) {
            isFetchingElevation.value = false;
        }
    }
};

// Watch waypoints and fetch ground elevation when they change
watch(
    () => waypoints.value,
    () => {
        fetchGroundElevation();
    },
    { deep: true, immediate: true },
);
</script>

<style scoped>
.elevation-profile {
    margin-top: 1rem;
}

.profile-stats {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
    margin-bottom: 0.75rem;
}

.profile-stats .stat {
    color: var(--text);
    font-size: 0.75rem;
}

.profile-stats .stat strong {
    color: var(--surface-950);
}

.profile-chart-container {
    width: 100%;
    overflow-x: auto;
}

.profile-chart {
    width: 100%;
    height: auto;
    display: block;
}

/* SVG styles */
.grid-line {
    stroke: var(--surface-500);
    stroke-width: 0.5;
    opacity: 0.3;
}

.grid-line-light {
    stroke: var(--surface-500);
    stroke-width: 0.5;
    opacity: 0.15;
}

.axis-label {
    fill: var(--text);
    font-size: 8px;
    font-family: sans-serif;
}

.terrain-area {
    fill: var(--surface-700);
    opacity: 0.2;
}

.terrain-line {
    fill: none;
    stroke: var(--surface-700);
    stroke-width: 1.5;
    opacity: 0.7;
}

.elevation-area {
    fill: var(--primary-500);
    opacity: 0.15;
}

.elevation-line {
    fill: none;
    stroke: var(--primary-500);
    stroke-width: 1.5;
}

.waypoint-marker {
    fill: var(--primary-500);
    stroke: var(--surface-50);
    stroke-width: 1.5;
    cursor: pointer;
    transition: all 0.2s;
}

.waypoint-marker:hover {
    r: 4;
    fill: var(--primary-600);
}

.waypoint-marker.selected {
    fill: var(--success-500);
    stroke: var(--surface-50);
    stroke-width: 2;
}

.waypoint-label {
    fill: var(--text);
    font-size: 7px;
    font-weight: bold;
    pointer-events: none;
    font-family: sans-serif;
}

.ground-line {
    stroke: var(--surface-700);
    stroke-width: 1;
    stroke-dasharray: 4, 2;
    opacity: 0.6;
}

.ground-label {
    fill: var(--surface-700);
    font-size: 7px;
    font-family: sans-serif;
    font-weight: bold;
}

.tooltip-bg {
    fill: var(--surface-950);
    opacity: 0.9;
    stroke: var(--primary-500);
    stroke-width: 0.5;
}

.tooltip-text {
    fill: var(--surface-50);
    font-size: 8px;
    font-family: sans-serif;
    pointer-events: none;
}

.no-waypoints {
    padding: 2rem;
    text-align: center;
    color: var(--surface-700);
}

.no-waypoints p {
    margin: 0;
    font-style: italic;
}

/* Responsive */
@media (max-width: 768px) {
    .profile-stats {
        flex-direction: column;
        gap: 0.5rem;
    }

    .profile-chart-container {
        overflow-x: scroll;
    }
}
</style>
