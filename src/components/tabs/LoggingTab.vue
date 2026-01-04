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
                    v-html="$t('betaflightSupportButton')"
                ></a>
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

        <div class="content_toolbar toolbar_fixed_bottom">
            <div class="btn file_btn">
                <a class="log_file" href="#" @click.prevent="selectLogFile" v-html="$t('loggingButtonLogFile')"></a>
            </div>
            <div class="btn back_btn">
                <a class="back" href="#" v-html="$t('loggingBack')"></a>
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
import FC from "../../js/fc.js";
import FileSystem from "../../js/FileSystem";
import MSP from "../../js/msp.js";
import MSPCodes from "../../js/msp/MSPCodes.js";
import CONFIGURATOR from "../../js/data_storage.js";
import { gui_log } from "../../js/gui_log.js";

const PROPERTY_OPTIONS = [
    {
        code: "MSP_RAW_IMU",
        label: "MSP_RAW_IMU",
        description: "9 columns (gyro[x, y, z], accel[x, y, z], mag[x, y, z])",
    },
    {
        code: "MSP_ATTITUDE",
        label: "MSP_ATTITUDE",
        description: "3 columns (kine[x, y, z])",
    },
    {
        code: "MSP_ALTITUDE",
        label: "MSP_ALTITUDE",
        description: "1 column (alt)",
    },
    {
        code: "MSP_RAW_GPS",
        label: "MSP_RAW_GPS",
        description: "7 columns (Fix, NumSat, Lat, Lon, Alt, Speed, GroundCourse)",
    },
    {
        code: "MSP_ANALOG",
        label: "MSP_ANALOG",
        description: "4 columns (voltage, amperage, mAhdrawn, rssi)",
    },
    {
        code: "MSP_RC",
        label: "MSP_RC",
        description: "8 columns (RC0, RC1, RC2, RC3, RC4, RC5, RC6, RC7)",
    },
    {
        code: "MSP_MOTOR",
        label: "MSP_MOTOR",
        description: "8 columns (Mot1, Mot2, Mot3, Mot4, Mot5, Mot6, Mot7, Mot8)",
    },
    {
        code: "MSP_DEBUG",
        label: "MSP_DEBUG",
        description: "4 columns (Debug0, Debug1, Debug2, Debug3)",
    },
];

const SPEED_OPTIONS = [10, 20, 30, 40, 50, 100, 250, 500, 1000, 2000, 5000];
const LOG_POLL_INTERVAL = "log_data_poll";
const LOG_WRITE_INTERVAL = "write_data";

export default defineComponent({
    name: "LoggingTab",
    components: {
        BaseTab,
    },
    setup() {
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

        const propertyOptions = PROPERTY_OPTIONS;
        const speedOptions = SPEED_OPTIONS;

        const documentationHref = computed(() => "https://betaflight.com/docs/wiki/configurator/logging-tab");
        const logFileName = computed(() => fileEntry.value?.name ?? "");
        const startStopLabel = computed(() =>
            isLogging.value ? i18n.getMessage("loggingStop") : i18n.getMessage("loggingStart"),
        );
        const canToggle = computed(() => (isLogging.value || !!fileEntry.value) && !isBusy.value);

        function sendInitialRequests() {
            if (!CONFIGURATOR.connectionValid) {
                GUI.content_ready();
                return;
            }

            MSP.send_message(MSPCodes.MSP_RC, false, false, () => {
                MSP.send_message(MSPCodes.MSP_MOTOR, false, false, () => {
                    GUI.content_ready();
                });
            });
        }

        async function selectLogFile() {
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
            let head = "timestamp";

            requestedProperties.forEach((property) => {
                switch (property) {
                    case "MSP_RAW_IMU":
                        head += "," + "gyroscopeX";
                        head += "," + "gyroscopeY";
                        head += "," + "gyroscopeZ";

                        head += "," + "accelerometerX";
                        head += "," + "accelerometerY";
                        head += "," + "accelerometerZ";

                        head += "," + "magnetometerX";
                        head += "," + "magnetometerY";
                        head += "," + "magnetometerZ";
                        break;
                    case "MSP_ATTITUDE":
                        head += "," + "kinematicsX";
                        head += "," + "kinematicsY";
                        head += "," + "kinematicsZ";
                        break;
                    case "MSP_ALTITUDE":
                        head += "," + "altitude";
                        break;
                    case "MSP_RAW_GPS":
                        head += "," + "gpsFix";
                        head += "," + "gpsNumSat";
                        head += "," + "gpsLat";
                        head += "," + "gpsLon";
                        head += "," + "gpsAlt";
                        head += "," + "gpsSpeed";
                        head += "," + "gpsGroundCourse";
                        break;
                    case "MSP_ANALOG":
                        head += "," + "voltage";
                        head += "," + "amperage";
                        head += "," + "mAhdrawn";
                        head += "," + "rssi";
                        break;
                    case "MSP_RC":
                        for (let chan = 0; chan < FC.RC.active_channels; chan++) {
                            head += `${"," + "RC"}${chan}`;
                        }
                        break;
                    case "MSP_MOTOR":
                        for (let motor = 0; motor < FC.MOTOR_DATA.length; motor++) {
                            head += `${"," + "Motor"}${motor}`;
                        }
                        break;
                    case "MSP_DEBUG":
                        for (let debug = 0; debug < FC.SENSOR_DATA.debug.length; debug++) {
                            head += `${"," + "Debug"}${debug}`;
                        }
                        break;
                }
            });

            return `${head}\n`;
        }

        function crunchData() {
            let sample = millitime();

            const formatCsvValue = (value) => {
                if (Array.isArray(value)) {
                    return value.map((item) => String(item)).join(",");
                }
                return String(value);
            };

            requestedProperties.forEach((property) => {
                switch (property) {
                    case "MSP_RAW_IMU":
                        sample += `,${formatCsvValue(FC.SENSOR_DATA.gyroscope)}`;
                        sample += `,${formatCsvValue(FC.SENSOR_DATA.accelerometer)}`;
                        sample += `,${formatCsvValue(FC.SENSOR_DATA.magnetometer)}`;
                        break;
                    case "MSP_ATTITUDE":
                        sample += `,${FC.SENSOR_DATA.kinematics[0]}`;
                        sample += `,${FC.SENSOR_DATA.kinematics[1]}`;
                        sample += `,${FC.SENSOR_DATA.kinematics[2]}`;
                        break;
                    case "MSP_ALTITUDE":
                        sample += `,${FC.SENSOR_DATA.altitude}`;
                        break;
                    case "MSP_RAW_GPS":
                        sample += `,${FC.GPS_DATA.fix}`;
                        sample += `,${FC.GPS_DATA.numSat}`;
                        sample += `,${FC.GPS_DATA.lat / 10000000}`;
                        sample += `,${FC.GPS_DATA.lon / 10000000}`;
                        sample += `,${FC.GPS_DATA.alt}`;
                        sample += `,${FC.GPS_DATA.speed}`;
                        sample += `,${FC.GPS_DATA.ground_course}`;
                        break;
                    case "MSP_ANALOG":
                        sample += `,${FC.ANALOG.voltage}`;
                        sample += `,${FC.ANALOG.amperage}`;
                        sample += `,${FC.ANALOG.mAhdrawn}`;
                        sample += `,${FC.ANALOG.rssi}`;
                        break;
                    case "MSP_RC":
                        for (let chan = 0; chan < FC.RC.active_channels; chan++) {
                            sample += `,${FC.RC.channels[chan]}`;
                        }
                        break;
                    case "MSP_MOTOR":
                        sample += `,${formatCsvValue(FC.MOTOR_DATA)}`;
                        break;
                    case "MSP_DEBUG":
                        sample += `,${formatCsvValue(FC.SENSOR_DATA.debug)}`;
                        break;
                }
            });

            logBuffer.push(sample);
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

            if (!GUI.connected_to) {
                gui_log(i18n.getMessage("loggingErrorNotConnected"));
                return;
            }

            if (!fileEntry.value) {
                gui_log(i18n.getMessage("loggingErrorLogFile"));
                return;
            }

            if (!selectedProperties.value.length) {
                gui_log(i18n.getMessage("loggingErrorOneProperty"));
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
                    parseInt(samplingInterval.value, 10),
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
                        await fileWriter.value.close();
                    } catch (closeError) {
                        console.error("Error closing file after start failure:", closeError);
                    }
                    fileWriter.value = null;
                }
                console.error("Failed to start logging:", error);
                gui_log(i18n.getMessage("loggingErrorLogFile"));
            } finally {
                isBusy.value = false;
            }
        }

        async function toggleLogging() {
            if (!canToggle.value && !isLogging.value) {
                gui_log(i18n.getMessage("loggingErrorLogFile"));
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

        onUnmounted(() => {
            isDestroyed = true;
            stopLogging(true);
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
