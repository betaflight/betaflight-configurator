<template>
    <BaseTab tab-name="logging">
        <div class="content_wrapper">
            <div class="tab_title" v-html="$t('tabLogging')"></div>
            <div class="cf_doc_version_bt">
                <a
                    id="button-documentation"
                    :href="documentationHref"
                    target="_blank"
                    rel="noopener noreferrer"
                    :aria-label="$t('betaflightSupportButton')"
                >
                    {{ $t("betaflightSupportButton") }}
                </a>
            </div>
            <div class="note">
                <p v-html="$t('loggingNote')"></p>
            </div>
            <div class="properties">
                <dl>
                    <template v-for="prop in propertyOptions" :key="prop.code">
                        <dt>
                            <label>
                                <input
                                    type="checkbox"
                                    :name="prop.code"
                                    :value="prop.code"
                                    v-model="selectedProperties"
                                    :disabled="isLogging"
                                />
                                {{ prop.label }}
                            </label>
                        </dt>
                        <dd>{{ prop.description }}</dd>
                    </template>
                </dl>
            </div>
            <select class="speed" name="speed" v-model.number="samplingInterval" :disabled="isLogging">
                <option v-for="option in speedOptions" :key="option" :value="option">{{ option }} ms</option>
            </select>
            <div class="info">
                <dl>
                    <dt v-html="$t('loggingSamplesSaved')"></dt>
                    <dd class="samples">{{ samplesSaved }}</dd>
                    <dt v-html="$t('loggingLogName')"></dt>
                    <dd class="name">{{ logFileName || "—" }}</dd>
                </dl>
            </div>
        </div>

        <div class="content_toolbar toolbar_fixed_bottom" style="position: fixed">
            <div class="btn file_btn">
                <a
                    class="log_file"
                    :class="{ disabled: isLogging || isBusy }"
                    href="#"
                    @click.prevent="selectLogFile"
                    :aria-label="$t('loggingButtonLogFile')"
                    :aria-disabled="isLogging || isBusy"
                >
                    {{ $t("loggingButtonLogFile") }}
                </a>
            </div>
            <div class="btn logging_btn">
                <a
                    class="logging"
                    :class="{ disabled: !canToggle }"
                    href="#"
                    @click.prevent="toggleLogging"
                    :aria-disabled="!canToggle"
                >
                    {{ startStopLabel }}
                </a>
            </div>
        </div>
    </BaseTab>
</template>

<script>
import { computed, defineComponent, onMounted, onUnmounted, ref } from "vue";
import BaseTab from "./BaseTab.vue";
import { millitime } from "../../js/utils/common.js";
import GUI from "../../js/gui";
import { generateFilename } from "../../js/utils/generate_filename.js";
import { i18n } from "../../js/localization";
import FileSystem from "../../js/FileSystem";
import MSP from "../../js/msp.js";
import MSPCodes from "../../js/msp/MSPCodes.js";
import { useFlightControllerStore } from "@/stores/fc";
import { useConnectionStore } from "@/stores/connection";
import { useDialog } from "@/composables/useDialog";

const PROPERTY_ORDER = [
    "MSP_RAW_IMU",
    "MSP_ATTITUDE",
    "MSP_ALTITUDE",
    "MSP_RAW_GPS",
    "MSP_ANALOG",
    "MSP_RC",
    "MSP_MOTOR",
    "MSP_DEBUG",
];

const SPEED_OPTIONS = [10, 20, 30, 40, 50, 100, 250, 500, 1000, 2000, 5000];
const LOG_POLL_INTERVAL = "log_data_poll";
const LOG_WRITE_INTERVAL = "write_data";

function sendInitialRequests() {
    const connectionStore = useConnectionStore();
    if (!connectionStore.connectionValid) {
        GUI.content_ready();
        return;
    }

    MSP.send_message(MSPCodes.MSP_RC, false, false, () => {
        MSP.send_message(MSPCodes.MSP_MOTOR, false, false, () => {
            GUI.content_ready();
        });
    });
}

export default defineComponent({
    name: "LoggingTab",
    components: {
        BaseTab,
    },
    setup() {
        const fcStore = useFlightControllerStore();
        const connectionStore = useConnectionStore();
        const dialog = useDialog();

        const selectedProperties = ref([]);
        const samplingInterval = ref(100);
        const samplesSaved = ref(0);
        const fileEntry = ref(null);
        const fileWriter = ref(null);
        const isLogging = ref(false);
        const isBusy = ref(false);

        let logBuffer = [];
        let requestedProperties = [];
        let hasPreviousRequest = false;
        let isDestroyed = false;

        const propertyDefinitions = {
            MSP_RAW_IMU: {
                label: "MSP_RAW_IMU",
                description: "9 columns (gyro[x, y, z], accel[x, y, z], mag[x, y, z])",
                columns: () => [
                    "gyroscopeX",
                    "gyroscopeY",
                    "gyroscopeZ",
                    "accelerometerX",
                    "accelerometerY",
                    "accelerometerZ",
                    "magnetometerX",
                    "magnetometerY",
                    "magnetometerZ",
                ],
                values: () => {
                    const data = fcStore.sensorData || {};
                    return [...(data.gyroscope || []), ...(data.accelerometer || []), ...(data.magnetometer || [])];
                },
            },
            MSP_ATTITUDE: {
                label: "MSP_ATTITUDE",
                description: "3 columns (kine[x, y, z])",
                columns: () => ["kinematicsX", "kinematicsY", "kinematicsZ"],
                values: () => {
                    const data = fcStore.sensorData || {};
                    const kinematics = data.kinematics || [];
                    return [kinematics[0] ?? 0, kinematics[1] ?? 0, kinematics[2] ?? 0];
                },
            },
            MSP_ALTITUDE: {
                label: "MSP_ALTITUDE",
                description: "1 column (alt)",
                columns: () => ["altitude"],
                values: () => {
                    const data = fcStore.sensorData || {};
                    return [data.altitude ?? 0];
                },
            },
            MSP_RAW_GPS: {
                label: "MSP_RAW_GPS",
                description: "7 columns (Fix, NumSat, Lat, Lon, Alt, Speed, GroundCourse)",
                columns: () => ["gpsFix", "gpsNumSat", "gpsLat", "gpsLon", "gpsAlt", "gpsSpeed", "gpsGroundCourse"],
                values: () => {
                    const gps = fcStore.gpsData || {};
                    return [
                        gps.fix ?? 0,
                        gps.numSat ?? 0,
                        (gps.lat ?? 0) / 10000000,
                        (gps.lon ?? 0) / 10000000,
                        gps.alt ?? 0,
                        gps.speed ?? 0,
                        gps.ground_course ?? 0,
                    ];
                },
            },
            MSP_ANALOG: {
                label: "MSP_ANALOG",
                description: "4 columns (voltage, amperage, mAhdrawn, rssi)",
                columns: () => ["voltage", "amperage", "mAhdrawn", "rssi"],
                values: () => {
                    const analog = fcStore.analogData || {};
                    return [analog.voltage ?? 0, analog.amperage ?? 0, analog.mAhdrawn ?? 0, analog.rssi ?? 0];
                },
            },
            MSP_RC: {
                label: "MSP_RC",
                description: "8 columns (RC0, RC1, RC2, RC3, RC4, RC5, RC6, RC7)",
                columns: () => {
                    const rc = fcStore.rc || {};
                    const channels = rc.channels || [];
                    const count = rc.active_channels ?? channels.length;
                    return Array.from({ length: count }, (_, chan) => `RC${chan}`);
                },
                values: () => {
                    const rc = fcStore.rc || {};
                    const channels = rc.channels || [];
                    const count = rc.active_channels ?? channels.length;
                    return channels.slice(0, count);
                },
            },
            MSP_MOTOR: {
                label: "MSP_MOTOR",
                description: "8 columns (Mot1, Mot2, Mot3, Mot4, Mot5, Mot6, Mot7, Mot8)",
                columns: () => {
                    const motors = fcStore.motorData || [];
                    const length = Array.isArray(motors) ? motors.length : 0;
                    return Array.from({ length }, (_, motor) => `Motor${motor}`);
                },
                values: () => {
                    const motors = fcStore.motorData || [];
                    return Array.isArray(motors) ? [...motors] : [];
                },
            },
            MSP_DEBUG: {
                label: "MSP_DEBUG",
                description: "4 columns (Debug0, Debug1, Debug2, Debug3)",
                columns: () => {
                    const data = fcStore.sensorData || {};
                    const debug = data.debug || [];
                    return Array.from({ length: debug.length }, (_, idx) => `Debug${idx}`);
                },
                values: () => {
                    const data = fcStore.sensorData || {};
                    const debug = data.debug || [];
                    return [...debug];
                },
            },
        };

        const propertyOptions = PROPERTY_ORDER.map((code) => {
            const definition = propertyDefinitions[code];
            return {
                code,
                label: definition.label,
                description: definition.description,
            };
        });
        const speedOptions = SPEED_OPTIONS;

        const documentationHref = computed(() => "https://betaflight.com/docs/wiki/configurator/logging-tab");
        const logFileName = computed(() => fileEntry.value?.name ?? "");
        const startStopLabel = computed(() =>
            isLogging.value ? i18n.getMessage("loggingStop") : i18n.getMessage("loggingStart"),
        );
        const canToggle = computed(() => (isLogging.value || !!fileEntry.value) && !isBusy.value);

        async function selectLogFile() {
            if (isLogging.value || isBusy.value) {
                return;
            }
            const prefix = "log";
            const suffix = "csv";
            const filename = generateFilename(prefix, suffix);

            try {
                const file = await FileSystem.pickSaveFile(
                    filename,
                    i18n.getMessage("fileSystemPickerFiles", { typeof: suffix.toUpperCase() }),
                    `.${suffix}`,
                );
                fileEntry.value = file;
            } catch (error) {
                console.error("Log file selection failed:", error);
            }
        }

        function buildHeader() {
            const columns = ["timestamp"];

            requestedProperties.forEach((property) => {
                const definition = propertyDefinitions[property];
                if (!definition) {
                    return;
                }
                columns.push(...definition.columns());
            });

            return `${columns.join(",")}\n`;
        }

        function crunchData() {
            const row = [millitime()];

            requestedProperties.forEach((property) => {
                const definition = propertyDefinitions[property];
                if (!definition) {
                    return;
                }
                row.push(...definition.values());
            });

            logBuffer.push(row.join(","));
        }

        function appendToFile(data) {
            if (!fileWriter.value) {
                return Promise.resolve();
            }

            return FileSystem.writeChunck(fileWriter.value, new Blob([data], { type: "text/plain" })).catch((error) => {
                console.error("Error appending to file:", error);
            });
        }

        function sendRequests() {
            requestedProperties.forEach((property) => {
                if (MSPCodes[property]) {
                    MSP.send_message(MSPCodes[property]);
                }
            });
        }

        function writePendingData() {
            if (!fileWriter.value || !logBuffer.length) {
                return Promise.resolve();
            }

            const rowsToPersist = logBuffer.length;
            const payload = logBuffer.join("\n").concat("\n");
            logBuffer = [];

            return appendToFile(payload).then(() => {
                samplesSaved.value += rowsToPersist;
            });
        }

        async function stopLogging(force = false) {
            if (isBusy.value && !force) {
                return;
            }

            isBusy.value = true;

            GUI.interval_remove(LOG_POLL_INTERVAL);
            GUI.interval_remove(LOG_WRITE_INTERVAL);

            await writePendingData();

            if (fileWriter.value) {
                try {
                    await FileSystem.closeFile(fileWriter.value);
                } catch (error) {
                    console.error("Error closing file:", error);
                }
            }

            fileWriter.value = null;
            requestedProperties = [];
            hasPreviousRequest = false;
            isLogging.value = false;
            isBusy.value = false;
        }

        async function startLogging() {
            if (isBusy.value) {
                return;
            }

            if (!connectionStore.connectedTo) {
                dialog.openInfo("Error", i18n.getMessage("loggingErrorNotConnected"));
                return;
            }

            if (!fileEntry.value) {
                dialog.openInfo("Error", i18n.getMessage("loggingErrorLogFile"));
                return;
            }

            if (!selectedProperties.value.length) {
                dialog.openInfo("Error", i18n.getMessage("loggingErrorOneProperty"));
                return;
            }

            isBusy.value = true;
            requestedProperties = [...selectedProperties.value];
            logBuffer = [];
            samplesSaved.value = 0;
            hasPreviousRequest = false;

            try {
                fileWriter.value = await FileSystem.openFile(fileEntry.value);
                await appendToFile(buildHeader());

                if (isDestroyed) {
                    await stopLogging(true);
                    return;
                }

                GUI.interval_add(
                    LOG_POLL_INTERVAL,
                    () => {
                        if (hasPreviousRequest) {
                            crunchData();
                        }

                        sendRequests();
                        hasPreviousRequest = true;
                    },
                    samplingInterval.value,
                    true,
                );

                GUI.interval_add(
                    LOG_WRITE_INTERVAL,
                    () => {
                        writePendingData();
                    },
                    1000,
                );

                isLogging.value = true;
            } catch (error) {
                if (fileWriter.value) {
                    try {
                        await FileSystem.closeFile(fileWriter.value);
                    } catch (closeError) {
                        console.error("Error closing file after start failure:", closeError);
                    }
                    fileWriter.value = null;
                }
                console.error("Failed to start logging:", error);
                dialog.openInfo("Error", i18n.getMessage("loggingErrorLogFile"));
            } finally {
                isBusy.value = false;
            }
        }

        async function toggleLogging() {
            if (!isLogging.value && !fileEntry.value) {
                dialog.openInfo("Error", i18n.getMessage("loggingErrorLogFile"));
                return;
            }

            if (isLogging.value) {
                await stopLogging();
            } else {
                await startLogging();
            }
        }

        onMounted(() => {
            sendInitialRequests();
        });

        onUnmounted(async () => {
            isDestroyed = true;
            await stopLogging(true);
        });

        return {
            propertyOptions,
            speedOptions,
            selectedProperties,
            samplingInterval,
            samplesSaved,
            fileEntry,
            isLogging,
            isBusy,
            documentationHref,
            logFileName,
            startStopLabel,
            canToggle,
            selectLogFile,
            toggleLogging,
        };
    },
});
</script>

<style scoped>
.tab-logging {
    /* Reuse existing global styles from logging.less */
}
</style>
