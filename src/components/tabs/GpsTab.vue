<template>
    <BaseTab tab-name="gps">
        <div class="content_wrapper">
            <div class="tab_title" v-html="$t('tabGPS')"></div>
            <div class="cf_doc_version_bt">
                <a
                    id="button-documentation"
                    href="https://betaflight.com/docs/wiki/configurator/gps-tab"
                    target="_blank"
                    rel="noopener noreferrer"
                    :aria-label="$t('betaflightSupportButton')"
                >
                    {{ $t("betaflightSupportButton") }}
                </a>
            </div>

            <div class="grid-row grid-box col5">
                <div class="col-span-2">
                    <div class="gui_box grey gps">
                        <div class="gui_box_titlebar">
                            <div class="spacer_box_title" v-html="$t('configurationGPS')"></div>
                            <div class="helpicon cf_tip" :title="$t('configurationGPSHelp')"></div>
                        </div>
                        <div class="spacer_box">
                            <div class="gps_config">
                                <div>
                                    <div class="select line">
                                        <table>
                                            <tbody class="features gps">
                                                <tr v-for="feature in gpsFeatures" :key="feature.bit">
                                                    <td>
                                                        <input
                                                            class="feature toggle"
                                                            type="checkbox"
                                                            :id="`feature${feature.bit}`"
                                                            :checked="isFeatureEnabled(feature)"
                                                            @change="toggleFeature(feature, $event.target.checked)"
                                                        />
                                                    </td>
                                                    <td>
                                                        <div v-if="!feature.hideName">{{ feature.name }}</div>
                                                        <span class="xs" v-html="$t(`feature${feature.name}`)"></span>
                                                    </td>
                                                    <td>
                                                        <span
                                                            class="sm-min"
                                                            v-html="$t(`feature${feature.name}`)"
                                                        ></span>
                                                        <div
                                                            v-if="feature.haveTip"
                                                            class="helpicon cf_tip"
                                                            :title="$t(`feature${feature.name}Tip`)"
                                                        ></div>
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                        <div class="helpicon cf_tip" :title="$t('featureGPSTip')"></div>
                                    </div>
                                    <div class="number">
                                        <select
                                            class="gps_protocol"
                                            v-model.number="gpsConfig.provider"
                                            @change="onGpsProtocolChange"
                                        >
                                            <option
                                                v-for="(protocol, idx) in gpsProtocols"
                                                :key="protocol"
                                                :value="idx"
                                            >
                                                {{ protocol }}
                                            </option>
                                        </select>
                                        <span v-html="$t('configurationGPSProtocol')"></span>
                                    </div>
                                    <div class="number gps_auto_baud" v-if="showAutoBaud">
                                        <div>
                                            <input type="checkbox" class="toggle" v-model="autoBaudChecked" />
                                        </div>
                                        <span class="freelabel" v-html="$t('configurationGPSAutoBaud')"></span>
                                    </div>
                                    <div class="number gps_auto_config" v-if="showAutoConfig">
                                        <div>
                                            <input
                                                type="checkbox"
                                                name="gps_auto_config"
                                                class="toggle"
                                                v-model="autoConfigChecked"
                                            />
                                        </div>
                                        <span class="freelabel" v-html="$t('configurationGPSAutoConfig')"></span>
                                    </div>
                                    <div class="number gps_ublox_galileo" v-if="showUbloxGalileo">
                                        <div>
                                            <input
                                                type="checkbox"
                                                name="gps_ublox_galileo"
                                                class="toggle"
                                                v-model="ubloxGalileoChecked"
                                            />
                                        </div>
                                        <span class="freelabel" v-html="$t('configurationGPSGalileo')"></span>
                                        <div class="helpicon cf_tip" :title="$t('configurationGPSGalileoHelp')"></div>
                                    </div>
                                    <div class="number gps_home_once">
                                        <div>
                                            <input type="checkbox" class="toggle" v-model="homeOnceChecked" />
                                        </div>
                                        <span class="freelabel" v-html="$t('configurationGPSHomeOnce')"></span>
                                        <div class="helpicon cf_tip" :title="$t('configurationGPSHomeOnceHelp')"></div>
                                    </div>
                                    <div class="select" v-if="showUbloxSbas">
                                        <select class="gps_ubx_sbas" v-model.number="gpsConfig.ublox_sbas">
                                            <option v-for="(sbas, index) in gpsSbas" :key="index" :value="index">
                                                {{ sbas }}
                                            </option>
                                        </select>
                                        <span class="freelabel" v-html="$t('configurationGPSubxSbas')"></span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="gui_box grey">
                        <div class="gui_box_titlebar">
                            <div class="spacer_box_title" v-html="$t('gpsSignalStrHead')"></div>
                            <div class="helpicon cf_tip" :title="$t('gpsSignalStrHeadHelp')"></div>
                        </div>
                        <div class="spacer_box GPS_signal_strength">
                            <div class="signal_strength note" v-if="!hasGpsSensor" v-html="$t('gpsSignalLost')"></div>
                            <table class="cf_table" v-if="hasGpsSensor">
                                <tbody>
                                    <tr class="titles">
                                        <td style="text-align: left; width: 12%" v-html="$t('gpsSignalGnssId')"></td>
                                        <td style="text-align: center; width: 14%" v-html="$t('gpsSignalSatId')"></td>
                                        <td style="text-align: center; width: 30%" v-html="$t('gpsSignalStr')"></td>
                                        <td style="text-align: left; width: 44%" v-html="$t('gpsSignalQuality')"></td>
                                    </tr>
                                    <tr v-for="(row, index) in signalRows" :key="index">
                                        <td>{{ row.gnss }}</td>
                                        <td>
                                            <span
                                                v-if="row.satId !== null"
                                                class="colorToggle sat-id-pill"
                                                :class="{ ready: row.satUsed }"
                                                :title="row.satUsed ? $t('gnssUsedUsed') : $t('gnssUsedUnused')"
                                            >
                                                {{ row.satId }}
                                            </span>
                                            <span v-else>-</span>
                                        </td>
                                        <td>
                                            <meter :value="row.cno" max="55"></meter>
                                        </td>
                                        <td>
                                            <span v-if="row.quality" class="colorToggle" :class="row.qualityClass">
                                                {{ row.quality }}
                                            </span>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div class="col-span-3">
                    <div class="gui_box grey">
                        <div class="gui_box_titlebar">
                            <div class="spacer_box_title" v-html="$t('gpsHead')"></div>
                            <div class="helpicon cf_tip" :title="$t('gpsHeadHelp')"></div>
                        </div>
                        <div class="spacer_box GPS_info">
                            <table class="cf_table">
                                <tr>
                                    <td v-html="$t('gps3dFix')"></td>
                                    <td>
                                        <span class="colorToggle" :class="{ ready: gpsInfo.fix }">{{
                                            gpsInfo.fix ? $t("gpsFixTrue") : $t("gpsFixFalse")
                                        }}</span>
                                    </td>
                                </tr>
                                <tr>
                                    <td v-html="$t('gpsSats')"></td>
                                    <td class="sats">{{ gpsInfo.sats }}</td>
                                </tr>
                                <tr>
                                    <td v-html="$t('gpsAltitude')"></td>
                                    <td class="alt">{{ gpsInfo.alt }} m</td>
                                </tr>
                                <tr>
                                    <td v-html="$t('gpsSpeed')"></td>
                                    <td class="speed">{{ gpsInfo.speed }} cm/s</td>
                                </tr>
                                <tr>
                                    <td v-html="$t('gpsHeading')"></td>
                                    <td class="heading">
                                        {{ gpsInfo.headingImu.toFixed(0) }} / {{ gpsInfo.headingGps.toFixed(0) }}
                                        {{ $t("gpsPositionUnit") }}
                                    </td>
                                </tr>
                                <tr>
                                    <td v-html="$t('gpsLatitude')"></td>
                                    <td class="latitude">
                                        <a :href="mapLink" target="_blank"
                                            >{{ gpsInfo.latitude.toFixed(6) }} {{ $t("gpsPositionUnit") }}</a
                                        >
                                    </td>
                                </tr>
                                <tr>
                                    <td v-html="$t('gpsLongitude')"></td>
                                    <td class="longitude">
                                        <a :href="mapLink" target="_blank"
                                            >{{ gpsInfo.longitude.toFixed(6) }} {{ $t("gpsPositionUnit") }}</a
                                        >
                                    </td>
                                </tr>
                                <tr>
                                    <td v-html="$t('gpsDistToHome')"></td>
                                    <td class="distToHome">{{ gpsInfo.distToHome }} m</td>
                                </tr>
                                <tr v-if="showPositionalDop">
                                    <td v-html="$t('gpsPositionalDop')"></td>
                                    <td class="positionalDop" v-html="gpsInfo.positionalDopDisplay"></td>
                                </tr>
                                <tr v-if="showPositionalDop && hasMag">
                                    <td v-html="$t('gpsMagneticDeclination')"></td>
                                    <td class="magDeclination">
                                        {{ gpsInfo.magDeclination }} {{ $t("gpsPositionUnit") }}
                                    </td>
                                </tr>
                            </table>
                        </div>
                    </div>
                    <div class="gui_box grey gps_map">
                        <div class="gui_box_titlebar">
                            <div class="spacer_box_title" v-html="$t('gpsMapHead')"></div>
                        </div>
                        <div id="connect" v-show="showConnect">
                            <div>{{ $t("gpsMapMessage1") }}</div>
                            <div class="default_btn"><a id="check" @click.prevent="checkConnectivity">retry</a></div>
                        </div>
                        <div id="waiting" v-show="showWaiting">
                            <div class="info">{{ $t("gpsMapMessage2") }}</div>
                        </div>
                        <div id="loadmap" v-show="showLoadMap" ref="mapContainerRef">
                            <div id="map" class="map" ref="mapRef"></div>
                            <div class="controls">
                                <button
                                    type="button"
                                    id="Satellite"
                                    :class="{ active: activeLayer === 'satellite' }"
                                    aria-label="Satellite view"
                                    @click="setLayer('satellite')"
                                >
                                    S
                                </button>
                                <button
                                    type="button"
                                    id="Hybrid"
                                    :class="{ active: activeLayer === 'hybrid' }"
                                    aria-label="Hybrid satellite and street view"
                                    @click="setLayer('hybrid')"
                                >
                                    H
                                </button>
                                <button
                                    type="button"
                                    id="Street"
                                    :class="{ active: activeLayer === 'street' }"
                                    aria-label="Street map view"
                                    @click="setLayer('street')"
                                >
                                    R
                                </button>
                                <button type="button" id="zoom_in" aria-label="Zoom in" @click="zoomIn">+</button>
                                <button type="button" id="zoom_out" aria-label="Zoom out" @click="zoomOut">–</button>
                                <button
                                    type="button"
                                    id="fullscreen"
                                    :class="{ active: isFullscreen }"
                                    aria-label="Toggle fullscreen"
                                    @click="toggleFullscreen"
                                >
                                    ⛶
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="content_toolbar toolbar_fixed_bottom">
            <div class="btn save_btn">
                <a class="save" href="#" @click.prevent="saveConfig">{{ $t("configurationButtonSave") }}</a>
            </div>
        </div>
    </BaseTab>
</template>

<script>
import { defineComponent, ref, reactive, computed, onMounted, onUnmounted, nextTick, watch } from "vue";
import BaseTab from "./BaseTab.vue";
import GUI from "../../js/gui";
import FC from "../../js/fc";
import MSP from "../../js/msp";
import MSPCodes from "../../js/msp/MSPCodes";
import { mspHelper } from "../../js/msp/MSPHelper";
import { updateTabList } from "../../js/utils/updateTabList";
import { initMap } from "../../js/utils/map";
import { fromLonLat } from "ol/proj";
import { ispConnected } from "../../js/utils/connection";
import { sensorTypes } from "../../js/sensor_types";
import { have_sensor } from "../../js/sensor_helpers";
import semver from "semver";
import { API_VERSION_1_46 } from "../../js/data_storage";
import { i18n } from "../../js/localization";
import { bit_check, bit_clear, bit_set } from "../../js/bit";

export default defineComponent({
    name: "GpsTab",
    components: { BaseTab },
    setup() {
        const mapRef = ref(null);
        const mapContainerRef = ref(null);
        const mapInstance = ref(null);
        const activeLayer = ref("satellite");
        const isFullscreen = ref(false);
        const isOnline = ref(false);
        const isWaiting = ref(true);
        const showMap = ref(false);

        const gpsInfo = reactive({
            fix: false,
            sats: 0,
            alt: 0,
            speed: 0,
            headingImu: 0,
            headingGps: 0,
            latitude: 0,
            longitude: 0,
            distToHome: 0,
            positionalDopDisplay: "",
            magDeclination: null,
        });

        const signalRows = ref([]);

        const gpsProtocols = sensorTypes().gps.elements;
        const gpsSbas = [
            i18n.getMessage("gpsSbasAutoDetect"),
            i18n.getMessage("gpsSbasEuropeanEGNOS"),
            i18n.getMessage("gpsSbasNorthAmericanWAAS"),
            i18n.getMessage("gpsSbasJapaneseMSAS"),
            i18n.getMessage("gpsSbasIndianGAGAN"),
            i18n.getMessage("gpsSbasNone"),
        ];

        const apiVersion = computed(() => FC.CONFIG.apiVersion);
        const hasGpsSensor = computed(() => have_sensor(FC.CONFIG.activeSensors, "gps"));
        const hasMag = computed(
            () => have_sensor(FC.CONFIG.activeSensors, "mag") && semver.gte(apiVersion.value, API_VERSION_1_46),
        );

        const gpsConfig = reactive({
            provider: 0,
            auto_baud: 0,
            auto_config: 0,
            ublox_use_galileo: 0,
            ublox_sbas: 0,
            home_point_once: 0,
        });

        const ubloxIndex = gpsProtocols.indexOf("UBLOX");
        const mspIndex = gpsProtocols.indexOf("MSP");

        const ubloxSelected = computed(() => gpsConfig.provider === ubloxIndex);
        const mspSelected = computed(() => gpsConfig.provider === mspIndex);
        const showAutoConfig = computed(() => ubloxSelected.value);
        const showAutoBaud = computed(
            () => (ubloxSelected.value || mspSelected.value) && semver.lt(apiVersion.value, API_VERSION_1_46),
        );
        const showUbloxGalileo = computed(() => showAutoConfig.value && gpsConfig.auto_config === 1);
        const showUbloxSbas = computed(() => showAutoConfig.value && gpsConfig.auto_config === 1);
        const showPositionalDop = computed(() => semver.gte(apiVersion.value, API_VERSION_1_46));

        const applySwitchery = () => {
            nextTick(() => {
                GUI.switchery();
            });
        };

        const autoBaudChecked = computed({
            get: () => !!gpsConfig.auto_baud,
            set: (val) => {
                gpsConfig.auto_baud = val ? 1 : 0;
            },
        });

        const autoConfigChecked = computed({
            get: () => !!gpsConfig.auto_config,
            set: (val) => {
                gpsConfig.auto_config = val ? 1 : 0;
            },
        });

        const ubloxGalileoChecked = computed({
            get: () => !!gpsConfig.ublox_use_galileo,
            set: (val) => {
                gpsConfig.ublox_use_galileo = val ? 1 : 0;
            },
        });

        const homeOnceChecked = computed({
            get: () => !!gpsConfig.home_point_once,
            set: (val) => {
                gpsConfig.home_point_once = val ? 1 : 0;
            },
        });

        const mapLink = computed(() => {
            return `https://maps.google.com/?q=${gpsInfo.latitude},${gpsInfo.longitude}`;
        });

        const showConnect = computed(() => !isOnline.value);
        const showWaiting = computed(() => isOnline.value && !showMap.value);
        const showLoadMap = computed(() => isOnline.value && showMap.value);

        const gpsFeatures = computed(() => {
            if (!FC.FEATURE_CONFIG?.features?._features) {
                return [];
            }
            return FC.FEATURE_CONFIG.features._features.filter((feature) => feature.group === "gps");
        });

        const isFeatureEnabled = (feature) => {
            if (!FC.FEATURE_CONFIG?.features) return false;
            return bit_check(FC.FEATURE_CONFIG.features._featureMask, feature.bit);
        };

        const toggleFeature = (feature, checked) => {
            if (!FC.FEATURE_CONFIG?.features) return;
            if (checked) {
                FC.FEATURE_CONFIG.features._featureMask = bit_set(FC.FEATURE_CONFIG.features._featureMask, feature.bit);
            } else {
                FC.FEATURE_CONFIG.features._featureMask = bit_clear(
                    FC.FEATURE_CONFIG.features._featureMask,
                    feature.bit,
                );
            }
            updateTabList(FC.FEATURE_CONFIG.features);
        };

        const setLayer = (layerKey) => {
            if (!mapInstance.value?.layers) return;
            Object.entries(mapInstance.value.layers).forEach(([key, layer]) => {
                layer.setVisible(key === layerKey);
            });
            activeLayer.value = layerKey;
            nextTick(() => mapInstance.value?.map?.updateSize());
        };

        const zoomIn = () => {
            if (!mapInstance.value?.mapView) return;
            mapInstance.value.mapView.setZoom(mapInstance.value.mapView.getZoom() + 1);
        };

        const zoomOut = () => {
            if (!mapInstance.value?.mapView) return;
            mapInstance.value.mapView.setZoom(mapInstance.value.mapView.getZoom() - 1);
        };

        const toggleFullscreen = () => {
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
        };

        const handleFullscreenChange = () => {
            isFullscreen.value = !!(
                document.fullscreenElement ||
                document.webkitFullscreenElement ||
                document.msFullscreenElement
            );
            requestAnimationFrame(() => mapInstance.value?.map?.updateSize());
        };

        const getPositionalDopQuality = (positionalDop) => {
            let qualityColor;
            let stars;
            if (positionalDop < 1) {
                qualityColor = "ideal";
                stars = "★★★★★";
            } else if (positionalDop < 2) {
                qualityColor = "excellent";
                stars = "★★★★☆";
            } else if (positionalDop < 5) {
                qualityColor = "good";
                stars = "★★★☆☆";
            } else if (positionalDop < 10) {
                qualityColor = "moderate";
                stars = "★★☆☆☆";
            } else if (positionalDop < 20) {
                qualityColor = "fair";
                stars = "★☆☆☆☆";
            } else {
                qualityColor = "poor";
                stars = "☆☆☆☆☆";
            }

            return { qualityColor, stars };
        };

        const gnssArray = ["GPS", "SBAS", "Galileo", "BeiDou", "IMES", "QZSS", "Glonass"];
        const qualityArray = [
            "gnssQualityNoSignal",
            "gnssQualitySearching",
            "gnssQualityAcquired",
            "gnssQualityUnusable",
            "gnssQualityLocked",
            "gnssQualityFullyLocked",
            "gnssQualityFullyLocked",
            "gnssQualityFullyLocked",
        ];

        const updateSignalStrengths = () => {
            const hasGPS = hasGpsSensor.value;
            const rows = [];

            if (!hasGPS) {
                signalRows.value = rows;
                return;
            }

            const channels = FC.GPS_DATA?.chn?.length || 0;

            if (channels > 16) {
                const maxUIChannels = 32;
                const channelCount = Math.min(maxUIChannels, channels) || 32;

                for (let i = 0; i < channelCount; i++) {
                    const gnssId = FC.GPS_DATA.chn[i];
                    if (gnssId >= 7) {
                        rows.push({ gnss: "-", satId: null, satUsed: false, cno: 0, quality: "", qualityClass: "" });
                        continue;
                    }

                    const satUsed = (FC.GPS_DATA.quality[i] & 0x8) >> 3;
                    const qualityValue = FC.GPS_DATA.quality[i] & 0x7;
                    const quality = i18n.getMessage(qualityArray[qualityValue]);
                    // qualityValue: 5,6,7 = fully locked, 4 = locked, others = low
                    const qualityColor = qualityValue >= 5 ? "ready" : qualityValue === 4 ? "locked" : "low";

                    rows.push({
                        gnss: gnssArray[gnssId],
                        satId: FC.GPS_DATA.svid[i],
                        satUsed: !!satUsed,
                        cno: FC.GPS_DATA.cno[i],
                        quality,
                        qualityClass: qualityColor,
                    });
                }
            } else {
                for (let i = 0; i < channels; i++) {
                    rows.push({
                        gnss: "-",
                        satId: FC.GPS_DATA.svid[i],
                        satUsed: false,
                        cno: FC.GPS_DATA.cno[i],
                        quality: FC.GPS_DATA.quality[i],
                        qualityClass: "",
                    });
                }

                for (let i = channels; i < 32; i++) {
                    rows.push({ gnss: "-", satId: "-", satUsed: false, cno: 0, quality: "", qualityClass: "" });
                }
            }

            signalRows.value = rows;
        };

        const updateUi = () => {
            const latitude = (FC.GPS_DATA?.latitude || 0) / 10000000;
            const longitude = (FC.GPS_DATA?.longitude || 0) / 10000000;
            const imuHeadingDegrees = FC.SENSOR_DATA?.kinematics?.[2] || 0;
            const imuHeadingRadians = ((imuHeadingDegrees + 180) * Math.PI) / 180;
            const gpsHeading = (FC.GPS_DATA?.ground_course || 0) / 10;
            const alt = FC.GPS_DATA?.alt || 0;

            gpsInfo.fix = !!FC.GPS_DATA?.fix;
            gpsInfo.sats = FC.GPS_DATA?.numSat || 0;
            gpsInfo.alt = alt;
            gpsInfo.speed = FC.GPS_DATA?.speed || 0;
            gpsInfo.headingImu = imuHeadingDegrees;
            gpsInfo.headingGps = gpsHeading;
            gpsInfo.latitude = latitude;
            gpsInfo.longitude = longitude;
            gpsInfo.distToHome = FC.GPS_DATA?.distanceToHome || 0;

            if (showPositionalDop.value) {
                const positionalDop = Number(((FC.GPS_DATA?.positionalDop || 0) / 100).toFixed(2));
                const { qualityColor, stars } = getPositionalDopQuality(positionalDop);
                gpsInfo.positionalDopDisplay = `${stars} <span class="colorToggle ${qualityColor}">${positionalDop}</span>`;
                gpsInfo.magDeclination = hasMag.value ? (FC.COMPASS_CONFIG?.mag_declination || 0).toFixed(1) : null;
            } else {
                gpsInfo.positionalDopDisplay = "";
                gpsInfo.magDeclination = null;
            }

            updateSignalStrengths();

            let gpsFoundPosition = false;

            if (ispConnected()) {
                isOnline.value = true;
                gpsFoundPosition = !!(longitude && latitude);

                if (gpsFoundPosition) {
                    initializeMap();
                    const mapObj = mapInstance.value?.map;
                    const view = mapInstance.value?.mapView;
                    const geometry = mapInstance.value?.iconGeometry;
                    const feature = mapInstance.value?.iconFeature;
                    const iconStyle = hasMag.value ? mapInstance.value.iconStyleMag : mapInstance.value.iconStyleGPS;

                    const rerender = () => {
                        if (!mapObj || !mapObj.getTargetElement || !mapObj.getTargetElement()) return;
                        mapObj.updateSize();
                        const renderer = mapObj.getRenderer && mapObj.getRenderer();
                        if (renderer) {
                            mapObj.renderSync();
                        }
                    };

                    if (iconStyle && feature && geometry && view && mapObj) {
                        iconStyle.getImage().setRotation(imuHeadingRadians);
                        feature.setStyle(iconStyle);
                        const center = fromLonLat([longitude, latitude]);
                        view.setCenter(center);
                        geometry.setCoordinates(center);
                        // Ensure map relayout after showing
                        requestAnimationFrame(rerender);
                        setTimeout(rerender, 50);
                    }
                } else if (mapInstance.value) {
                    mapInstance.value.iconFeature.setStyle(mapInstance.value.iconStyleNoFix);
                }
            } else {
                isOnline.value = false;
            }

            showMap.value = gpsFoundPosition;
            isWaiting.value = !gpsFoundPosition && isOnline.value;

            requestAnimationFrame(() => mapInstance.value?.map?.updateSize());
        };

        const getMagData = () => {
            if (semver.gte(apiVersion.value, API_VERSION_1_46)) {
                MSP.send_message(MSPCodes.MSP_COMPASS_CONFIG, false, false, updateUi);
            } else {
                updateUi();
            }
        };

        const getImuData = () => {
            MSP.send_message(MSPCodes.MSP_RAW_IMU, false, false, getMagData);
        };

        const getAttitudeData = () => {
            MSP.send_message(MSPCodes.MSP_ATTITUDE, false, false, getImuData);
        };

        const getGpsSvInfo = () => {
            MSP.send_message(MSPCodes.MSP_GPS_SV_INFO, false, false, getAttitudeData);
        };

        const getCompGpsData = () => {
            MSP.send_message(MSPCodes.MSP_COMP_GPS, false, false, getGpsSvInfo);
        };

        const getRawGpsData = () => {
            MSP.send_message(MSPCodes.MSP_RAW_GPS, false, false, getCompGpsData);
        };

        const localIntervals = [];
        const addLocalInterval = (name, code, period, first = false) => {
            GUI.interval_add(name, code, period, first);
            localIntervals.push(name);
        };

        const checkConnectivity = () => {
            isOnline.value = ispConnected();
            if (!isOnline.value) {
                showMap.value = false;
                isWaiting.value = false;
            } else {
                isWaiting.value = !showMap.value;
            }
        };

        const loadGpsConfig = async () => {
            try {
                await MSP.promise(MSPCodes.MSP_FEATURE_CONFIG);
                await MSP.promise(MSPCodes.MSP_GPS_CONFIG);

                Object.assign(gpsConfig, FC.GPS_CONFIG || {});

                isOnline.value = ispConnected();
                isWaiting.value = true;
                showMap.value = false;

                addLocalInterval("gps_pull", getRawGpsData, 100, true);

                applySwitchery();
            } catch (error) {
                console.error("Failed to load GPS configuration", error);
                isOnline.value = ispConnected();
                isWaiting.value = false;
            } finally {
                GUI.content_ready();
            }
        };

        const saveConfig = async () => {
            Object.assign(FC.GPS_CONFIG, gpsConfig);

            await MSP.promise(MSPCodes.MSP_SET_FEATURE_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_FEATURE_CONFIG));
            await MSP.promise(MSPCodes.MSP_SET_GPS_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_GPS_CONFIG));

            mspHelper.writeConfiguration(true);
        };

        const initializeMap = () => {
            if (mapInstance.value || !mapRef.value) return;
            mapInstance.value = initMap({ target: mapRef.value, defaultLayer: activeLayer.value });
            setLayer(activeLayer.value);
            nextTick(() => mapInstance.value?.map?.updateSize());
        };

        const onGpsProtocolChange = () => {
            if (!showAutoConfig.value) {
                gpsConfig.auto_config = 0;
            }
            // Ensure toggles render immediately after protocol change
            nextTick(() => mapInstance.value?.map?.updateSize());
        };

        onMounted(() => {
            nextTick(() => {
                initializeMap();
                mapInstance.value?.map?.updateSize();
            });
            loadGpsConfig();
            document.addEventListener("fullscreenchange", handleFullscreenChange);
            document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
            document.addEventListener("MSFullscreenChange", handleFullscreenChange);
        });

        onUnmounted(() => {
            localIntervals.forEach((name) => GUI.interval_remove(name));
            localIntervals.length = 0;
            document.removeEventListener("fullscreenchange", handleFullscreenChange);
            document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
            document.removeEventListener("MSFullscreenChange", handleFullscreenChange);
            if (mapInstance.value?.destroy) {
                mapInstance.value.destroy();
            }
        });

        watch(showLoadMap, (visible) => {
            if (visible) {
                nextTick(() => {
                    initializeMap();
                    const mapObj = mapInstance.value?.map;
                    if (mapObj) {
                        mapObj.updateSize();
                        const renderer = mapObj.getRenderer && mapObj.getRenderer();
                        if (renderer) {
                            mapObj.renderSync();
                        }
                    }
                });
            }
        });
        watch([showAutoConfig, showUbloxGalileo, showAutoBaud], applySwitchery, { immediate: true });

        return {
            mapRef,
            mapContainerRef,
            activeLayer,
            isFullscreen,
            gpsProtocols,
            gpsSbas,
            gpsConfig,
            gpsInfo,
            signalRows,
            hasGpsSensor,
            hasMag,
            autoBaudChecked,
            autoConfigChecked,
            ubloxGalileoChecked,
            homeOnceChecked,
            showAutoBaud,
            showAutoConfig,
            showUbloxGalileo,
            showUbloxSbas,
            showPositionalDop,
            mapLink,
            showConnect,
            showWaiting,
            showLoadMap,
            gpsFeatures,
            isFeatureEnabled,
            toggleFeature,
            setLayer,
            zoomIn,
            zoomOut,
            toggleFullscreen,
            checkConnectivity,
            saveConfig,
            onGpsProtocolChange,
        };
    },
});
</script>
