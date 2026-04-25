<template>
    <BaseTab tab-name="preflight">
        <div class="content_wrapper preflight-tab">
            <div class="tab_title">{{ $t("preflightTitle") }}</div>
            <WikiButton docUrl="preflight" />

            <!-- Location Bar -->
            <UiBox :title="$t('preflightLocation')">
                <div class="location-bar">
                    <div class="location-inputs">
                        <div class="default_btn">
                            <a href="#" @click.prevent="detectLocation" :class="{ disabled: detectingLocation }">
                                <em class="fas fa-crosshairs"></em>
                                {{ detectingLocation ? $t("preflightDetecting") : $t("preflightUseMyLocation") }}
                            </a>
                        </div>
                        <span class="location-or">{{ $t("preflightOr") }}</span>
                        <div class="manual-entry-group">
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
                            <div class="default_btn">
                                <a
                                    href="#"
                                    @click.prevent="applyManualLocation"
                                    :class="{ disabled: !isManualLocationValid }"
                                >
                                    {{ $t("preflightApply") }}
                                </a>
                            </div>
                        </div>
                        <div
                            v-if="
                                preflight.location.latitude !== null &&
                                preflight.savedLocations.length === 0 &&
                                !locationEditMode
                            "
                            class="default_btn"
                        >
                            <a href="#" @click.prevent="showSaveDialog" :title="$t('preflightSaveLocation')">
                                <em class="fas fa-bookmark"></em>
                                {{ $t("preflightSaveLocation") }}
                            </a>
                        </div>
                    </div>
                    <!-- Saved Locations -->
                    <div class="saved-locations-row" v-if="preflight.savedLocations.length > 0 || locationEditMode">
                        <template v-if="!locationEditMode">
                            <USelect
                                v-model="selectedSavedIndex"
                                :items="savedLocationOptions"
                                :placeholder="$t('preflightSavedLocationsPlaceholder')"
                                class="min-w-44 max-w-72"
                                @update:model-value="loadSavedLocation"
                            />
                            <div class="default_btn saved-loc-btn">
                                <a
                                    href="#"
                                    @click.prevent="showRenameDialog"
                                    :class="{ disabled: selectedSavedIndex < 0 }"
                                    :title="$t('preflightRenameLocation')"
                                >
                                    <em class="fas fa-pencil-alt"></em>
                                </a>
                            </div>
                            <div class="default_btn saved-loc-btn">
                                <a
                                    href="#"
                                    @click.prevent="deleteSelectedLocation"
                                    :class="{ disabled: selectedSavedIndex < 0 }"
                                    :title="$t('preflightDeleteLocation')"
                                >
                                    <em class="fas fa-trash-alt"></em>
                                </a>
                            </div>
                            <div class="default_btn saved-loc-btn">
                                <a
                                    href="#"
                                    @click.prevent="showSaveDialog"
                                    :class="{
                                        disabled:
                                            preflight.location.latitude === null ||
                                            preflight.savedLocations.length >= preflight.MAX_SAVED_LOCATIONS,
                                    }"
                                    :title="
                                        preflight.savedLocations.length >= preflight.MAX_SAVED_LOCATIONS
                                            ? $t('preflightSavedLocationsFull')
                                            : $t('preflightSaveLocation')
                                    "
                                >
                                    <em class="fas fa-bookmark"></em>
                                </a>
                            </div>
                        </template>
                        <template v-else>
                            <div class="save-entry-group">
                                <input
                                    type="text"
                                    v-model="saveLocationLabel"
                                    :placeholder="$t('preflightLocationLabel')"
                                    :maxlength="preflight.MAX_LABEL_LENGTH"
                                    class="location-input save-label-input"
                                    @keyup.enter="
                                        locationEditMode === 'rename' ? confirmRenameLocation() : confirmSaveLocation()
                                    "
                                />
                                <div class="default_btn">
                                    <a
                                        v-if="locationEditMode === 'rename'"
                                        href="#"
                                        @click.prevent="confirmRenameLocation"
                                        :class="{ disabled: !saveLocationLabel.trim() }"
                                    >
                                        {{ $t("preflightRenameLocationBtn") }}
                                    </a>
                                    <a
                                        v-else
                                        href="#"
                                        @click.prevent="confirmSaveLocation"
                                        :class="{ disabled: !saveLocationLabel.trim() }"
                                    >
                                        {{ $t("preflightSaveLocationBtn") }}
                                    </a>
                                </div>
                                <div class="default_btn saved-loc-btn">
                                    <a href="#" @click.prevent="cancelEditMode">
                                        <em class="fas fa-times"></em>
                                    </a>
                                </div>
                            </div>
                        </template>
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
                    <div class="ip-consent-prompt" v-if="showIpConsent">
                        <em class="fas fa-shield-alt"></em>
                        <span>{{ $t("preflightIpConsentMessage") }}</span>
                        <div class="ip-consent-actions">
                            <div class="default_btn">
                                <a href="#" @click.prevent="allowIpGeolocation">
                                    {{ $t("preflightIpConsentAllow") }}
                                </a>
                            </div>
                            <div class="default_btn">
                                <a href="#" @click.prevent="denyIpGeolocation">
                                    {{ $t("preflightIpConsentDeny") }}
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            </UiBox>

            <!-- Launch Status Banner -->
            <div
                v-if="preflight.location.latitude !== null"
                class="launch-status-banner"
                :class="preflight.launchStatus.cssClass"
            >
                <div class="launch-status-label">{{ $t("preflightLaunchStatus") }}</div>
                <div class="launch-status-value">{{ $t(preflight.launchStatus.label) }}</div>
                <div class="default_btn refresh-btn">
                    <a href="#" @click.prevent="refreshData" :class="{ disabled: preflight.isLoading }">
                        <em class="fas fa-sync-alt" :class="{ 'fa-spin': preflight.isLoading }"></em>
                        {{ $t("preflightRefresh") }}
                    </a>
                </div>
            </div>

            <!-- Launch Checks Breakdown -->
            <div class="launch-checks" v-if="preflight.launchStatus.checks.length > 0">
                <span
                    v-for="(chk, idx) in preflight.launchStatus.checks"
                    :key="idx"
                    class="launch-check-item"
                    :class="chk.cssClass"
                >
                    <em
                        class="fas"
                        :class="
                            chk.level === 'good'
                                ? 'fa-check-circle'
                                : chk.level === 'danger'
                                  ? 'fa-times-circle'
                                  : 'fa-exclamation-circle'
                        "
                    ></em>
                    {{ $t(chk.nameKey) }}
                </span>
            </div>

            <!-- Main Content Grid -->
            <div v-if="preflight.location.latitude !== null" class="grid-row grid-box col5">
                <!-- Left Column: Weather -->
                <div class="col-span-3">
                    <!-- Current Weather -->
                    <UiBox :title="`<em class='fas fa-cloud-sun'></em> ${$t('preflightCurrentWeather')}`">
                        <template #title>
                            <div v-if="preflight.weather.loading" class="text-primary">
                                <em class="fas fa-spinner fa-spin"></em>
                            </div>
                        </template>
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
                                        $t(preflight.weather.current.weatherDescription)
                                    }}</span>
                                </div>
                                <div class="weather-temp">{{ preflight.weather.current.temperature }}°C</div>
                            </div>
                            <UTable
                                :data="weatherDetailsData"
                                :columns="weatherDetailsColumns"
                                :ui="{ thead: 'hidden', td: 'border-none py-0.5 text-xs' }"
                            >
                                <template #value-cell="{ row }">
                                    <template v-if="row.original.key === 'wind'">
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
                                        {{ preflight.getWindDirectionLabel(preflight.weather.current.windDirection) }}
                                        ({{ preflight.weather.current.windDirection }}°)
                                    </template>
                                    <template v-else-if="row.original.key === 'dewPoint'">
                                        {{ preflight.weather.current.dewPoint }}°C ({{
                                            toFahrenheit(preflight.weather.current.dewPoint)
                                        }}°F)
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
                                                $t(
                                                    getDewPointRiskLabel(
                                                        preflight.weather.current.temperature,
                                                        preflight.weather.current.dewPoint,
                                                    ),
                                                )
                                            }}
                                        </span>
                                    </template>
                                    <template v-else-if="row.original.key === 'feelsLike'">
                                        {{ preflight.weather.current.apparentTemperature }}°C ({{
                                            toFahrenheit(preflight.weather.current.apparentTemperature)
                                        }}°F)
                                    </template>
                                    <span v-else :class="row.original.valueClass">
                                        {{ row.original.value }}
                                    </span>
                                </template>
                            </UTable>
                        </div>
                        <div v-else class="no-data">{{ $t("preflightNoData") }}</div>
                    </UiBox>

                    <!-- Flight Window -->
                    <UiBox
                        v-if="preflight.weather.daily"
                        :title="`<em class='fas fa-clock'></em> ${$t('preflightFlightWindow')}`"
                    >
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
                                <div class="fw-label">{{ $t("preflightCivilTwilight") }}</div>
                                <div class="fw-value" :class="civilTwilightStatus">
                                    {{ civilTwilightStart }} – {{ civilTwilightEnd }}
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
                                        $t(getUvStatusLabel(preflight.weather.daily.uvIndexMax))
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
                    </UiBox>

                    <!-- Wind at Altitude (Hourly) -->
                    <UiBox
                        :title="`<em class='fas fa-wind'></em> ${$t('preflightWindForecast')}`"
                        :help="$t('preflightWindForecastHelp')"
                    >
                        <UTable
                            :data="preflight.weather.hourly ?? []"
                            :columns="hourlyColumns"
                            :empty="$t('preflightNoData')"
                            :ui="{ th: 'text-xs', td: 'border-none py-0.5 text-xs' }"
                        >
                            <template #time-cell="{ row }">
                                {{ preflight.formatTime(row.original.time) }}
                            </template>
                            <template #windSpeed10m-cell="{ row }">
                                <span :class="getWindStatusClass(row.original.windSpeed10m, row.original.windGusts)">
                                    {{ row.original.windSpeed10m?.toFixed(1) ?? "-" }}
                                </span>
                            </template>
                            <template #windSpeed80m-cell="{ row }">
                                <span :class="getWindStatusClass(row.original.windSpeed80m, row.original.windGusts)">
                                    {{ row.original.windSpeed80m?.toFixed(1) ?? "-" }}
                                </span>
                            </template>
                            <template #windSpeed120m-cell="{ row }">
                                <span :class="getWindStatusClass(row.original.windSpeed120m, row.original.windGusts)">
                                    {{ row.original.windSpeed120m?.toFixed(1) ?? "-" }}
                                </span>
                            </template>
                            <template #windGusts-cell="{ row }">
                                <span :class="getWindStatusClass(row.original.windGusts, row.original.windGusts)">
                                    {{ row.original.windGusts?.toFixed(1) ?? "-" }}
                                </span>
                            </template>
                            <template #precipitationProbability-cell="{ row }">
                                <span
                                    :class="
                                        row.original.precipitationProbability > 50
                                            ? 'status-warning'
                                            : row.original.precipitationProbability > 20
                                              ? 'status-moderate'
                                              : ''
                                    "
                                >
                                    {{ row.original.precipitationProbability }}%
                                </span>
                            </template>
                        </UTable>
                        <div v-if="preflight.weather.hourly?.length" class="table-note">
                            {{ $t("preflightWindUnit") }}
                        </div>
                    </UiBox>

                    <!-- 5-Day Forecast -->
                    <UiBox
                        v-if="preflight.weather.forecast && preflight.weather.forecast.length > 0"
                        :title="`<em class='fas fa-calendar-alt'></em> ${$t('preflightForecast')}`"
                        :help="$t('preflightForecastHelp')"
                    >
                        <UTable
                            :data="preflight.weather.forecast"
                            :columns="forecastColumns"
                            :meta="{ class: { tr: (row) => getForecastRowClass(row.original) } }"
                            :ui="{ th: 'text-xs', td: 'border-none py-0.5 text-xs' }"
                        >
                            <template #date-cell="{ row }">
                                {{ formatForecastDay(row.original.date) }}
                            </template>
                            <template #weatherCode-cell="{ row }">
                                {{ getWeatherEmoji(row.original.weatherCode) }}
                                {{ $t(row.original.weatherDescription) }}
                            </template>
                            <template #tempMin-cell="{ row }">
                                {{ row.original.tempMin !== null ? row.original.tempMin + "°" : "-" }} /
                                {{ row.original.tempMax !== null ? row.original.tempMax + "°C" : "-" }}
                            </template>
                            <template #windMax-cell="{ row }">
                                <span :class="getWindStatusClass(row.original.windMax, row.original.gustsMax)">
                                    {{ row.original.windMax !== null ? row.original.windMax.toFixed(1) : "-" }}
                                </span>
                            </template>
                            <template #gustsMax-cell="{ row }">
                                <span :class="getWindStatusClass(row.original.gustsMax, row.original.gustsMax)">
                                    {{ row.original.gustsMax !== null ? row.original.gustsMax.toFixed(1) : "-" }}
                                </span>
                            </template>
                            <template #precipProbability-cell="{ row }">
                                <span
                                    :class="
                                        row.original.precipProbability > 50
                                            ? 'status-warning'
                                            : row.original.precipProbability > 20
                                              ? 'status-moderate'
                                              : ''
                                    "
                                >
                                    {{
                                        row.original.precipProbability !== null
                                            ? row.original.precipProbability + "%"
                                            : "-"
                                    }}
                                </span>
                            </template>
                        </UTable>
                        <div class="table-note">{{ $t("preflightWindUnit") }}</div>
                    </UiBox>
                </div>

                <!-- Right Column: Solar, GNSS, Airspace -->
                <div class="col-span-2">
                    <!-- Solar Activity -->
                    <UiBox
                        :title="`<em class='fas fa-sun'></em> ${$t('preflightSolarActivity')}`"
                        :help="$t('preflightSolarHelp')"
                    >
                        <div v-if="preflight.solar.error" class="error-message">
                            <em class="fas fa-exclamation-circle"></em> {{ preflight.solar.error }}
                        </div>
                        <div v-else-if="preflight.solar.kpIndex !== null" class="solar-info">
                            <div class="kp-display">
                                <div class="kp-value" :class="preflight.getKpStatus(preflight.solar.kpIndex).cssClass">
                                    Kp {{ preflight.solar.kpIndex.toFixed(1) }}
                                </div>
                                <div class="kp-label">
                                    {{ $t(preflight.getKpStatus(preflight.solar.kpIndex).label) }}
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
                                <UTable
                                    :data="stormScalesData"
                                    :columns="stormScalesColumns"
                                    class="text-sm"
                                    :ui="{ thead: 'hidden', td: 'border-none py-0.5' }"
                                >
                                    <template #value-cell="{ row }">
                                        <span :class="row.original.valueClass">
                                            {{ row.original.value }}
                                        </span>
                                    </template>
                                </UTable>
                            </div>
                            <div class="solar-timestamp" v-if="preflight.solar.kpTimestamp">
                                {{ $t("preflightLastMeasurement") }}: {{ preflight.solar.kpTimestamp }}
                            </div>
                        </div>
                        <div v-else-if="preflight.solar.loading" class="loading-placeholder">
                            <em class="fas fa-spinner fa-spin"></em> {{ $t("preflightLoadingSolar") }}
                        </div>
                        <div v-else class="no-data">{{ $t("preflightNoData") }}</div>
                    </UiBox>

                    <!-- GNSS Info -->
                    <UiBox
                        :title="`<em class='fas fa-satellite'></em> ${$t('preflightGNSS')}`"
                        :help="$t('preflightGNSSHelp')"
                    >
                        <div class="gnss-info">
                            <p>{{ $t("preflightGNSSNote") }}</p>
                            <UTable
                                :data="gnssInfoData"
                                :columns="gnssInfoColumns"
                                :ui="{ thead: 'hidden', td: 'border-none py-0.5 text-xs' }"
                            >
                                <template #value-cell="{ row }">
                                    <span :class="row.original.valueClass">
                                        {{ row.original.value }}
                                    </span>
                                </template>
                            </UTable>
                            <div class="gnss-links">
                                <a href="https://www.gnssplanning.com/" target="_blank" rel="noopener noreferrer">
                                    <em class="fas fa-external-link-alt"></em> {{ $t("preflightGNSSPlanner") }}
                                </a>
                            </div>
                        </div>
                    </UiBox>

                    <!-- Airspace / No-Fly Zones -->
                    <UiBox :title="`<em class='fas fa-ban'></em> ${$t('preflightAirspace')}`">
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
                    </UiBox>

                    <!-- Map -->
                    <UiBox
                        :title="`<em class='fas fa-map-marked-alt'></em> ${$t('preflightMap')}`"
                        class="preflight-map-box"
                    >
                        <div class="preflight-map-container" ref="mapContainerRef">
                            <div id="preflight-map" class="preflight-map" ref="mapRef"></div>
                            <div class="controls">
                                <button
                                    type="button"
                                    :class="{ active: activeLayer === 'satellite' }"
                                    :aria-label="$t('preflightMapSatellite')"
                                    @click="setLayer('satellite')"
                                >
                                    S
                                </button>
                                <button
                                    type="button"
                                    :class="{ active: activeLayer === 'hybrid' }"
                                    :aria-label="$t('preflightMapHybrid')"
                                    @click="setLayer('hybrid')"
                                >
                                    H
                                </button>
                                <button
                                    type="button"
                                    :class="{ active: activeLayer === 'street' }"
                                    :aria-label="$t('preflightMapStreet')"
                                    @click="setLayer('street')"
                                >
                                    R
                                </button>
                                <button type="button" :aria-label="$t('preflightMapZoomIn')" @click="zoomIn">+</button>
                                <button type="button" :aria-label="$t('preflightMapZoomOut')" @click="zoomOut">
                                    &ndash;
                                </button>
                                <button
                                    type="button"
                                    :class="{ active: isFullscreen }"
                                    :aria-label="$t('preflightMapFullscreen')"
                                    @click="toggleFullscreen"
                                >
                                    &#x26F6;
                                </button>
                            </div>
                        </div>
                    </UiBox>
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
import { defineComponent, reactive, ref, computed, onMounted, onUnmounted, nextTick, watch } from "vue";
import BaseTab from "./BaseTab.vue";
import WikiButton from "../elements/WikiButton.vue";
import UiBox from "../elements/UiBox.vue";
import GUI from "../../js/gui";
import { i18n } from "@/js/localization";
import { usePreflight } from "@/composables/usePreflight";
import { initMap } from "../../js/utils/map";
import { fromLonLat } from "ol/proj";

function getWeatherEmoji(code) {
    if (code === 0) {
        return "\u2600";
    }
    if (code <= 3) {
        return "\u26C5";
    }
    if (code <= 48) {
        return "\uD83C\uDF2B";
    }
    if (code <= 57) {
        return "\uD83C\uDF27";
    }
    if (code <= 67) {
        return "\uD83C\uDF27";
    }
    if (code <= 77) {
        return "\u2744";
    }
    if (code <= 82) {
        return "\uD83C\uDF26";
    }
    if (code <= 86) {
        return "\u2744";
    }
    return "\u26A1";
}

function getStormClass(level) {
    const num = Number.parseInt(level) || 0;
    if (num === 0) {
        return "status-good";
    }
    if (num <= 2) {
        return "status-moderate";
    }
    if (num <= 3) {
        return "status-warning";
    }
    return "status-danger";
}

function getGnssKpClass(kp) {
    if (kp <= 3) {
        return "status-good";
    }
    if (kp <= 5) {
        return "status-warning";
    }
    return "status-danger";
}

function getGnssKpLabel(kp) {
    if (kp <= 3) {
        return i18n.getMessage("preflightKpMinimal");
    }
    if (kp <= 5) {
        return i18n.getMessage("preflightKpDegraded");
    }
    return i18n.getMessage("preflightKpSevere");
}

function formatVisibility(vis) {
    if (vis >= 1000) {
        return `${(vis / 1000).toFixed(1)} km`;
    }
    return `${vis} m`;
}

function formatDuration(seconds) {
    if (!seconds) {
        return "-";
    }
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
}

function toFahrenheit(celsius) {
    if (celsius === null || celsius === undefined) {
        return "-";
    }
    return ((celsius * 9) / 5 + 32).toFixed(1);
}

function formatForecastDay(dateStr) {
    if (!dateStr) {
        return "-";
    }
    const d = new Date(`${dateStr}T12:00:00`);
    return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function getForecastRowClass(day) {
    const wind = Math.max(day.windMax || 0, day.gustsMax || 0);
    const precip = day.precipProbability || 0;
    if (wind >= 14 || precip > 80) {
        return "forecast-row-danger";
    }
    if (wind >= 11 || precip > 50) {
        return "forecast-row-warning";
    }
    if (wind >= 8 || precip > 30) {
        return "forecast-row-moderate";
    }
    return "";
}

export default defineComponent({
    name: "PreflightTab",
    components: {
        BaseTab,
        WikiButton,
        UiBox,
    },
    setup() {
        const preflight = reactive(usePreflight());
        const mapRef = ref(null);
        const mapContainerRef = ref(null);
        const mapInstance = ref(null);
        const activeLayer = ref("street");
        const isFullscreen = ref(false);
        const detectingLocation = ref(false);
        const locationError = ref(null);
        const manualLat = ref("");
        const manualLon = ref("");
        const selectedSavedIndex = ref(-1);
        const locationEditMode = ref(null);
        const saveLocationLabel = ref("");

        const hourlyColumns = computed(() => [
            { accessorKey: "time", header: i18n.getMessage("preflightTime") },
            { accessorKey: "windSpeed10m", header: i18n.getMessage("preflightWind10m") },
            { accessorKey: "windSpeed80m", header: i18n.getMessage("preflightWind80m") },
            { accessorKey: "windSpeed120m", header: i18n.getMessage("preflightWind120m") },
            { accessorKey: "windGusts", header: i18n.getMessage("preflightGustsShort") },
            { accessorKey: "precipitationProbability", header: i18n.getMessage("preflightRainProb") },
        ]);

        const forecastColumns = computed(() => [
            { accessorKey: "date", header: i18n.getMessage("preflightForecastDay") },
            { accessorKey: "weatherCode", header: i18n.getMessage("preflightForecastWeather") },
            { accessorKey: "tempMin", header: i18n.getMessage("preflightTempRange") },
            { accessorKey: "windMax", header: i18n.getMessage("preflightWind") },
            { accessorKey: "gustsMax", header: i18n.getMessage("preflightGusts") },
            { accessorKey: "precipProbability", header: i18n.getMessage("preflightRainProb") },
        ]);

        const savedLocationOptions = computed(() => {
            return preflight.savedLocations.map((loc, idx) => ({
                label: loc.label,
                value: idx,
            }));
        });

        const weatherDetailsColumns = computed(() => [
            { accessorKey: "label", header: "" },
            { id: "value", header: "" },
        ]);

        const weatherDetailsData = computed(() => {
            const c = preflight.weather.current;
            if (!c) {
                return [];
            }
            return [
                { key: "wind", label: i18n.getMessage("preflightWind") },
                {
                    key: "gusts",
                    label: i18n.getMessage("preflightGusts"),
                    value: `${c.windGusts.toFixed(1)} m/s`,
                    valueClass: getWindStatusClass(c.windGusts, c.windGusts),
                },
                {
                    key: "visibility",
                    label: i18n.getMessage("preflightVisibility"),
                    value: formatVisibility(c.visibility),
                    valueClass: getVisStatusClass(c.visibility),
                },
                {
                    key: "precipitation",
                    label: i18n.getMessage("preflightPrecipitation"),
                    value: `${c.precipitation} mm`,
                    valueClass: getPrecipStatusClass(c.precipitation),
                },
                { key: "dewPoint", label: i18n.getMessage("preflightDewPoint") },
                { key: "cloudCover", label: i18n.getMessage("preflightCloudCover"), value: `${c.cloudCover}%` },
                { key: "humidity", label: i18n.getMessage("preflightHumidity"), value: `${c.humidity}%` },
                { key: "feelsLike", label: i18n.getMessage("preflightFeelsLike") },
                { key: "pressure", label: i18n.getMessage("preflightPressure"), value: `${c.pressure} hPa` },
                {
                    key: "batteryRisk",
                    label: i18n.getMessage("preflightBatteryRisk"),
                    value: i18n.getMessage(preflight.getBatteryTempStatus(c.temperature).label),
                    valueClass: preflight.getBatteryTempStatus(c.temperature).cssClass,
                },
                {
                    key: "fogRisk",
                    label: i18n.getMessage("preflightFogRisk"),
                    value: i18n.getMessage(
                        preflight.getFogRisk(c.temperature, c.dewPoint, c.humidity, c.windSpeed).label,
                    ),
                    valueClass: preflight.getFogRisk(c.temperature, c.dewPoint, c.humidity, c.windSpeed).cssClass,
                },
            ];
        });

        const stormScalesColumns = computed(() => [
            { accessorKey: "label", header: "" },
            { id: "value", header: "" },
        ]);

        const stormScalesData = computed(() => {
            const s = preflight.solar.stormLevel;
            if (!s) {
                return [];
            }
            return [
                {
                    label: i18n.getMessage("preflightGeoStorm"),
                    value: `G${s.geoStorm}`,
                    valueClass: getStormClass(s.geoStorm),
                },
                {
                    label: i18n.getMessage("preflightSolarRadiation"),
                    value: `S${s.solarRadiation}`,
                    valueClass: getStormClass(s.solarRadiation),
                },
                {
                    label: i18n.getMessage("preflightRadioBlackout"),
                    value: `R${s.radioBlackout}`,
                    valueClass: getStormClass(s.radioBlackout),
                },
            ];
        });

        const gnssInfoColumns = computed(() => [
            { accessorKey: "label", header: "" },
            { id: "value", header: "" },
        ]);

        const gnssInfoData = computed(() => {
            const loc = preflight.location;
            const rows = [
                {
                    label: i18n.getMessage("preflightCoordinates"),
                    value: loc.latitude !== null ? `${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}` : "-",
                },
                {
                    label: i18n.getMessage("preflightElevation"),
                    value: loc.elevation !== null ? `${loc.elevation} m AMSL` : "-",
                },
            ];
            if (densityAltitude.value !== null) {
                rows.push({
                    label: i18n.getMessage("preflightDensityAlt"),
                    value: `${densityAltitude.value} ft (${Math.round(densityAltitude.value * 0.3048)} m)`,
                    valueClass: getDensityAltStatusClass(),
                });
            }
            rows.push(
                {
                    label: i18n.getMessage("preflightKpEffect"),
                    value: preflight.solar.kpIndex !== null ? getGnssKpLabel(preflight.solar.kpIndex) : "-",
                    valueClass: preflight.solar.kpIndex !== null ? getGnssKpClass(preflight.solar.kpIndex) : "",
                },
                {
                    label: i18n.getMessage("preflightGPSRescue"),
                    value: getGpsRescueLabel(),
                    valueClass: getGpsRescueClass(),
                },
                {
                    label: i18n.getMessage("preflightMagDeclination"),
                    value: preflight.mag.declination !== null ? `${preflight.mag.declination.toFixed(2)}°` : "-",
                },
                {
                    label: i18n.getMessage("preflightMagInclination"),
                    value: preflight.mag.inclination !== null ? `${preflight.mag.inclination.toFixed(2)}°` : "-",
                },
            );
            return rows;
        });

        const isManualLocationValid = computed(() => {
            const lat = Number.parseFloat(manualLat.value);
            const lon = Number.parseFloat(manualLon.value);
            return !Number.isNaN(lat) && !Number.isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
        });

        const civilTwilightStart = computed(() => {
            if (!preflight.civilTwilight) {
                return "-";
            }
            return preflight.civilTwilight.dawn.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        });

        const civilTwilightEnd = computed(() => {
            if (!preflight.civilTwilight) {
                return "-";
            }
            return preflight.civilTwilight.dusk.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        });

        const civilTwilightStatus = computed(() => {
            if (!preflight.civilTwilight) {
                return "";
            }
            const now = new Date();
            return now >= preflight.civilTwilight.dawn && now <= preflight.civilTwilight.dusk
                ? "status-good"
                : "status-danger";
        });

        const densityAltitude = computed(() => {
            if (!preflight.weather.current || preflight.location.elevation === null) {
                return null;
            }
            return preflight.getDensityAltitude(
                preflight.location.elevation,
                preflight.weather.current.pressure,
                preflight.weather.current.temperature,
            );
        });

        function getDensityAltStatusClass() {
            return preflight.getDensityAltitudeStatus(densityAltitude.value).cssClass;
        }

        const airspaceExplorerLink = computed(() => {
            if (preflight.location.latitude === null) {
                return "#";
            }
            return `https://skyvector.com/?ll=${preflight.location.latitude},${preflight.location.longitude}&chart=301&zoom=2`;
        });

        const droneSafetyMapLink = computed(() => {
            if (preflight.location.latitude === null) {
                return "#";
            }
            return `https://dronesafetymap.com/?lat=${preflight.location.latitude}&lng=${preflight.location.longitude}&zoom=13`;
        });

        const notamLink = computed(() => {
            return "https://notams.aim.faa.gov/notamSearch/";
        });

        const notamEuLink = computed(() => {
            return "https://www.ead.eurocontrol.int/cms-eadbasic/opencms/en/ead-operations/data-maintenance/notam-availability-ino/";
        });

        const showIpConsent = ref(false);

        async function detectLocation() {
            if (detectingLocation.value) {
                return;
            }
            detectingLocation.value = true;
            locationError.value = null;
            showIpConsent.value = false;
            try {
                await preflight.useGeolocation();
                manualLat.value = String(preflight.location.latitude);
                manualLon.value = String(preflight.location.longitude);
                await preflight.refreshAll();
                updateMapPosition();
            } catch (err) {
                if (err.message === preflight.IP_CONSENT_NEEDED) {
                    showIpConsent.value = true;
                } else {
                    locationError.value = i18n.getMessage("preflightGeolocationFailed");
                }
            } finally {
                detectingLocation.value = false;
            }
        }

        async function allowIpGeolocation() {
            preflight.setIpGeolocationConsent(true);
            showIpConsent.value = false;
            detectingLocation.value = true;
            locationError.value = null;
            try {
                await preflight.useIpGeolocationFallback();
                manualLat.value = String(preflight.location.latitude);
                manualLon.value = String(preflight.location.longitude);
                await preflight.refreshAll();
                updateMapPosition();
            } catch {
                locationError.value = i18n.getMessage("preflightGeolocationFailed");
            } finally {
                detectingLocation.value = false;
            }
        }

        function denyIpGeolocation() {
            showIpConsent.value = false;
            locationError.value = i18n.getMessage("preflightGeolocationFailed");
        }

        async function applyManualLocation() {
            if (!isManualLocationValid.value) {
                return;
            }
            locationError.value = null;
            preflight.setManualLocation(Number.parseFloat(manualLat.value), Number.parseFloat(manualLon.value));
            await preflight.refreshAll();
            updateMapPosition();
        }

        async function refreshData() {
            if (preflight.isLoading) {
                return;
            }
            await preflight.refreshAll();
        }

        async function loadSavedLocation() {
            if (selectedSavedIndex.value < 0) {
                return;
            }
            const loc = preflight.applySavedLocation(selectedSavedIndex.value);
            if (loc) {
                manualLat.value = String(loc.latitude);
                manualLon.value = String(loc.longitude);
                locationError.value = null;
                await preflight.refreshAll();
                updateMapPosition();
            }
        }

        function showSaveDialog() {
            if (
                preflight.location.latitude === null ||
                preflight.savedLocations.length >= preflight.MAX_SAVED_LOCATIONS
            ) {
                return;
            }
            saveLocationLabel.value = "";
            locationEditMode.value = "save";
        }

        function showRenameDialog() {
            if (selectedSavedIndex.value < 0) {
                return;
            }
            saveLocationLabel.value = preflight.savedLocations[selectedSavedIndex.value].label;
            locationEditMode.value = "rename";
        }

        function confirmSaveLocation() {
            if (!saveLocationLabel.value.trim()) {
                return;
            }
            const success = preflight.saveCurrentLocation(saveLocationLabel.value);
            if (success) {
                locationEditMode.value = null;
                saveLocationLabel.value = "";
                selectedSavedIndex.value = preflight.savedLocations.length - 1;
            }
        }

        function confirmRenameLocation() {
            if (!saveLocationLabel.value.trim()) {
                return;
            }
            const success = preflight.renameSavedLocation(selectedSavedIndex.value, saveLocationLabel.value);
            if (success) {
                locationEditMode.value = null;
                saveLocationLabel.value = "";
            }
        }

        function cancelEditMode() {
            locationEditMode.value = null;
            saveLocationLabel.value = "";
        }

        function deleteSelectedLocation() {
            if (selectedSavedIndex.value < 0) {
                return;
            }
            preflight.deleteSavedLocation(selectedSavedIndex.value);
            selectedSavedIndex.value = -1;
        }

        let olCssLoaded = false;

        function initializeMap() {
            if (mapInstance.value || !mapRef.value) {
                return;
            }
            if (!olCssLoaded) {
                import("ol/ol.css");
                olCssLoaded = true;
            }
            mapInstance.value = initMap({
                target: mapRef.value,
                defaultLayer: activeLayer.value,
                defaultZoom: 13,
            });
            setLayer(activeLayer.value);
        }

        function updateMapPosition() {
            if (preflight.location.latitude === null || preflight.location.longitude === null) {
                return;
            }
            nextTick(() => {
                initializeMap();
                if (!mapInstance.value) {
                    return;
                }
                const center = fromLonLat([preflight.location.longitude, preflight.location.latitude]);
                mapInstance.value.mapView.setCenter(center);
                mapInstance.value.iconGeometry.setCoordinates(center);
                mapInstance.value.iconFeature.setStyle(mapInstance.value.iconStyleGPS);
                mapInstance.value.map.updateSize();
            });
        }

        function setLayer(layerKey) {
            if (!mapInstance.value?.layers) {
                return;
            }
            Object.entries(mapInstance.value.layers).forEach(([key, layer]) => {
                layer.setVisible(key === layerKey);
            });
            activeLayer.value = layerKey;
            nextTick(() => mapInstance.value?.map?.updateSize());
        }

        function zoomIn() {
            if (!mapInstance.value?.mapView) {
                return;
            }
            mapInstance.value.mapView.setZoom(mapInstance.value.mapView.getZoom() + 1);
        }

        function zoomOut() {
            if (!mapInstance.value?.mapView) {
                return;
            }
            mapInstance.value.mapView.setZoom(mapInstance.value.mapView.getZoom() - 1);
        }

        function toggleFullscreen() {
            const container = mapContainerRef.value;
            if (!container) {
                return;
            }
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

        function getWindStatusClass(speed, gusts) {
            return preflight.getWindStatus(speed, gusts).cssClass;
        }

        function getVisStatusClass(vis) {
            return preflight.getVisibilityStatus(vis).cssClass;
        }

        function getPrecipStatusClass(precip) {
            return preflight.getPrecipitationStatus(precip).cssClass;
        }

        function getGpsRescueClass() {
            if (preflight.solar.kpIndex === null) {
                return "";
            }
            if (preflight.solar.kpIndex <= 4) {
                return "status-good";
            }
            if (preflight.solar.kpIndex <= 5) {
                return "status-warning";
            }
            return "status-danger";
        }

        function getGpsRescueLabel() {
            if (preflight.solar.kpIndex === null) {
                return i18n.getMessage("preflightGpsRescueUnknown");
            }
            if (preflight.solar.kpIndex <= 4) {
                return i18n.getMessage("preflightGpsRescueReliable");
            }
            if (preflight.solar.kpIndex <= 5) {
                return i18n.getMessage("preflightGpsRescueUnreliable");
            }
            return i18n.getMessage("preflightGpsRescueNotRecommended");
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
            civilTwilightStart,
            civilTwilightEnd,
            civilTwilightStatus,
            densityAltitude,
            getDensityAltStatusClass,
            airspaceExplorerLink,
            droneSafetyMapLink,
            notamLink,
            notamEuLink,
            hourlyColumns,
            forecastColumns,
            savedLocationOptions,
            weatherDetailsColumns,
            weatherDetailsData,
            stormScalesColumns,
            stormScalesData,
            gnssInfoColumns,
            gnssInfoData,
            selectedSavedIndex,
            locationEditMode,
            saveLocationLabel,
            showIpConsent,
            detectLocation,
            allowIpGeolocation,
            denyIpGeolocation,
            applyManualLocation,
            refreshData,
            loadSavedLocation,
            showSaveDialog,
            showRenameDialog,
            confirmSaveLocation,
            confirmRenameLocation,
            cancelEditMode,
            deleteSelectedLocation,
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
            toFahrenheit,
            getUvStatusClass,
            getUvStatusLabel,
            formatForecastDay,
            getForecastRowClass,
        };
    },
});
</script>

<style lang="less">
.tab-preflight {
    .preflight-tab {
        padding-bottom: 10px;
    }

    /* Location Bar */
    .location-bar {
        .default_btn {
            width: auto;
            float: none;
            margin-bottom: 0;
            a {
                padding: 0.35rem 0.75rem;
                white-space: nowrap;
                em {
                    margin-right: 4px;
                }
            }
        }

        .location-inputs {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;

            .location-or {
                color: var(--surface-700);
                font-size: 12px;
            }

            .location-input {
                width: 120px;
                padding: 4px 8px;
                border: 1px solid var(--surface-500);
                border-radius: 3px;
                background: var(--surface-200);
                color: var(--text);
            }

            .manual-entry-group {
                display: flex;
                align-items: center;
                gap: 8px;
                flex-shrink: 0;
            }
        }

        .saved-locations-row {
            display: flex;
            align-items: center;
            gap: 4px;
            margin-top: 8px;

            .saved-loc-btn {
                a {
                    padding: 0.35rem 0.5rem;
                    em {
                        margin-right: 0;
                    }
                }
            }

            .save-entry-group {
                display: flex;
                align-items: center;
                gap: 4px;
                flex-shrink: 0;

                .save-label-input {
                    width: 220px;
                }
            }
        }

        .location-status {
            margin-top: 8px;
            color: var(--primary-500);
            font-weight: bold;
            em {
                margin-right: 4px;
            }
            .location-source {
                color: var(--surface-600);
                font-weight: normal;
                font-size: 11px;
            }
        }

        .location-error {
            margin-top: 8px;
            color: #e74c3c;
            em {
                margin-right: 4px;
            }
        }

        .ip-consent-prompt {
            margin-top: 8px;
            padding: 8px 12px;
            background: var(--surface-200, #fff8e1);
            border: 1px solid var(--surface-400, #ffe082);
            border-radius: 4px;
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
            font-size: 12px;

            > em {
                color: #b8860b;
                flex-shrink: 0;
            }

            .ip-consent-actions {
                display: flex;
                gap: 6px;
                margin-left: auto;
            }
        }
    }

    /* Launch Status Banner */
    .launch-status-banner {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 16px;
        padding: 12px 20px;
        margin: 10px 0;
        border-radius: 6px;
        font-weight: bold;
        transition: background-color 0.3s;

        &.status-good {
            background: linear-gradient(135deg, #1e8449, #27ae60);
            color: #fff;
        }
        &.status-moderate {
            background: linear-gradient(135deg, #b7770a, #d4ac0d);
            color: #000;
        }
        &.status-warning {
            background: linear-gradient(135deg, #a35309, #b7770a);
            color: #fff;
        }
        &.status-danger {
            background: linear-gradient(135deg, #922b21, #c0392b);
            color: #fff;
        }
        &.status-unknown {
            background: var(--surface-400);
            color: var(--text);
        }

        .launch-status-label {
            font-size: 13px;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .launch-status-value {
            font-size: 22px;
            letter-spacing: 2px;
        }

        .refresh-btn {
            width: auto;
            float: none;
            margin-left: auto;
            margin-bottom: 0;
            a {
                background: rgba(0, 0, 0, 0.1);
                border: 1px solid rgba(0, 0, 0, 0.2);
                color: inherit;
                padding: 0.35rem 0.75rem;
                white-space: nowrap;
                &:hover {
                    background: rgba(0, 0, 0, 0.2);
                    color: inherit;
                }
                em {
                    margin-right: 4px;
                }
            }
        }
    }

    /* Launch Checks Breakdown */
    .launch-checks {
        display: flex;
        justify-content: center;
        gap: 16px;
        font-size: 12px;
        padding: 6px 0;

        .launch-check-item {
            display: flex;
            align-items: center;
            gap: 4px;

            em {
                font-size: 11px;
            }
        }
    }

    /* Status classes for values — WCAG AA compliant on light backgrounds */
    .status-good {
        color: #1e8449;
        font-weight: bold;
    }
    .status-moderate {
        color: #b7770a;
        font-weight: bold;
    }
    .status-warning {
        color: #a35309;
        font-weight: bold;
    }
    .status-danger {
        color: #c0392b;
        font-weight: bold;
    }
    .status-unknown {
        color: var(--surface-600);
    }

    /* Weather */
    .weather-grid {
        .weather-main {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 0;
            margin-bottom: 8px;
            border-bottom: 1px solid var(--surface-400);

            .weather-condition {
                display: flex;
                align-items: center;
                gap: 8px;
                .weather-icon {
                    font-size: 28px;
                }
                .weather-desc {
                    font-size: 14px;
                    font-weight: 500;
                }
            }

            .weather-temp {
                font-size: 24px;
                font-weight: bold;
                color: var(--primary-500);
            }
        }
    }

    /* Flight Window */
    .flight-window-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 10px;

        .flight-window-item {
            text-align: center;
            padding: 8px;
            background: var(--surface-200);
            border-radius: 4px;

            .fw-label {
                font-size: 11px;
                color: var(--surface-600);
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin-bottom: 4px;
            }

            .fw-value {
                font-size: 16px;
                font-weight: bold;

                .fw-sublabel {
                    display: block;
                    font-size: 11px;
                    font-weight: normal;
                    margin-top: 2px;
                }
            }
        }
    }

    /* Status badge (inline) */
    .status-badge {
        font-size: 11px;
        margin-left: 6px;
    }

    .table-note {
        font-size: 11px;
        color: var(--surface-600);
        margin-top: 4px;
        text-align: right;
    }

    /* 5-Day Forecast row highlights (applied via UTable meta.class.tr) */
    .forecast-row-danger {
        background: rgba(192, 57, 43, 0.1) !important;
    }
    .forecast-row-warning {
        background: rgba(163, 83, 9, 0.1) !important;
    }
    .forecast-row-moderate {
        background: rgba(183, 119, 10, 0.08) !important;
    }

    /* Solar Activity */
    .solar-info {
        .kp-display {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 12px;

            .kp-value {
                font-size: 28px;
                font-weight: bold;
                padding: 4px 12px;
                border-radius: 6px;

                &.status-good {
                    background: rgba(30, 132, 73, 0.15);
                }
                &.status-moderate {
                    background: rgba(183, 119, 10, 0.15);
                }
                &.status-warning {
                    background: rgba(163, 83, 9, 0.15);
                }
                &.status-danger {
                    background: rgba(192, 57, 43, 0.15);
                }
            }

            .kp-label {
                font-size: 14px;
                color: var(--surface-700);
            }
        }

        .kp-scale {
            margin-bottom: 12px;

            .kp-bar {
                height: 8px;
                background: var(--surface-400);
                border-radius: 4px;
                overflow: hidden;

                .kp-fill {
                    height: 100%;
                    border-radius: 4px;
                    transition: width 0.5s ease;

                    &.status-good {
                        background: #1e8449;
                    }
                    &.status-moderate {
                        background: #b7770a;
                    }
                    &.status-warning {
                        background: #a35309;
                    }
                    &.status-danger {
                        background: #c0392b;
                    }
                }
            }

            .kp-scale-labels {
                display: flex;
                justify-content: space-between;
                font-size: 10px;
                color: var(--surface-600);
                margin-top: 2px;
            }
        }

        .storm-scales {
            margin-bottom: 8px;
        }

        .solar-timestamp {
            font-size: 11px;
            color: var(--surface-600);
            margin-top: 8px;
        }
    }

    /* GNSS */
    .gnss-info {
        p {
            font-size: 12px;
            color: var(--surface-700);
            margin-bottom: 8px;
        }

        .gnss-links {
            margin-top: 10px;
            a {
                color: var(--primary-500);
                text-decoration: none;
                font-size: 12px;
                &:hover {
                    text-decoration: underline;
                }
                em {
                    margin-right: 4px;
                    font-size: 10px;
                }
            }
        }
    }

    /* Airspace */
    .airspace-info {
        p {
            font-size: 12px;
            color: var(--surface-700);
            margin-bottom: 10px;
        }

        .airspace-links {
            display: flex;
            flex-direction: column;
            gap: 8px;

            .airspace-link {
                display: flex;
                align-items: center;
                padding: 8px 12px;
                background: var(--surface-200);
                border: 1px solid var(--surface-400);
                border-radius: 4px;
                color: var(--primary-500);
                text-decoration: none;
                font-size: 13px;
                transition: background 0.2s;

                &:hover {
                    background: var(--surface-300);
                }

                em {
                    margin-right: 8px;
                    width: 16px;
                    text-align: center;
                }
            }
        }
    }

    /* Map */
    .preflight-map-box {
        .preflight-map-container {
            position: relative;
            padding: 0 !important;

            // stylelint-disable-next-line selector-pseudo-class-no-unknown
            &:fullscreen,
            &:-webkit-full-screen {
                .fullscreen-map-styles();
            }
        }

        .preflight-map {
            width: 100%;
            height: 400px;
        }

        .controls {
            position: absolute;
            top: 8px;
            right: 8px;
            display: flex;
            flex-direction: column;
            gap: 2px;
            z-index: 10;

            button {
                width: 28px;
                height: 28px;
                border: 1px solid var(--surface-500);
                background: var(--surface-100);
                color: var(--text);
                cursor: pointer;
                font-size: 12px;
                font-weight: bold;
                border-radius: 3px;

                &:hover {
                    background: var(--primary-500);
                    color: #fff;
                }

                &.active {
                    background: var(--primary-500);
                    color: #fff;
                }
            }
        }

        // Fullscreen styles (mixin)
        .fullscreen-map-styles() {
            width: 100vw !important;
            height: 100vh !important;
            background-color: var(--surface-100);
            .preflight-map {
                height: calc(100vh - var(--map-controls-bar-height, 33px)) !important;
                width: 100vw !important;
            }
            .controls {
                position: fixed;
                bottom: 0;
                left: 0;
                width: 100vw !important;
                z-index: 1000;
                flex-direction: row;
                top: auto;
                right: auto;
                justify-content: center;
                gap: 4px;
                padding: 4px;
                background: var(--surface-200);
            }
        }
    }

    /* Misc */
    .error-message {
        color: #e74c3c;
        padding: 8px;
        em {
            margin-right: 4px;
        }
    }

    .no-data {
        color: var(--surface-600);
        text-align: center;
        padding: 20px;
        font-style: italic;
    }

    .loading-placeholder {
        text-align: center;
        padding: 20px;
        color: var(--surface-600);
    }

    .preflight-attribution {
        text-align: center;
        font-size: 10px;
        color: var(--surface-600);
        margin-top: 12px;
        padding: 4px;
    }
}
</style>
