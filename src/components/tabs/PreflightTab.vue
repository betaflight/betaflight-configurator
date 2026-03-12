<template>
    <BaseTab tab-name="preflight">
        <div class="content_wrapper preflight-tab">
            <div class="tab_title">{{ $t("preflightTitle") }}</div>
            <WikiButton docUrl="preflight" />

            <!-- Location Bar -->
            <div class="gui_box grey preflight-location">
                <div class="gui_box_titlebar">
                    <div class="spacer_box_title">{{ $t("preflightLocation") }}</div>
                </div>
                <div class="spacer_box location-bar">
                    <div class="location-inputs">
                        <button class="default_btn" @click="detectLocation" :disabled="detectingLocation">
                            <em class="fas fa-crosshairs"></em>
                            {{ detectingLocation ? $t("preflightDetecting") : $t("preflightUseMyLocation") }}
                        </button>
                        <span class="location-or">{{ $t("preflightOr") }}</span>
                        <input
                            type="text"
                            inputmode="decimal"
                            v-model="manualLat"
                            :placeholder="$t('preflightLatitude')"
                            class="location-input"
                        />
                        <input
                            type="text"
                            inputmode="decimal"
                            v-model="manualLon"
                            :placeholder="$t('preflightLongitude')"
                            class="location-input"
                        />
                        <button class="default_btn" @click="applyManualLocation" :disabled="!isManualLocationValid">
                            {{ $t("preflightApply") }}
                        </button>
                    </div>
                    <div class="location-status" v-if="preflight.location.latitude !== null">
                        <em class="fas fa-map-marker-alt"></em>
                        {{ preflight.location.name }}
                        <span v-if="preflight.location.source" class="location-source"
                            >({{ preflight.location.source }})</span
                        >
                    </div>
                    <div class="location-error" v-if="locationError">
                        <em class="fas fa-exclamation-triangle"></em> {{ locationError }}
                    </div>
                </div>
            </div>

            <!-- Launch Status Banner -->
            <div
                v-if="preflight.location.latitude !== null"
                class="launch-status-banner"
                :class="preflight.launchStatus.value.cssClass"
            >
                <div class="launch-status-label">{{ $t("preflightLaunchStatus") }}</div>
                <div class="launch-status-value">{{ preflight.launchStatus.value.label }}</div>
                <button class="default_btn refresh-btn" @click="refreshData" :disabled="preflight.isLoading.value">
                    <em class="fas fa-sync-alt" :class="{ 'fa-spin': preflight.isLoading.value }"></em>
                    {{ $t("preflightRefresh") }}
                </button>
            </div>

            <!-- Main Content Grid -->
            <div v-if="preflight.location.latitude !== null" class="grid-row grid-box col5">
                <!-- Left Column: Weather -->
                <div class="col-span-3">
                    <!-- Current Weather -->
                    <div class="gui_box grey">
                        <div class="gui_box_titlebar">
                            <div class="spacer_box_title">
                                <em class="fas fa-cloud-sun"></em> {{ $t("preflightCurrentWeather") }}
                            </div>
                            <div class="loading-indicator" v-if="preflight.weather.loading">
                                <em class="fas fa-spinner fa-spin"></em>
                            </div>
                        </div>
                        <div class="spacer_box">
                            <div v-if="preflight.weather.error" class="error-message">
                                <em class="fas fa-exclamation-circle"></em> {{ preflight.weather.error }}
                            </div>
                            <div v-else-if="preflight.weather.current" class="weather-grid">
                                <div class="weather-main">
                                    <div class="weather-condition">
                                        <span class="weather-icon">{{
                                            getWeatherEmoji(preflight.weather.current.weatherCode)
                                        }}</span>
                                        <span class="weather-desc">{{
                                            preflight.weather.current.weatherDescription
                                        }}</span>
                                    </div>
                                    <div class="weather-temp">{{ preflight.weather.current.temperature }}°C</div>
                                </div>
                                <table class="cf_table weather-details">
                                    <tbody>
                                        <tr>
                                            <td>{{ $t("preflightWind") }}</td>
                                            <td>
                                                <span
                                                    :class="
                                                        getWindStatusClass(
                                                            preflight.weather.current.windSpeed,
                                                            preflight.weather.current.windGusts,
                                                        )
                                                    "
                                                >
                                                    {{ preflight.weather.current.windSpeed.toFixed(1) }} m/s
                                                </span>
                                                {{
                                                    preflight.getWindDirectionLabel(
                                                        preflight.weather.current.windDirection,
                                                    )
                                                }}
                                                ({{ preflight.weather.current.windDirection }}°)
                                            </td>
                                        </tr>
                                        <tr>
                                            <td>{{ $t("preflightGusts") }}</td>
                                            <td>
                                                <span
                                                    :class="
                                                        getWindStatusClass(
                                                            preflight.weather.current.windGusts,
                                                            preflight.weather.current.windGusts,
                                                        )
                                                    "
                                                >
                                                    {{ preflight.weather.current.windGusts.toFixed(1) }} m/s
                                                </span>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td>{{ $t("preflightVisibility") }}</td>
                                            <td>
                                                <span :class="getVisStatusClass(preflight.weather.current.visibility)">
                                                    {{ formatVisibility(preflight.weather.current.visibility) }}
                                                </span>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td>{{ $t("preflightPrecipitation") }}</td>
                                            <td>
                                                <span
                                                    :class="
                                                        getPrecipStatusClass(preflight.weather.current.precipitation)
                                                    "
                                                >
                                                    {{ preflight.weather.current.precipitation }} mm
                                                </span>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td>{{ $t("preflightDewPoint") }}</td>
                                            <td>
                                                {{ preflight.weather.current.dewPoint }}°C
                                                <span
                                                    :class="
                                                        getDewPointRiskClass(
                                                            preflight.weather.current.temperature,
                                                            preflight.weather.current.dewPoint,
                                                        )
                                                    "
                                                    class="status-badge"
                                                >
                                                    {{
                                                        getDewPointRiskLabel(
                                                            preflight.weather.current.temperature,
                                                            preflight.weather.current.dewPoint,
                                                        )
                                                    }}
                                                </span>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td>{{ $t("preflightCloudCover") }}</td>
                                            <td>{{ preflight.weather.current.cloudCover }}%</td>
                                        </tr>
                                        <tr>
                                            <td>{{ $t("preflightHumidity") }}</td>
                                            <td>{{ preflight.weather.current.humidity }}%</td>
                                        </tr>
                                        <tr>
                                            <td>{{ $t("preflightPressure") }}</td>
                                            <td>{{ preflight.weather.current.pressure }} hPa</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                            <div v-else class="no-data">{{ $t("preflightNoData") }}</div>
                        </div>
                    </div>

                    <!-- Flight Window -->
                    <div class="gui_box grey" v-if="preflight.weather.daily">
                        <div class="gui_box_titlebar">
                            <div class="spacer_box_title">
                                <em class="fas fa-clock"></em> {{ $t("preflightFlightWindow") }}
                            </div>
                        </div>
                        <div class="spacer_box">
                            <div class="flight-window-grid">
                                <div class="flight-window-item">
                                    <div class="fw-label">{{ $t("preflightSunrise") }}</div>
                                    <div class="fw-value">
                                        {{ preflight.formatTime(preflight.weather.daily.sunrise) }}
                                    </div>
                                </div>
                                <div class="flight-window-item">
                                    <div class="fw-label">{{ $t("preflightSunset") }}</div>
                                    <div class="fw-value">
                                        {{ preflight.formatTime(preflight.weather.daily.sunset) }}
                                    </div>
                                </div>
                                <div class="flight-window-item">
                                    <div class="fw-label">{{ $t("preflightDaylight") }}</div>
                                    <div class="fw-value">
                                        {{ formatDuration(preflight.weather.daily.daylightDuration) }}
                                    </div>
                                </div>
                                <div class="flight-window-item">
                                    <div class="fw-label">{{ $t("preflightUvIndex") }}</div>
                                    <div class="fw-value" :class="getUvStatusClass(preflight.weather.daily.uvIndexMax)">
                                        {{ preflight.weather.daily.uvIndexMax }}
                                        <span class="fw-sublabel">{{
                                            getUvStatusLabel(preflight.weather.daily.uvIndexMax)
                                        }}</span>
                                    </div>
                                </div>
                                <div class="flight-window-item">
                                    <div class="fw-label">{{ $t("preflightTempRange") }}</div>
                                    <div class="fw-value">
                                        {{ preflight.weather.daily.temperatureMin }}° /
                                        {{ preflight.weather.daily.temperatureMax }}°C
                                    </div>
                                </div>
                                <div class="flight-window-item">
                                    <div class="fw-label">{{ $t("preflightCurrentlyDay") }}</div>
                                    <div
                                        class="fw-value"
                                        :class="preflight.weather.current?.isDay ? 'status-good' : 'status-warning'"
                                    >
                                        {{
                                            preflight.weather.current?.isDay
                                                ? $t("preflightDaytime")
                                                : $t("preflightNighttime")
                                        }}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Wind at Altitude (Hourly) -->
                    <div class="gui_box grey">
                        <div class="gui_box_titlebar">
                            <div class="spacer_box_title">
                                <em class="fas fa-wind"></em> {{ $t("preflightWindForecast") }}
                            </div>
                            <div class="helpicon cf_tip" :title="$t('preflightWindForecastHelp')"></div>
                        </div>
                        <div class="spacer_box">
                            <div v-if="preflight.weather.hourly && preflight.weather.hourly.length > 0">
                                <table class="cf_table hourly-table">
                                    <thead>
                                        <tr class="titles">
                                            <td>{{ $t("preflightTime") }}</td>
                                            <td>{{ $t("preflightWind10m") }}</td>
                                            <td>{{ $t("preflightWind80m") }}</td>
                                            <td>{{ $t("preflightWind120m") }}</td>
                                            <td>{{ $t("preflightGustsShort") }}</td>
                                            <td>{{ $t("preflightRainProb") }}</td>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr v-for="(hour, idx) in preflight.weather.hourly" :key="idx">
                                            <td>{{ preflight.formatTime(hour.time) }}</td>
                                            <td :class="getWindStatusClass(hour.windSpeed10m, hour.windGusts)">
                                                {{ hour.windSpeed10m?.toFixed(1) ?? "-" }}
                                            </td>
                                            <td :class="getWindStatusClass(hour.windSpeed80m, hour.windGusts)">
                                                {{ hour.windSpeed80m?.toFixed(1) ?? "-" }}
                                            </td>
                                            <td :class="getWindStatusClass(hour.windSpeed120m, hour.windGusts)">
                                                {{ hour.windSpeed120m?.toFixed(1) ?? "-" }}
                                            </td>
                                            <td :class="getWindStatusClass(hour.windGusts, hour.windGusts)">
                                                {{ hour.windGusts?.toFixed(1) ?? "-" }}
                                            </td>
                                            <td
                                                :class="
                                                    hour.precipitationProbability > 50
                                                        ? 'status-warning'
                                                        : hour.precipitationProbability > 20
                                                          ? 'status-moderate'
                                                          : ''
                                                "
                                            >
                                                {{ hour.precipitationProbability }}%
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                                <div class="table-note">{{ $t("preflightWindUnit") }}</div>
                            </div>
                            <div v-else class="no-data">{{ $t("preflightNoData") }}</div>
                        </div>
                    </div>
                </div>

                <!-- Right Column: Solar, GNSS, Airspace -->
                <div class="col-span-2">
                    <!-- Solar Activity -->
                    <div class="gui_box grey">
                        <div class="gui_box_titlebar">
                            <div class="spacer_box_title">
                                <em class="fas fa-sun"></em> {{ $t("preflightSolarActivity") }}
                            </div>
                            <div class="helpicon cf_tip" :title="$t('preflightSolarHelp')"></div>
                        </div>
                        <div class="spacer_box">
                            <div v-if="preflight.solar.error" class="error-message">
                                <em class="fas fa-exclamation-circle"></em> {{ preflight.solar.error }}
                            </div>
                            <div v-else-if="preflight.solar.kpIndex !== null" class="solar-info">
                                <div class="kp-display">
                                    <div
                                        class="kp-value"
                                        :class="preflight.getKpStatus(preflight.solar.kpIndex).cssClass"
                                    >
                                        Kp {{ preflight.solar.kpIndex.toFixed(1) }}
                                    </div>
                                    <div class="kp-label">
                                        {{ preflight.getKpStatus(preflight.solar.kpIndex).label }}
                                    </div>
                                </div>
                                <div class="kp-scale">
                                    <div class="kp-bar">
                                        <div
                                            class="kp-fill"
                                            :class="preflight.getKpStatus(preflight.solar.kpIndex).cssClass"
                                            :style="{ width: Math.min(100, (preflight.solar.kpIndex / 9) * 100) + '%' }"
                                        ></div>
                                    </div>
                                    <div class="kp-scale-labels">
                                        <span>0</span>
                                        <span>3</span>
                                        <span>5</span>
                                        <span>9</span>
                                    </div>
                                </div>
                                <div v-if="preflight.solar.stormLevel" class="storm-scales">
                                    <table class="cf_table">
                                        <tbody>
                                            <tr>
                                                <td>{{ $t("preflightGeoStorm") }}</td>
                                                <td :class="getStormClass(preflight.solar.stormLevel.geoStorm)">
                                                    G{{ preflight.solar.stormLevel.geoStorm }}
                                                </td>
                                            </tr>
                                            <tr>
                                                <td>{{ $t("preflightSolarRadiation") }}</td>
                                                <td :class="getStormClass(preflight.solar.stormLevel.solarRadiation)">
                                                    S{{ preflight.solar.stormLevel.solarRadiation }}
                                                </td>
                                            </tr>
                                            <tr>
                                                <td>{{ $t("preflightRadioBlackout") }}</td>
                                                <td :class="getStormClass(preflight.solar.stormLevel.radioBlackout)">
                                                    R{{ preflight.solar.stormLevel.radioBlackout }}
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                                <div class="solar-timestamp" v-if="preflight.solar.kpTimestamp">
                                    {{ $t("preflightLastMeasurement") }}: {{ preflight.solar.kpTimestamp }}
                                </div>
                            </div>
                            <div v-else-if="preflight.solar.loading" class="loading-placeholder">
                                <em class="fas fa-spinner fa-spin"></em> {{ $t("preflightLoadingSolar") }}
                            </div>
                            <div v-else class="no-data">{{ $t("preflightNoData") }}</div>
                        </div>
                    </div>

                    <!-- GNSS Info -->
                    <div class="gui_box grey">
                        <div class="gui_box_titlebar">
                            <div class="spacer_box_title">
                                <em class="fas fa-satellite"></em> {{ $t("preflightGNSS") }}
                            </div>
                            <div class="helpicon cf_tip" :title="$t('preflightGNSSHelp')"></div>
                        </div>
                        <div class="spacer_box">
                            <div class="gnss-info">
                                <p>{{ $t("preflightGNSSNote") }}</p>
                                <table class="cf_table">
                                    <tbody>
                                        <tr>
                                            <td>{{ $t("preflightKpEffect") }}</td>
                                            <td>
                                                <span
                                                    v-if="preflight.solar.kpIndex !== null"
                                                    :class="getGnssKpClass(preflight.solar.kpIndex)"
                                                >
                                                    {{ getGnssKpLabel(preflight.solar.kpIndex) }}
                                                </span>
                                                <span v-else>-</span>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td>{{ $t("preflightGPSRescue") }}</td>
                                            <td>
                                                <span :class="getGpsRescueClass()">
                                                    {{ getGpsRescueLabel() }}
                                                </span>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td>{{ $t("preflightMagDeclination") }}</td>
                                            <td>
                                                <span v-if="preflight.mag.declination !== null">
                                                    {{ preflight.mag.declination.toFixed(2) }}°
                                                </span>
                                                <span v-else>-</span>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td>{{ $t("preflightMagInclination") }}</td>
                                            <td>
                                                <span v-if="preflight.mag.inclination !== null">
                                                    {{ preflight.mag.inclination.toFixed(2) }}°
                                                </span>
                                                <span v-else>-</span>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                                <div class="gnss-links">
                                    <a href="https://www.gnssplanning.com/" target="_blank" rel="noopener noreferrer">
                                        <em class="fas fa-external-link-alt"></em> {{ $t("preflightGNSSPlanner") }}
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Airspace / No-Fly Zones -->
                    <div class="gui_box grey">
                        <div class="gui_box_titlebar">
                            <div class="spacer_box_title">
                                <em class="fas fa-ban"></em> {{ $t("preflightAirspace") }}
                            </div>
                        </div>
                        <div class="spacer_box">
                            <div class="airspace-info">
                                <p>{{ $t("preflightAirspaceNote") }}</p>
                                <div class="airspace-links">
                                    <a
                                        v-if="preflight.location.latitude !== null"
                                        :href="droneSafetyMapLink"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        class="airspace-link"
                                    >
                                        <em class="fas fa-shield-alt"></em> {{ $t("preflightDroneSafetyMap") }}
                                    </a>
                                    <a
                                        v-if="preflight.location.latitude !== null"
                                        :href="airspaceExplorerLink"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        class="airspace-link"
                                    >
                                        <em class="fas fa-map"></em> {{ $t("preflightAirspaceExplorer") }}
                                    </a>
                                    <a
                                        v-if="preflight.location.latitude !== null"
                                        :href="notamLink"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        class="airspace-link"
                                    >
                                        <em class="fas fa-exclamation-triangle"></em> {{ $t("preflightNOTAMs") }}
                                    </a>
                                    <a
                                        v-if="preflight.location.latitude !== null"
                                        :href="notamEuLink"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        class="airspace-link"
                                    >
                                        <em class="fas fa-exclamation-triangle"></em> {{ $t("preflightNOTAMsEU") }}
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Map -->
                    <div class="gui_box grey preflight-map-box">
                        <div class="gui_box_titlebar">
                            <div class="spacer_box_title">
                                <em class="fas fa-map-marked-alt"></em> {{ $t("preflightMap") }}
                            </div>
                        </div>
                        <div class="spacer_box preflight-map-container" ref="mapContainerRef">
                            <div id="preflight-map" class="preflight-map" ref="mapRef"></div>
                            <div class="controls">
                                <button
                                    type="button"
                                    :class="{ active: activeLayer === 'satellite' }"
                                    aria-label="Satellite view"
                                    @click="setLayer('satellite')"
                                >
                                    S
                                </button>
                                <button
                                    type="button"
                                    :class="{ active: activeLayer === 'hybrid' }"
                                    aria-label="Hybrid satellite and street view"
                                    @click="setLayer('hybrid')"
                                >
                                    H
                                </button>
                                <button
                                    type="button"
                                    :class="{ active: activeLayer === 'street' }"
                                    aria-label="Street map view"
                                    @click="setLayer('street')"
                                >
                                    R
                                </button>
                                <button type="button" aria-label="Zoom in" @click="zoomIn">+</button>
                                <button type="button" aria-label="Zoom out" @click="zoomOut">&ndash;</button>
                                <button
                                    type="button"
                                    :class="{ active: isFullscreen }"
                                    aria-label="Toggle fullscreen"
                                    @click="toggleFullscreen"
                                >
                                    &#x26F6;
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Data Attribution -->
            <div v-if="preflight.location.latitude !== null" class="preflight-attribution">
                {{ $t("preflightAttribution") }}
            </div>
        </div>
    </BaseTab>
</template>

<script>
import { defineComponent, ref, computed, onMounted, onUnmounted, nextTick, watch } from "vue";
import BaseTab from "./BaseTab.vue";
import WikiButton from "../elements/WikiButton.vue";
import GUI from "../../js/gui";
import { usePreflight } from "@/composables/usePreflight";
import { initMap } from "../../js/utils/map";
import { fromLonLat } from "ol/proj";

export default defineComponent({
    name: "PreflightTab",
    components: {
        BaseTab,
        WikiButton,
    },
    setup() {
        const preflight = usePreflight();
        const mapRef = ref(null);
        const mapContainerRef = ref(null);
        const mapInstance = ref(null);
        const activeLayer = ref("street");
        const isFullscreen = ref(false);
        const detectingLocation = ref(false);
        const locationError = ref(null);
        const manualLat = ref("");
        const manualLon = ref("");

        const isManualLocationValid = computed(() => {
            const lat = parseFloat(manualLat.value);
            const lon = parseFloat(manualLon.value);
            return !isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
        });

        const airspaceExplorerLink = computed(() => {
            if (preflight.location.latitude === null) return "#";
            return `https://skyvector.com/?ll=${preflight.location.latitude},${preflight.location.longitude}&chart=301&zoom=2`;
        });

        const droneSafetyMapLink = computed(() => {
            if (preflight.location.latitude === null) return "#";
            return `https://dronesafetymap.com/?lat=${preflight.location.latitude}&lng=${preflight.location.longitude}&zoom=13`;
        });

        const notamLink = computed(() => {
            return "https://notams.aim.faa.gov/notamSearch/";
        });

        const notamEuLink = computed(() => {
            return "https://www.ead.eurocontrol.int/cms-eadbasic/opencms/en/ead-operations/data-maintenance/notam-availability-ino/";
        });

        async function detectLocation() {
            detectingLocation.value = true;
            locationError.value = null;
            try {
                await preflight.useGeolocation();
                manualLat.value = String(preflight.location.latitude);
                manualLon.value = String(preflight.location.longitude);
                await preflight.refreshAll();
                updateMapPosition();
            } catch (err) {
                locationError.value = err.message || "Could not detect location";
            } finally {
                detectingLocation.value = false;
            }
        }

        async function applyManualLocation() {
            if (!isManualLocationValid.value) return;
            locationError.value = null;
            preflight.setManualLocation(parseFloat(manualLat.value), parseFloat(manualLon.value));
            await preflight.refreshAll();
            updateMapPosition();
        }

        async function refreshData() {
            await preflight.refreshAll();
        }

        function initializeMap() {
            if (mapInstance.value || !mapRef.value) return;
            mapInstance.value = initMap({
                target: mapRef.value,
                defaultLayer: activeLayer.value,
                defaultZoom: 13,
            });
            setLayer(activeLayer.value);
        }

        function updateMapPosition() {
            if (preflight.location.latitude === null || preflight.location.longitude === null) return;
            nextTick(() => {
                initializeMap();
                if (!mapInstance.value) return;
                const center = fromLonLat([preflight.location.longitude, preflight.location.latitude]);
                mapInstance.value.mapView.setCenter(center);
                mapInstance.value.iconGeometry.setCoordinates(center);
                mapInstance.value.iconFeature.setStyle(mapInstance.value.iconStyleGPS);
                mapInstance.value.map.updateSize();
            });
        }

        function setLayer(layerKey) {
            if (!mapInstance.value?.layers) return;
            Object.entries(mapInstance.value.layers).forEach(([key, layer]) => {
                layer.setVisible(key === layerKey);
            });
            activeLayer.value = layerKey;
            nextTick(() => mapInstance.value?.map?.updateSize());
        }

        function zoomIn() {
            if (!mapInstance.value?.mapView) return;
            mapInstance.value.mapView.setZoom(mapInstance.value.mapView.getZoom() + 1);
        }

        function zoomOut() {
            if (!mapInstance.value?.mapView) return;
            mapInstance.value.mapView.setZoom(mapInstance.value.mapView.getZoom() - 1);
        }

        function toggleFullscreen() {
            const container = mapContainerRef.value;
            if (!container) return;

            if (!document.fullscreenElement && !document.webkitFullscreenElement && !document.msFullscreenElement) {
                if (container.requestFullscreen) {
                    container.requestFullscreen();
                } else if (container.webkitRequestFullscreen) {
                    container.webkitRequestFullscreen();
                } else if (container.msRequestFullscreen) {
                    container.msRequestFullscreen();
                }
            } else if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            }
        }

        function handleFullscreenChange() {
            isFullscreen.value = !!(
                document.fullscreenElement ||
                document.webkitFullscreenElement ||
                document.msFullscreenElement
            );
            requestAnimationFrame(() => mapInstance.value?.map?.updateSize());
        }

        function getWeatherEmoji(code) {
            if (code === 0) return "\u2600";
            if (code <= 3) return "\u26C5";
            if (code <= 48) return "\uD83C\uDF2B";
            if (code <= 57) return "\uD83C\uDF27";
            if (code <= 67) return "\uD83C\uDF27";
            if (code <= 77) return "\u2744";
            if (code <= 82) return "\uD83C\uDF26";
            if (code <= 86) return "\u2744";
            return "\u26A1";
        }

        function getWindStatusClass(speed, gusts) {
            return preflight.getWindStatus(speed, gusts).cssClass;
        }

        function getVisStatusClass(vis) {
            return preflight.getVisibilityStatus(vis).cssClass;
        }

        function getPrecipStatusClass(precip) {
            return preflight.getPrecipitationStatus(precip).cssClass;
        }

        function getStormClass(level) {
            const num = parseInt(level) || 0;
            if (num === 0) return "status-good";
            if (num <= 2) return "status-moderate";
            if (num <= 3) return "status-warning";
            return "status-danger";
        }

        function getGnssKpClass(kp) {
            if (kp <= 3) return "status-good";
            if (kp <= 5) return "status-warning";
            return "status-danger";
        }

        function getGnssKpLabel(kp) {
            if (kp <= 3) return "Minimal impact on GPS";
            if (kp <= 5) return "Possible GPS accuracy degradation";
            return "Significant GPS interference expected";
        }

        function getGpsRescueClass() {
            if (preflight.solar.kpIndex === null) return "";
            if (preflight.solar.kpIndex <= 4) return "status-good";
            if (preflight.solar.kpIndex <= 5) return "status-warning";
            return "status-danger";
        }

        function getGpsRescueLabel() {
            if (preflight.solar.kpIndex === null) return "Check solar activity first";
            if (preflight.solar.kpIndex <= 4) return "GPS Rescue reliable";
            if (preflight.solar.kpIndex <= 5) return "GPS Rescue may be unreliable";
            return "GPS Rescue NOT recommended";
        }

        function formatVisibility(vis) {
            if (vis >= 1000) return `${(vis / 1000).toFixed(1)} km`;
            return `${vis} m`;
        }

        function formatDuration(seconds) {
            if (!seconds) return "-";
            const h = Math.floor(seconds / 3600);
            const m = Math.floor((seconds % 3600) / 60);
            return `${h}h ${m}m`;
        }

        function getDewPointRiskClass(temp, dewPoint) {
            return preflight.getDewPointRisk(temp, dewPoint).cssClass;
        }

        function getDewPointRiskLabel(temp, dewPoint) {
            return preflight.getDewPointRisk(temp, dewPoint).label;
        }

        function getUvStatusClass(uv) {
            return preflight.getUvStatus(uv).cssClass;
        }

        function getUvStatusLabel(uv) {
            return preflight.getUvStatus(uv).label;
        }

        onMounted(() => {
            GUI.content_ready();
            document.addEventListener("fullscreenchange", handleFullscreenChange);
            document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
            document.addEventListener("MSFullscreenChange", handleFullscreenChange);
            nextTick(() => {
                if (preflight.location.latitude !== null) {
                    initializeMap();
                    updateMapPosition();
                }
            });
        });

        onUnmounted(() => {
            document.removeEventListener("fullscreenchange", handleFullscreenChange);
            document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
            document.removeEventListener("MSFullscreenChange", handleFullscreenChange);
            if (mapInstance.value?.destroy) {
                mapInstance.value.destroy();
            }
        });

        watch(
            () => preflight.location.latitude,
            () => {
                nextTick(() => {
                    initializeMap();
                    updateMapPosition();
                });
            },
        );

        return {
            preflight,
            mapRef,
            mapContainerRef,
            activeLayer,
            isFullscreen,
            detectingLocation,
            locationError,
            manualLat,
            manualLon,
            isManualLocationValid,
            airspaceExplorerLink,
            droneSafetyMapLink,
            notamLink,
            notamEuLink,
            detectLocation,
            applyManualLocation,
            refreshData,
            setLayer,
            zoomIn,
            zoomOut,
            toggleFullscreen,
            getWeatherEmoji,
            getWindStatusClass,
            getVisStatusClass,
            getPrecipStatusClass,
            getStormClass,
            getGnssKpClass,
            getGnssKpLabel,
            getGpsRescueClass,
            getGpsRescueLabel,
            formatVisibility,
            formatDuration,
            getDewPointRiskClass,
            getDewPointRiskLabel,
            getUvStatusClass,
            getUvStatusLabel,
        };
    },
});
</script>
