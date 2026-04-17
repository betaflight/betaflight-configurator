<template>
    <BaseTab tab-name="gps">
        <div class="content_wrapper">
            <div class="tab_title" v-html="$t('tabGPS')"></div>
            <WikiButton docUrl="gps" />

            <div class="grid grid-cols-1 lg:grid-cols-5 gap-4">
                <!-- Left Column: Configuration + Signal Strength -->
                <div class="lg:col-span-2 flex flex-col gap-4">
                    <!-- GPS Configuration -->
                    <UiBox :title="$t('configurationGPS')" :help="$t('configurationGPSHelp')">
                        <SettingRow
                            v-for="feature in gpsFeatures"
                            :key="feature.bit"
                            :label="$t(`feature${feature.name}`)"
                            :help="feature.haveTip ? $t(`feature${feature.name}Tip`) : $t('featureGPSTip')"
                        >
                            <USwitch
                                :model-value="isFeatureEnabled(feature)"
                                @update:model-value="toggleFeature(feature, $event)"
                            />
                        </SettingRow>

                        <SettingRow :label="$t('configurationGPSProtocol')">
                            <USelect
                                :items="gpsProtocolItems"
                                v-model="gpsConfig.provider"
                                @update:model-value="onGpsProtocolChange"
                                size="sm"
                                class="min-w-40"
                            />
                        </SettingRow>

                        <SettingRow v-if="showAutoBaud" :label="$t('configurationGPSAutoBaud')">
                            <USwitch v-model="autoBaudChecked" />
                        </SettingRow>

                        <SettingRow v-if="showAutoConfig" :label="$t('configurationGPSAutoConfig')">
                            <USwitch v-model="autoConfigChecked" />
                        </SettingRow>

                        <SettingRow
                            v-if="showUbloxGalileo"
                            :label="$t('configurationGPSGalileo')"
                            :help="$t('configurationGPSGalileoHelp')"
                        >
                            <USwitch v-model="ubloxGalileoChecked" />
                        </SettingRow>

                        <SettingRow :label="$t('configurationGPSHomeOnce')" :help="$t('configurationGPSHomeOnceHelp')">
                            <USwitch v-model="homeOnceChecked" />
                        </SettingRow>

                        <SettingRow v-if="showUbloxSbas" :label="$t('configurationGPSubxSbas')">
                            <USelect :items="gpsSbasItems" v-model="gpsConfig.ublox_sbas" size="sm" class="min-w-40" />
                        </SettingRow>
                    </UiBox>

                    <!-- GPS Signal Strength -->
                    <UiBox
                        :title="$t('gpsSignalStrHead')"
                        :help="$t('gpsSignalStrHeadHelp')"
                        :type="hasGpsSensor ? 'default' : 'warning'"
                        :highlight="!hasGpsSensor"
                    >
                        <div v-if="!hasGpsSensor" class="text-center p-2 text-sm" v-html="$t('gpsSignalLost')"></div>
                        <div v-if="hasGpsSensor" class="text-xs">
                            <div class="grid grid-cols-[12%_14%_30%_1fr] font-bold">
                                <div class="p-1" v-html="$t('gpsSignalGnssId')"></div>
                                <div class="p-1 text-center" v-html="$t('gpsSignalSatId')"></div>
                                <div class="p-1 text-center" v-html="$t('gpsSignalStr')"></div>
                                <div class="p-1 pl-2.5" v-html="$t('gpsSignalQuality')"></div>
                            </div>
                            <div
                                v-for="(row, index) in signalRows"
                                :key="index"
                                class="grid grid-cols-[12%_14%_30%_1fr] items-center"
                            >
                                <div class="p-1">{{ row.gnss }}</div>
                                <div class="p-1 text-center">
                                    <span
                                        v-if="typeof row.satId === 'number'"
                                        class="inline-block w-8 text-center px-1 py-0.5 rounded text-xs text-white"
                                        :class="row.satUsed ? 'bg-[var(--success-500)]' : 'bg-[var(--error-500)]'"
                                        :title="row.satUsed ? $t('gnssUsedUsed') : $t('gnssUsedUnused')"
                                    >
                                        {{ row.satId }}
                                    </span>
                                    <span v-else>-</span>
                                </div>
                                <div class="p-1">
                                    <UProgress :model-value="row.cno" :max="55" size="xs" color="success" />
                                </div>
                                <div class="p-1 pl-2.5">
                                    <span
                                        v-if="row.quality"
                                        class="px-1.5 py-0.5 rounded text-xs"
                                        :class="row.qualityClass"
                                    >
                                        {{ row.quality }}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </UiBox>
                </div>

                <!-- Right Column: GPS Info + Map -->
                <div class="lg:col-span-3 flex flex-col gap-4">
                    <!-- GPS Info -->
                    <UiBox :title="$t('gpsHead')" :help="$t('gpsHeadHelp')">
                        <div class="flex justify-between items-center">
                            <span v-html="$t('gps3dFix')"></span>
                            <span
                                class="px-1.5 py-0.5 rounded text-xs text-white"
                                :class="gpsInfo.fix ? 'bg-[var(--success-500)]' : 'bg-[var(--error-500)]'"
                            >
                                {{ gpsInfo.fix ? $t("gpsFixTrue") : $t("gpsFixFalse") }}
                            </span>
                        </div>
                        <div class="flex justify-between items-center">
                            <span v-html="$t('gpsSats')"></span>
                            <span>{{ gpsInfo.sats }}</span>
                        </div>
                        <div class="flex justify-between items-center">
                            <span v-html="$t('gpsAltitude')"></span>
                            <span>{{ gpsInfo.alt }} m</span>
                        </div>
                        <div class="flex justify-between items-center">
                            <span v-html="$t('gpsSpeed')"></span>
                            <span>{{ gpsInfo.speed }} cm/s</span>
                        </div>
                        <div class="flex justify-between items-center">
                            <span v-html="$t('gpsHeading')"></span>
                            <span>
                                {{ gpsInfo.headingImu.toFixed(0) }} / {{ gpsInfo.headingGps.toFixed(0) }}
                                {{ $t("gpsPositionUnit") }}
                            </span>
                        </div>
                        <div class="flex justify-between items-center">
                            <span v-html="$t('gpsLatitude')"></span>
                            <span>
                                <a :href="mapLink" target="_blank">
                                    {{ gpsInfo.latitude.toFixed(6) }} {{ $t("gpsPositionUnit") }}
                                </a>
                            </span>
                        </div>
                        <div class="flex justify-between items-center">
                            <span v-html="$t('gpsLongitude')"></span>
                            <span>
                                <a :href="mapLink" target="_blank">
                                    {{ gpsInfo.longitude.toFixed(6) }} {{ $t("gpsPositionUnit") }}
                                </a>
                            </span>
                        </div>
                        <div class="flex justify-between items-center">
                            <span v-html="$t('gpsDistToHome')"></span>
                            <span>{{ gpsInfo.distToHome }} m</span>
                        </div>
                        <div v-if="showPositionalDop" class="flex justify-between items-center">
                            <span v-html="$t('gpsPositionalDop')"></span>
                            <span v-html="gpsInfo.positionalDopDisplay"></span>
                        </div>
                        <div v-if="showPositionalDop && hasMag" class="flex justify-between items-center">
                            <span v-html="$t('gpsMagneticDeclination')"></span>
                            <span>{{ gpsInfo.magDeclination }} {{ $t("gpsPositionUnit") }}</span>
                        </div>
                    </UiBox>

                    <!-- GPS Map -->
                    <UiBox :title="$t('gpsMapHead')">
                        <div
                            v-show="showConnect"
                            class="flex flex-col items-center justify-center h-[433px] gap-2 text-center"
                        >
                            <div>{{ $t("gpsMapMessage1") }}</div>
                            <UButton variant="subtle" @click="checkConnectivity">
                                {{ $t("gpsMapRetry") }}
                            </UButton>
                        </div>
                        <div
                            v-show="showWaiting"
                            class="flex items-center justify-center h-[433px] w-full bg-no-repeat"
                            :style="{
                                backgroundImage: `url(${loadingBarsUrl})`,
                                backgroundSize: '15%',
                                backgroundPosition: 'center 40%',
                            }"
                        >
                            <div class="mt-[30%]">{{ $t("gpsMapMessage2") }}</div>
                        </div>
                        <div v-show="showLoadMap" ref="mapContainerRef" class="map-container h-[433px] w-full">
                            <div ref="mapRef" class="map h-[400px] w-full"></div>
                            <div
                                class="map-controls flex justify-end items-center gap-1 h-[33px] rounded-b px-1 bg-[#FAFAFA] dark:bg-transparent"
                            >
                                <UTooltip :text="$t('gpsMapSatelliteView')">
                                    <UButton
                                        size="xs"
                                        :variant="activeLayer === 'satellite' ? 'solid' : 'subtle'"
                                        @click="setLayer('satellite')"
                                    >
                                        S
                                    </UButton>
                                </UTooltip>
                                <UTooltip :text="$t('gpsMapHybridView')">
                                    <UButton
                                        size="xs"
                                        :variant="activeLayer === 'hybrid' ? 'solid' : 'subtle'"
                                        @click="setLayer('hybrid')"
                                    >
                                        H
                                    </UButton>
                                </UTooltip>
                                <UTooltip :text="$t('gpsMapStreetView')">
                                    <UButton
                                        size="xs"
                                        :variant="activeLayer === 'street' ? 'solid' : 'subtle'"
                                        @click="setLayer('street')"
                                    >
                                        R
                                    </UButton>
                                </UTooltip>
                                <UTooltip :text="$t('gpsMapZoomIn')">
                                    <UButton size="xs" variant="subtle" @click="zoomIn">+</UButton>
                                </UTooltip>
                                <UTooltip :text="$t('gpsMapZoomOut')">
                                    <UButton size="xs" variant="subtle" @click="zoomOut">–</UButton>
                                </UTooltip>
                                <UTooltip :text="$t('gpsMapToggleFullscreen')">
                                    <UButton
                                        size="xs"
                                        :variant="isFullscreen ? 'solid' : 'subtle'"
                                        @click="toggleFullscreen"
                                    >
                                        ⛶
                                    </UButton>
                                </UTooltip>
                            </div>
                        </div>
                    </UiBox>
                </div>
            </div>
        </div>

        <div class="content_toolbar toolbar_fixed_bottom">
            <div class="btn save_btn">
                <button type="button" class="save" @click="saveConfig">{{ $t("configurationButtonSave") }}</button>
            </div>
        </div>
    </BaseTab>
</template>

<script>
import { defineComponent, ref, reactive, computed, onMounted, onUnmounted, nextTick, watch } from "vue";
import BaseTab from "./BaseTab.vue";
import GUI from "../../js/gui";
import MSP from "../../js/msp";
import MSPCodes from "../../js/msp/MSPCodes";
import { mspHelper } from "../../js/msp/MSPHelper";
import { updateTabList } from "../../js/utils/updateTabList";
import { initMap } from "../../js/utils/map";
import { fromLonLat } from "ol/proj";
import { ispConnected } from "../../js/utils/connection";
import { gpsProtocols as getGpsProtocols } from "../../js/sensor_types";
import { have_sensor } from "../../js/sensor_helpers";
import semver from "semver";
import { API_VERSION_1_46 } from "../../js/data_storage";
import { i18n } from "../../js/localization";
import { bit_check, bit_clear, bit_set } from "../../js/bit";
import { useFlightControllerStore } from "@/stores/fc";
import { useConnectionStore } from "@/stores/connection";
import { useNavigationStore } from "@/stores/navigation";
import { useDialogStore } from "@/stores/dialog";
import { useInterval } from "../../composables/useInterval";
import WikiButton from "../elements/WikiButton.vue";
import UiBox from "../elements/UiBox.vue";
import SettingRow from "../elements/SettingRow.vue";

const loadingBarsUrl = new URL("../../images/loading-bars.svg", import.meta.url).href;

export default defineComponent({
    name: "GpsTab",
    components: {
        BaseTab,
        WikiButton,
        UiBox,
        SettingRow,
    },
    setup() {
        const fcStore = useFlightControllerStore();
        const connectionStore = useConnectionStore();
        const navigationStore = useNavigationStore();
        const dialogStore = useDialogStore();

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

        const gpsProtocols = ref([]);
        const gpsSbas = [
            i18n.getMessage("gpsSbasAutoDetect"),
            i18n.getMessage("gpsSbasEuropeanEGNOS"),
            i18n.getMessage("gpsSbasNorthAmericanWAAS"),
            i18n.getMessage("gpsSbasJapaneseMSAS"),
            i18n.getMessage("gpsSbasIndianGAGAN"),
            i18n.getMessage("gpsSbasNone"),
        ];

        const updateGpsProtocols = () => {
            gpsProtocols.value = getGpsProtocols();
        };

        const gpsProtocolItems = computed(() =>
            gpsProtocols.value.map((protocol, idx) => ({ label: protocol, value: idx })),
        );

        const gpsSbasItems = computed(() => gpsSbas.map((sbas, index) => ({ label: sbas, value: index })));

        const apiVersion = computed(() => fcStore.config.apiVersion);
        const hasGpsSensor = computed(() => have_sensor(fcStore.config.activeSensors, "gps"));
        const hasMag = computed(
            () => have_sensor(fcStore.config.activeSensors, "mag") && semver.gte(apiVersion.value, API_VERSION_1_46),
        );

        const gpsConfig = reactive({
            provider: 0,
            auto_baud: 0,
            auto_config: 0,
            ublox_use_galileo: 0,
            ublox_sbas: 0,
            home_point_once: 0,
        });

        const ubloxIndex = computed(() => gpsProtocols.value.indexOf("UBLOX"));
        const mspIndex = computed(() => gpsProtocols.value.indexOf("MSP"));

        const ubloxSelected = computed(() => gpsConfig.provider === ubloxIndex.value);
        const mspSelected = computed(() => gpsConfig.provider === mspIndex.value);
        const showAutoConfig = computed(() => ubloxSelected.value);
        const showAutoBaud = computed(
            () => (ubloxSelected.value || mspSelected.value) && semver.lt(apiVersion.value, API_VERSION_1_46),
        );
        const showUbloxGalileo = computed(() => showAutoConfig.value && gpsConfig.auto_config === 1);
        const showUbloxSbas = computed(() => showAutoConfig.value && gpsConfig.auto_config === 1);
        const showPositionalDop = computed(() => semver.gte(apiVersion.value, API_VERSION_1_46));

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
            if (!fcStore.features?.features?._features) {
                return [];
            }
            return fcStore.features.features._features.filter((feature) => feature.group === "gps");
        });

        const isFeatureEnabled = (feature) => {
            if (!fcStore.features?.features) return false;
            return bit_check(fcStore.features.features._featureMask, feature.bit);
        };

        const toggleFeature = (feature, checked) => {
            if (!fcStore.features?.features) return;
            if (checked) {
                fcStore.features.features._featureMask = bit_set(fcStore.features.features._featureMask, feature.bit);
            } else {
                fcStore.features.features._featureMask = bit_clear(fcStore.features.features._featureMask, feature.bit);
            }
            updateTabList(fcStore.features.features);
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
                qualityColor = "bg-[blue] text-white";
                stars = "★★★★★";
            } else if (positionalDop < 2) {
                qualityColor = "bg-[var(--success-500)] text-white";
                stars = "★★★★☆";
            } else if (positionalDop < 5) {
                qualityColor = "bg-[var(--warning-500)] text-white";
                stars = "★★★☆☆";
            } else if (positionalDop < 10) {
                qualityColor = "bg-[var(--primary-500)] text-black";
                stars = "★★☆☆☆";
            } else if (positionalDop < 20) {
                qualityColor = "bg-[var(--error-500)] text-white";
                stars = "★☆☆☆☆";
            } else {
                qualityColor = "bg-[var(--surface-500)] text-white";
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

            const gpsData = fcStore.gpsData || {};
            const channels = gpsData?.chn?.length || 0;

            if (channels > 16) {
                const maxUIChannels = 32;
                const channelCount = Math.min(maxUIChannels, channels) || 32;

                for (let i = 0; i < channelCount; i++) {
                    const gnssId = gpsData.chn[i];
                    if (gnssId >= 7) {
                        rows.push({ gnss: "-", satId: null, satUsed: false, cno: 0, quality: "", qualityClass: "" });
                        continue;
                    }

                    const satUsed = (gpsData.quality[i] & 0x8) >> 3;
                    const qualityValue = gpsData.quality[i] & 0x7;
                    const quality = i18n.getMessage(qualityArray[qualityValue]);
                    const qualityColor =
                        qualityValue >= 5
                            ? "bg-[var(--success-500)] text-white"
                            : qualityValue === 4
                                ? "bg-[var(--warning-500)] text-black"
                                : "bg-[var(--surface-500)] text-white";

                    rows.push({
                        gnss: gnssArray[gnssId],
                        satId: gpsData.svid[i],
                        satUsed: !!satUsed,
                        cno: gpsData.cno[i],
                        quality,
                        qualityClass: qualityColor,
                    });
                }
            } else {
                for (let i = 0; i < channels; i++) {
                    rows.push({
                        gnss: "-",
                        satId: gpsData.svid[i],
                        satUsed: false,
                        cno: gpsData.cno[i],
                        quality: gpsData.quality[i],
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
            const gpsData = fcStore.gpsData || {};
            const sensorData = fcStore.sensorData || {};
            const compassConfig = fcStore.compassConfig || {};

            const latitude = (gpsData?.latitude || 0) / 10000000;
            const longitude = (gpsData?.longitude || 0) / 10000000;
            const imuHeadingDegrees = sensorData?.kinematics?.[2] || 0;
            const imuHeadingRadians = ((imuHeadingDegrees + 180) * Math.PI) / 180;
            const gpsHeading = (gpsData?.ground_course || 0) / 10;

            gpsInfo.fix = !!gpsData?.fix;
            gpsInfo.sats = gpsData?.numSat || 0;
            gpsInfo.alt = gpsData?.alt || 0;
            gpsInfo.speed = gpsData?.speed || 0;
            gpsInfo.headingImu = imuHeadingDegrees;
            gpsInfo.headingGps = gpsHeading;
            gpsInfo.latitude = latitude;
            gpsInfo.longitude = longitude;
            gpsInfo.distToHome = gpsData?.distanceToHome || 0;

            if (showPositionalDop.value) {
                const positionalDop = Number(((gpsData?.positionalDop || 0) / 100).toFixed(2));
                const { qualityColor, stars } = getPositionalDopQuality(positionalDop);
                gpsInfo.positionalDopDisplay = `${stars} <span class="px-1.5 py-0.5 rounded text-xs ${qualityColor}">${positionalDop}</span>`;
                gpsInfo.magDeclination = hasMag.value ? (compassConfig?.mag_declination || 0).toFixed(1) : null;
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
            if (hasMag.value) {
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

        const { addInterval, removeAllIntervals } = useInterval();

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
                if (!connectionStore.connectionValid) {
                    GUI.content_ready();
                    return;
                }

                await MSP.promise(MSPCodes.MSP_FEATURE_CONFIG);
                await MSP.promise(MSPCodes.MSP_GPS_CONFIG);

                Object.assign(gpsConfig, fcStore.gpsConfig || {});

                await updateGpsProtocols();

                isOnline.value = ispConnected();
                isWaiting.value = true;
                showMap.value = false;

                addInterval("gps_pull", getRawGpsData, 100, true);
            } catch (error) {
                console.error("Failed to load GPS configuration", error);
                isOnline.value = ispConnected();
                isWaiting.value = false;
            } finally {
                GUI.content_ready();
            }
        };

        const saveConfig = async () => {
            Object.assign(fcStore.gpsConfig, gpsConfig);

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

        const teardown = () => {
            removeAllIntervals();
            document.removeEventListener("fullscreenchange", handleFullscreenChange);
            document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
            document.removeEventListener("MSFullscreenChange", handleFullscreenChange);
            if (mapInstance.value?.destroy) {
                mapInstance.value.destroy();
            }
            dialogStore.close();
        };

        onUnmounted(() => {
            navigationStore.cleanup(teardown);
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

        return {
            mapRef,
            mapContainerRef,
            activeLayer,
            isFullscreen,
            gpsProtocolItems,
            gpsSbasItems,
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
            loadingBarsUrl,
        };
    },
});
</script>

<style lang="less">
@import "ol/ol.css";

.tab-gps {
    .fullscreen-map-styles() {
        width: 100vw !important;
        height: 100vh !important;
        background-color: var(--surface-100);
        .map {
            height: calc(100vh - 33px) !important;
            width: 100vw !important;
        }
        .map-controls {
            position: fixed;
            bottom: 0;
            left: 0;
            width: 100vw !important;
            z-index: 1000;
        }
    }

    .map-container {
        &:fullscreen {
            .fullscreen-map-styles();
        }
        &:-webkit-full-screen {
            .fullscreen-map-styles();
        }
        &:-ms-fullscreen {
            .fullscreen-map-styles();
        }
    }
}
</style>
