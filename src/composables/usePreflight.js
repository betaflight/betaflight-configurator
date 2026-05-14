import { reactive, computed, ref } from "vue";
import geomagnetism from "geomagnetism";
import SunCalc from "suncalc";
import { get as getConfig, set as setConfig } from "../js/ConfigStorage";
import { ispConnected } from "../js/utils/connection";

const SAVED_LOCATIONS_KEY = "preflight_saved_locations";
const IP_GEOLOCATION_CONSENT_KEY = "preflight_ip_geolocation_consent";
const MAX_SAVED_LOCATIONS = 5;
const MAX_LABEL_LENGTH = 20;

const WMO_CODES = {
    0: "preflightWmoClearSky",
    1: "preflightWmoMainlyClear",
    2: "preflightWmoPartlyCloudy",
    3: "preflightWmoOvercast",
    45: "preflightWmoFog",
    48: "preflightWmoRimeFog",
    51: "preflightWmoLightDrizzle",
    53: "preflightWmoModerateDrizzle",
    55: "preflightWmoDenseDrizzle",
    56: "preflightWmoLightFreezingDrizzle",
    57: "preflightWmoDenseFreezingDrizzle",
    61: "preflightWmoSlightRain",
    63: "preflightWmoModerateRain",
    65: "preflightWmoHeavyRain",
    66: "preflightWmoLightFreezingRain",
    67: "preflightWmoHeavyFreezingRain",
    71: "preflightWmoSlightSnow",
    73: "preflightWmoModerateSnow",
    75: "preflightWmoHeavySnow",
    77: "preflightWmoSnowGrains",
    80: "preflightWmoSlightRainShowers",
    81: "preflightWmoModerateRainShowers",
    82: "preflightWmoViolentRainShowers",
    85: "preflightWmoSlightSnowShowers",
    86: "preflightWmoHeavySnowShowers",
    95: "preflightWmoThunderstorm",
    96: "preflightWmoThunderstormSlightHail",
    99: "preflightWmoThunderstormHeavyHail",
};

const WIND_DIRECTION_LABELS = [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
];

function getWindDirectionLabel(deg) {
    if (deg === null || deg === undefined) {
        return "";
    }
    return WIND_DIRECTION_LABELS[Math.round(deg / 22.5) % 16];
}

function getKpStatus(kp) {
    if (kp === null || kp === undefined) {
        return { level: "unknown", label: "preflightLevelUnknown", cssClass: "status-unknown" };
    }
    if (kp <= 2) {
        return { level: "good", label: "preflightKpLow", cssClass: "status-good" };
    }
    if (kp <= 4) {
        return { level: "moderate", label: "preflightKpModerate", cssClass: "status-moderate" };
    }
    if (kp <= 5) {
        return { level: "warning", label: "preflightKpElevated", cssClass: "status-warning" };
    }
    return { level: "danger", label: "preflightKpStorm", cssClass: "status-danger" };
}

function getWindStatus(windSpeed, gusts) {
    const maxWind = Math.max(windSpeed || 0, gusts || 0);
    if (maxWind < 5) {
        return { level: "good", label: "preflightWindCalm", cssClass: "status-good" };
    }
    if (maxWind < 8) {
        return { level: "good", label: "preflightWindLight", cssClass: "status-good" };
    }
    if (maxWind < 11) {
        return { level: "moderate", label: "preflightWindModerate", cssClass: "status-moderate" };
    }
    if (maxWind < 14) {
        return { level: "warning", label: "preflightWindStrong", cssClass: "status-warning" };
    }
    return { level: "danger", label: "preflightWindDangerous", cssClass: "status-danger" };
}

function getVisibilityStatus(vis) {
    if (vis === null || vis === undefined) {
        return { level: "unknown", label: "preflightLevelUnknown", cssClass: "status-unknown" };
    }
    if (vis >= 10000) {
        return { level: "good", label: "preflightVisExcellent", cssClass: "status-good" };
    }
    if (vis >= 5000) {
        return { level: "good", label: "preflightVisGood", cssClass: "status-good" };
    }
    if (vis >= 1000) {
        return { level: "moderate", label: "preflightVisReduced", cssClass: "status-moderate" };
    }
    return { level: "danger", label: "preflightVisPoor", cssClass: "status-danger" };
}

function getPrecipitationStatus(precip) {
    if (precip === null || precip === undefined || precip === 0) {
        return { level: "good", label: "preflightPrecipNone", cssClass: "status-good" };
    }
    if (precip < 1) {
        return { level: "moderate", label: "preflightPrecipLight", cssClass: "status-moderate" };
    }
    if (precip < 5) {
        return { level: "warning", label: "preflightPrecipModerate", cssClass: "status-warning" };
    }
    return { level: "danger", label: "preflightPrecipHeavy", cssClass: "status-danger" };
}

function getBatteryTempStatus(temp) {
    if (temp === null || temp === undefined) {
        return { level: "unknown", label: "preflightLevelUnknown", cssClass: "status-unknown" };
    }
    if (temp > 50) {
        return { level: "danger", label: "preflightBatteryExtreme", cssClass: "status-danger" };
    }
    if (temp > 40) {
        return { level: "warning", label: "preflightBatteryHot", cssClass: "status-warning" };
    }
    if (temp < 0) {
        return { level: "danger", label: "preflightBatteryCold", cssClass: "status-danger" };
    }
    if (temp < 10) {
        return { level: "warning", label: "preflightBatteryCool", cssClass: "status-warning" };
    }
    return { level: "good", label: "preflightBatteryOk", cssClass: "status-good" };
}

function getDensityAltitude(elevationMeters, pressure, temp) {
    if (elevationMeters === null || pressure === null || temp === null) {
        return null;
    }
    const elevationFeet = elevationMeters * 3.28084;
    const pressureAltitudeFeet = (1013.25 - pressure) * 30 + elevationFeet;
    const isaTemp = 15 - (2 * elevationFeet) / 1000;
    return Math.round(pressureAltitudeFeet + 120 * (temp - isaTemp));
}

function getDensityAltitudeStatus(da) {
    if (da === null || da === undefined) {
        return { level: "unknown", label: "preflightLevelUnknown", cssClass: "status-unknown" };
    }
    if (da < 3281) {
        return { level: "good", label: "preflightDaNormal", cssClass: "status-good" };
    }
    if (da < 6562) {
        return { level: "moderate", label: "preflightDaReduced", cssClass: "status-moderate" };
    }
    if (da < 9843) {
        return { level: "warning", label: "preflightDaLow", cssClass: "status-warning" };
    }
    return { level: "danger", label: "preflightDaPoor", cssClass: "status-danger" };
}

function getFogRisk(temp, dewPoint, humidity, windSpeed) {
    if (temp === null || dewPoint === null || humidity === null) {
        return { level: "unknown", label: "preflightLevelUnknown", cssClass: "status-unknown" };
    }
    const spread = temp - dewPoint;
    if (spread < 2 && humidity > 95 && (windSpeed || 0) < 3) {
        return { level: "danger", label: "preflightFogHigh", cssClass: "status-danger" };
    }
    if (spread < 4 && humidity > 90) {
        return { level: "warning", label: "preflightFogModerate", cssClass: "status-warning" };
    }
    if (spread < 6 && humidity > 85) {
        return { level: "moderate", label: "preflightFogLow", cssClass: "status-moderate" };
    }
    return { level: "good", label: "preflightFogUnlikely", cssClass: "status-good" };
}

function geolocateWithOptions(options) {
    return new Promise((resolve, reject) => {
        // prettier-ignore
        navigator.geolocation.getCurrentPosition( // NOSONAR - user-initiated, required for preflight location
            (position) => {
                resolve({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                });
            },
            (err) => reject(new Error(err.message || "Geolocation failed")),
            options,
        );
    });
}

async function browserGeolocation() {
    if (!navigator.geolocation) {
        throw new Error("Geolocation not supported");
    }
    try {
        return await geolocateWithOptions({ enableHighAccuracy: true, timeout: 3000 });
    } catch {
        return geolocateWithOptions({ enableHighAccuracy: false, timeout: 3000 });
    }
}

function isValidCoordinate(lat, lon) {
    return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

async function ipGeolocation() {
    const response = await fetch("https://ipapi.co/json/");
    if (!response.ok) {
        throw new Error("IP geolocation request failed");
    }
    const data = await response.json();
    if (data.latitude === undefined || data.longitude === undefined) {
        throw new Error("IP geolocation returned no coordinates");
    }
    const lat = Number.parseFloat(data.latitude);
    const lon = Number.parseFloat(data.longitude);
    if (!isValidCoordinate(lat, lon)) {
        throw new Error("IP geolocation returned invalid or out-of-range coordinates");
    }
    return { latitude: lat, longitude: lon };
}

function getDewPointRisk(temp, dewPoint) {
    if (temp === null || dewPoint === null || temp === undefined || dewPoint === undefined) {
        return { level: "unknown", label: "preflightLevelUnknown", cssClass: "status-unknown" };
    }
    const spread = temp - dewPoint;
    if (spread > 10) {
        return { level: "good", label: "preflightDewNoRisk", cssClass: "status-good" };
    }
    if (spread > 4) {
        return { level: "moderate", label: "preflightDewLowRisk", cssClass: "status-moderate" };
    }
    if (spread > 2) {
        return { level: "warning", label: "preflightDewFogLikely", cssClass: "status-warning" };
    }
    return { level: "danger", label: "preflightDewFogExpected", cssClass: "status-danger" };
}

function getUvStatus(uv) {
    if (uv === null || uv === undefined) {
        return { level: "unknown", label: "preflightLevelUnknown", cssClass: "status-unknown" };
    }
    if (uv < 3) {
        return { level: "good", label: "preflightUvLow", cssClass: "status-good" };
    }
    if (uv < 6) {
        return { level: "moderate", label: "preflightUvModerate", cssClass: "status-moderate" };
    }
    if (uv < 8) {
        return { level: "warning", label: "preflightUvHigh", cssClass: "status-warning" };
    }
    return { level: "danger", label: "preflightUvVeryHigh", cssClass: "status-danger" };
}

function formatTime(isoString) {
    if (!isoString) {
        return "-";
    }
    const match = /T(\d{2}:\d{2})/.exec(String(isoString));
    return match ? match[1] : "-";
}

// ── Module-scoped singleton state ──────────────────────────────────────────────

const location = reactive({
    latitude: null,
    longitude: null,
    elevation: null,
    name: "",
    source: "",
});

const weather = reactive({
    loading: false,
    error: null,
    current: null,
    hourly: null,
    daily: null,
    forecast: null,
    lastUpdated: null,
});

const mag = reactive({
    declination: null,
    inclination: null,
});

const solar = reactive({
    loading: false,
    error: null,
    kpIndex: null,
    kpTimestamp: null,
    stormLevel: null,
    lastUpdated: null,
});

const savedLocations = reactive([]);

let weatherRequestId = 0;
let solarRequestId = 0;
let elevationRequestId = 0;

function loadSavedLocations() {
    const stored = getConfig(SAVED_LOCATIONS_KEY);
    const locations = stored[SAVED_LOCATIONS_KEY];
    savedLocations.length = 0;
    if (!Array.isArray(locations)) {
        return;
    }
    for (const loc of locations) {
        if (savedLocations.length >= MAX_SAVED_LOCATIONS) {
            break;
        }
        if (!loc || typeof loc !== "object") {
            continue;
        }
        const lat = Number.parseFloat(loc.latitude);
        const lon = Number.parseFloat(loc.longitude);
        const label = String(loc.label || "").trim();
        if (!isValidCoordinate(lat, lon) || label.length === 0) {
            continue;
        }
        savedLocations.push({ label, latitude: lat, longitude: lon });
    }
}

function persistSavedLocations() {
    const obj = {};
    obj[SAVED_LOCATIONS_KEY] = [...savedLocations];
    setConfig(obj);
}

function saveCurrentLocation(label) {
    if (location.latitude === null || location.longitude === null) {
        return false;
    }
    const trimmedLabel = String(label).trim().slice(0, MAX_LABEL_LENGTH);
    if (trimmedLabel.length === 0) {
        return false;
    }
    if (savedLocations.length >= MAX_SAVED_LOCATIONS) {
        return false;
    }
    savedLocations.push({
        label: trimmedLabel,
        latitude: location.latitude,
        longitude: location.longitude,
    });
    persistSavedLocations();
    return true;
}

function isActiveSavedLocation(entry) {
    return (
        location.source === "saved" &&
        location.latitude === entry.latitude &&
        location.longitude === entry.longitude &&
        location.name === entry.label
    );
}

function renameSavedLocation(index, newLabel) {
    if (index < 0 || index >= savedLocations.length) {
        return false;
    }
    const trimmed = String(newLabel).trim().slice(0, MAX_LABEL_LENGTH);
    if (trimmed.length === 0) {
        return false;
    }
    const entry = savedLocations[index];
    const isActive = isActiveSavedLocation(entry);
    entry.label = trimmed;
    if (isActive) {
        location.name = trimmed;
    }
    persistSavedLocations();
    return true;
}

function deleteSavedLocation(index) {
    if (index < 0 || index >= savedLocations.length) {
        return;
    }
    const entry = savedLocations[index];
    const isActive = isActiveSavedLocation(entry);
    savedLocations.splice(index, 1);
    if (isActive) {
        location.source = "manual";
        location.name = `${entry.latitude.toFixed(4)}, ${entry.longitude.toFixed(4)}`;
    }
    persistSavedLocations();
}

function applySavedLocation(index) {
    if (index < 0 || index >= savedLocations.length) {
        return null;
    }
    const loc = savedLocations[index];
    setManualLocation(loc.latitude, loc.longitude);
    location.name = loc.label;
    location.source = "saved";
    return loc;
}

const isLoading = computed(() => weather.loading || solar.loading);

async function fetchWeather(lat, lon) {
    const requestId = ++weatherRequestId;
    weather.loading = true;
    weather.error = null;
    weather.current = null;
    weather.hourly = null;
    weather.daily = null;
    weather.forecast = null;
    try {
        const params = new URLSearchParams({
            latitude: lat,
            longitude: lon,
            current: [
                "temperature_2m",
                "relative_humidity_2m",
                "dew_point_2m",
                "apparent_temperature",
                "precipitation",
                "rain",
                "wind_speed_10m",
                "wind_direction_10m",
                "wind_gusts_10m",
                "cloud_cover",
                "visibility",
                "weather_code",
                "pressure_msl",
                "is_day",
            ].join(","),
            hourly: [
                "wind_speed_10m",
                "wind_speed_80m",
                "wind_speed_120m",
                "wind_gusts_10m",
                "precipitation_probability",
                "visibility",
                "cloud_cover",
                "temperature_2m",
                "dew_point_2m",
            ].join(","),
            daily: [
                "sunrise",
                "sunset",
                "daylight_duration",
                "uv_index_max",
                "temperature_2m_max",
                "temperature_2m_min",
                "weather_code",
                "wind_speed_10m_max",
                "wind_gusts_10m_max",
                "precipitation_probability_max",
            ].join(","),
            wind_speed_unit: "ms",
            forecast_hours: 12,
            forecast_days: 5,
            timezone: "auto",
        });

        const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
        if (!response.ok) {
            throw new Error(`Weather API error: ${response.status}`);
        }
        const data = await response.json();

        if (requestId !== weatherRequestId) {
            return;
        }

        weather.current = {
            temperature: data.current.temperature_2m,
            humidity: data.current.relative_humidity_2m,
            dewPoint: data.current.dew_point_2m,
            apparentTemperature: data.current.apparent_temperature,
            precipitation: data.current.precipitation,
            rain: data.current.rain,
            windSpeed: data.current.wind_speed_10m,
            windDirection: data.current.wind_direction_10m,
            windGusts: data.current.wind_gusts_10m,
            cloudCover: data.current.cloud_cover,
            visibility: data.current.visibility,
            weatherCode: data.current.weather_code,
            weatherDescription: WMO_CODES[data.current.weather_code] || "preflightLevelUnknown",
            pressure: data.current.pressure_msl,
            isDay: data.current.is_day,
        };

        weather.daily = {
            sunrise: data.daily.sunrise?.[0] || null,
            sunset: data.daily.sunset?.[0] || null,
            daylightDuration: data.daily.daylight_duration?.[0] || null,
            uvIndexMax: data.daily.uv_index_max?.[0] || null,
            temperatureMax: data.daily.temperature_2m_max?.[0] || null,
            temperatureMin: data.daily.temperature_2m_min?.[0] || null,
        };

        weather.hourly = [];
        const hourlyLen = data.hourly.time?.length || 0;
        for (let i = 0; i < hourlyLen; i++) {
            weather.hourly.push({
                time: data.hourly.time[i],
                windSpeed10m: data.hourly.wind_speed_10m[i],
                windSpeed80m: data.hourly.wind_speed_80m[i],
                windSpeed120m: data.hourly.wind_speed_120m[i],
                windGusts: data.hourly.wind_gusts_10m[i],
                precipitationProbability: data.hourly.precipitation_probability[i],
                visibility: data.hourly.visibility[i],
                cloudCover: data.hourly.cloud_cover[i],
                temperature: data.hourly.temperature_2m[i],
                dewPoint: data.hourly.dew_point_2m[i],
            });
        }

        weather.forecast = [];
        const forecastLen = data.daily.time?.length || 0;
        for (let i = 0; i < forecastLen; i++) {
            weather.forecast.push({
                date: data.daily.time[i],
                weatherCode: data.daily.weather_code?.[i] ?? null,
                weatherDescription: WMO_CODES[data.daily.weather_code?.[i]] || "preflightLevelUnknown",
                tempMax: data.daily.temperature_2m_max?.[i] ?? null,
                tempMin: data.daily.temperature_2m_min?.[i] ?? null,
                windMax: data.daily.wind_speed_10m_max?.[i] ?? null,
                gustsMax: data.daily.wind_gusts_10m_max?.[i] ?? null,
                precipProbability: data.daily.precipitation_probability_max?.[i] ?? null,
                sunrise: data.daily.sunrise?.[i] ?? null,
                sunset: data.daily.sunset?.[i] ?? null,
            });
        }

        weather.lastUpdated = new Date();
    } catch (err) {
        if (requestId === weatherRequestId) {
            weather.error = err.message;
        }
    } finally {
        if (requestId === weatherRequestId) {
            weather.loading = false;
        }
    }
}

async function fetchSolarActivity() {
    const requestId = ++solarRequestId;
    solar.loading = true;
    solar.error = null;
    solar.kpIndex = null;
    solar.kpTimestamp = null;
    solar.stormLevel = null;
    try {
        const response = await fetch("https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json");
        if (!response.ok) {
            throw new Error(`Solar API error: ${response.status}`);
        }
        const data = await response.json();

        if (requestId !== solarRequestId) {
            return;
        }

        if (data.length > 1) {
            const latest = data[data.length - 1];
            const parsedKp = Number.parseFloat(latest[1]);
            if (Number.isFinite(parsedKp)) {
                solar.kpIndex = parsedKp;
            }
            solar.kpTimestamp = latest[0];
        }

        try {
            const scaleResponse = await fetch("https://services.swpc.noaa.gov/products/noaa-scales.json");
            if (scaleResponse.ok && requestId === solarRequestId) {
                const scaleData = await scaleResponse.json();
                if (scaleData["-1"]) {
                    solar.stormLevel = {
                        geoStorm: scaleData["-1"].G?.Scale || "0",
                        solarRadiation: scaleData["-1"].S?.Scale || "0",
                        radioBlackout: scaleData["-1"].R?.Scale || "0",
                    };
                }
            }
        } catch (e) {
            console.warn("Storm scale fetch failed:", e.message);
        }

        if (requestId === solarRequestId) {
            solar.lastUpdated = new Date();
        }
    } catch (err) {
        if (requestId === solarRequestId) {
            solar.error = err.message;
        }
    } finally {
        if (requestId === solarRequestId) {
            solar.loading = false;
        }
    }
}

const launchStatus = computed(() => {
    if (!weather.current && solar.kpIndex === null) {
        return { level: "unknown", label: "preflightStatusNoData", cssClass: "status-unknown", checks: [] };
    }

    const LEVELS = { good: 0, moderate: 1, warning: 2, danger: 3 };
    let worstLevel = "good";
    const checks = [];

    const track = (nameKey, status) => {
        checks.push({ nameKey, level: status.level, label: status.label, cssClass: status.cssClass });
        if ((LEVELS[status.level] || 0) > (LEVELS[worstLevel] || 0)) {
            worstLevel = status.level;
        }
    };

    if (weather.current) {
        track("preflightCheckWind", getWindStatus(weather.current.windSpeed, weather.current.windGusts));
        track("preflightCheckVisibility", getVisibilityStatus(weather.current.visibility));
        track("preflightCheckPrecipitation", getPrecipitationStatus(weather.current.precipitation));
        track("preflightCheckBattery", getBatteryTempStatus(weather.current.temperature));
        const da = getDensityAltitude(location.elevation, weather.current.pressure, weather.current.temperature);
        if (da !== null) {
            track("preflightCheckDensityAlt", getDensityAltitudeStatus(da));
        }
    }
    if (solar.kpIndex !== null) {
        track("preflightCheckSolar", getKpStatus(solar.kpIndex));
    }

    const labels = {
        good: "preflightStatusGo",
        moderate: "preflightStatusCaution",
        warning: "preflightStatusWarning",
        danger: "preflightStatusNoGo",
    };
    const cssClasses = {
        good: "status-good",
        moderate: "status-moderate",
        warning: "status-warning",
        danger: "status-danger",
    };

    return { level: worstLevel, label: labels[worstLevel], cssClass: cssClasses[worstLevel], checks };
});

const IP_CONSENT_NEEDED = "IP_CONSENT_NEEDED";

const ipGeolocationConsent = ref(!!getConfig(IP_GEOLOCATION_CONSENT_KEY)[IP_GEOLOCATION_CONSENT_KEY]);

function setIpGeolocationConsent(value) {
    ipGeolocationConsent.value = !!value;
    const obj = {};
    obj[IP_GEOLOCATION_CONSENT_KEY] = !!value;
    setConfig(obj);
}

async function useGeolocation() {
    let coords;
    let source = "geolocation";
    try {
        coords = await browserGeolocation();
    } catch {
        if (!ispConnected()) {
            throw new Error("Geolocation failed and internet access is disabled");
        }
        if (ipGeolocationConsent.value) {
            coords = await ipGeolocation();
            source = "ip";
        } else {
            throw new Error(IP_CONSENT_NEEDED);
        }
    }
    location.latitude = coords.latitude;
    location.longitude = coords.longitude;
    location.elevation = null;
    location.source = source;
    location.name = `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`;
}

async function useIpGeolocationFallback() {
    if (!ispConnected()) {
        throw new Error("Internet access is disabled");
    }
    if (!ipGeolocationConsent.value) {
        throw new Error(IP_CONSENT_NEEDED);
    }
    const coords = await ipGeolocation();
    location.latitude = coords.latitude;
    location.longitude = coords.longitude;
    location.elevation = null;
    location.source = "ip";
    location.name = `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`;
}

function setManualLocation(lat, lon) {
    const parsedLat = Number.parseFloat(lat);
    const parsedLon = Number.parseFloat(lon);
    location.latitude = parsedLat;
    location.longitude = parsedLon;
    location.elevation = null;
    location.source = "manual";
    location.name = `${parsedLat.toFixed(4)}, ${parsedLon.toFixed(4)}`;
}

function updateMagneticDeclination() {
    if (location.latitude === null || location.longitude === null) {
        return;
    }
    try {
        const model = geomagnetism.model();
        const info = model.point([location.latitude, location.longitude]);
        mag.declination = info.decl;
        mag.inclination = info.incl;
    } catch (e) {
        console.warn("Magnetic declination calculation failed:", e.message);
        mag.declination = null;
        mag.inclination = null;
    }
}

async function fetchElevation(lat, lon) {
    const requestId = ++elevationRequestId;
    try {
        const params = new URLSearchParams({ latitude: lat, longitude: lon });
        const response = await fetch(`https://api.open-meteo.com/v1/elevation?${params}`);
        if (!response.ok) {
            throw new Error(`Elevation API error: ${response.status}`);
        }
        const data = await response.json();
        if (requestId === elevationRequestId && data.elevation && data.elevation.length > 0) {
            location.elevation = data.elevation[0];
        }
    } catch (e) {
        if (requestId === elevationRequestId) {
            console.warn("Elevation fetch failed:", e.message);
            location.elevation = null;
        }
    }
}

async function refreshAll() {
    if (location.latitude === null || location.longitude === null) {
        return;
    }
    const lat = location.latitude;
    const lon = location.longitude;
    updateMagneticDeclination();
    updateCivilTwilight();
    await Promise.allSettled([fetchWeather(lat, lon), fetchSolarActivity(), fetchElevation(lat, lon)]);
}

const civilTwilight = ref(null);

function updateCivilTwilight() {
    if (location.latitude === null || location.longitude === null) {
        civilTwilight.value = null;
        return;
    }
    const times = SunCalc.getTimes(new Date(), location.latitude, location.longitude);
    if (!times.dawn || !times.dusk || Number.isNaN(times.dawn.getTime()) || Number.isNaN(times.dusk.getTime())) {
        civilTwilight.value = null;
        return;
    }
    civilTwilight.value = { dawn: times.dawn, dusk: times.dusk };
}

// Load saved locations once at module init
loadSavedLocations();

// ── Public API (singleton) ─────────────────────────────────────────────────────

export function usePreflight() {
    return {
        location,
        weather,
        solar,
        mag,
        civilTwilight,
        savedLocations,
        isLoading,
        launchStatus,
        fetchWeather,
        fetchSolarActivity,
        useGeolocation,
        useIpGeolocationFallback,
        ipGeolocationConsent,
        setIpGeolocationConsent,
        IP_CONSENT_NEEDED,
        setManualLocation,
        saveCurrentLocation,
        renameSavedLocation,
        deleteSavedLocation,
        applySavedLocation,
        refreshAll,
        formatTime,
        getKpStatus,
        getWindStatus,
        getVisibilityStatus,
        getPrecipitationStatus,
        getDewPointRisk,
        getUvStatus,
        getBatteryTempStatus,
        getDensityAltitude,
        getDensityAltitudeStatus,
        getFogRisk,
        getWindDirectionLabel,
        WMO_CODES,
        MAX_SAVED_LOCATIONS,
        MAX_LABEL_LENGTH,
    };
}
