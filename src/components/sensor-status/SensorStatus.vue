<template>
    <div class="sensor-status" :class="{ 'sensor-status--compact': compact }">
        <ul>
            <li class="gyro" :title="$t('sensorStatusGyro')" :class="{ on: setGyroActive }">
                <div class="gyroicon" :class="{ active: setGyroActive }">
                    {{ $t("sensorStatusGyroShort") }}
                </div>
            </li>
            <li class="accel" :title="$t('sensorStatusAccel')" :class="{ on: setAccActive }">
                <div class="accicon" :class="{ active: setAccActive }">
                    {{ $t("sensorStatusAccelShort") }}
                </div>
            </li>
            <li class="mag" :title="$t('sensorStatusMag')" :class="{ on: setMagActive }">
                <div class="magicon" :class="{ active: setMagActive }">
                    {{ $t("sensorStatusMagShort") }}
                </div>
            </li>
            <li class="baro" :title="$t('sensorStatusBaro')" :class="{ on: setBaroActive }">
                <div class="baroicon" :class="{ active: setBaroActive }">
                    {{ $t("sensorStatusBaroShort") }}
                </div>
            </li>
            <li class="gps" :class="{ on: gpsOn }" :title="$t('sensorStatusGPS')">
                <div
                    class="gpsicon"
                    :class="{
                        active: gpsActiveNoFix,
                        active_fix: gpsActiveWithFix,
                    }"
                >
                    {{ $t("sensorStatusGPSShort") }}
                </div>
            </li>
            <li class="sonar" :title="$t('sensorStatusSonar')" :class="{ on: setSonarActive }">
                <div class="sonaricon" :class="{ active: setSonarActive }">
                    {{ $t("sensorStatusSonarShort") }}
                </div>
            </li>
        </ul>
    </div>
</template>

<script setup>
import { computed } from "vue";
import { bit_check } from "../../js/bit";

const props = defineProps({
    sensorsDetected: { type: Number, default: 0 },
    gpsFixState: { type: Number, default: 0 },
    compact: { type: Boolean, default: false },
});

function haveSensor(sensorsDetected, sensorCode) {
    switch (sensorCode) {
        case "acc":
            return bit_check(sensorsDetected, 0);
        case "baro":
            return bit_check(sensorsDetected, 1);
        case "mag":
            return bit_check(sensorsDetected, 2);
        case "gps":
            return bit_check(sensorsDetected, 3);
        case "sonar":
            return bit_check(sensorsDetected, 4);
        case "gyro":
            return bit_check(sensorsDetected, 5);
    }
    return false;
}

const setAccActive = computed(() => haveSensor(props.sensorsDetected, "acc"));
const setGyroActive = computed(() => haveSensor(props.sensorsDetected, "gyro"));
const setBaroActive = computed(() => haveSensor(props.sensorsDetected, "baro"));
const setMagActive = computed(() => haveSensor(props.sensorsDetected, "mag"));
const setSonarActive = computed(() => haveSensor(props.sensorsDetected, "sonar"));
const gpsDetected = computed(() => haveSensor(props.sensorsDetected, "gps"));
const hasFix = computed(() => props.gpsFixState > 0);
const gpsOn = computed(() => gpsDetected.value || hasFix.value);
const gpsActiveNoFix = computed(() => gpsOn.value && gpsDetected.value && !hasFix.value);
const gpsActiveWithFix = computed(() => gpsOn.value && gpsDetected.value && hasFix.value);
</script>

<style scoped lang="less">
#sensor-status ul {
    font-family: "Open Sans", "Segoe UI", Tahoma, sans-serif;
    font-size: 12px;
    list-style: none;
    display: flex;
}
li {
    float: left;
    height: 67px;
    width: 33px;
    line-height: 18px;
    text-align: center;
    border-top: 1px solid #373737;
    border-bottom: 1px solid #1a1a1a;
    border-left: 1px solid #373737;
    border-right: 1px solid #222222;
    background-color: #434343;
    background-image: -webkit-linear-gradient(top, transparent, rgba(0, 0, 0, 0.45));
    padding-left: 5px;
    padding-right: 5px;
    &:last-child {
        border-right: 0 solid #c0c0c0;
        border-top-right-radius: 5px;
        border-bottom-right-radius: 5px;
    }
    &:first-child {
        border-left: 0 solid #c0c0c0;
        border-top-left-radius: 5px;
        border-bottom-left-radius: 5px;
    }
}
div {
    white-space: nowrap;
    overflow: hidden;
}
.on {
    background-color: #434343;
    background-image: -webkit-linear-gradient(top, transparent, rgba(0, 0, 0, 0.45));
}

.gyroicon {
    background-repeat: no-repeat;
    height: 30px;
    margin-top: 3px;
    width: 100%;
    padding-top: 40px;
    color: var(--text);
    text-align: center;
    background-image: url(../../images/icons/sensor_gyro_off.png);
    background-size: 43px;
    background-position: top;
}
.accicon {
    background-repeat: no-repeat;
    height: 30px;
    margin-top: 3px;
    width: 100%;
    padding-top: 40px;
    color: var(--text);
    text-align: center;
    background-image: url(../../images/icons/sensor_acc_off.png);
    background-size: 40px;
    background-position: -5px 2px;
}
.magicon {
    background-repeat: no-repeat;
    height: 30px;
    margin-top: 3px;
    width: 100%;
    padding-top: 40px;
    color: var(--text);
    text-align: center;
    background-image: url(../../images/icons/sensor_mag_off.png);
    background-size: 42px;
    background-position: -5px 2px;
}
.gpsicon {
    background-repeat: no-repeat;
    height: 30px;
    margin-top: 3px;
    width: 100%;
    padding-top: 40px;
    color: var(--text);
    text-align: center;
    background-image: url(../../images/icons/sensor_sat_off.png);
    background-size: 42px;
    background-position: -5px 2px;
}
.baroicon {
    background-repeat: no-repeat;
    height: 30px;
    margin-top: 3px;
    width: 100%;
    padding-top: 40px;
    color: var(--text);
    text-align: center;
    background-image: url(../../images/icons/sensor_baro_off.png);
    background-size: 40px;
    background-position: -5px 2px;
}
.sonaricon {
    background-repeat: no-repeat;
    height: 30px;
    margin-top: 3px;
    width: 100%;
    padding-top: 40px;
    color: var(--text);
    text-align: center;
    background-image: url(../../images/icons/sensor_sonar_off.png);
    background-size: 41px;
    background-position: -4px 1px;
}
.gyroicon.active {
    color: #818181;
    background-image: url(../../images/icons/sensor_gyro_on.png);
}
.accicon.active {
    color: #818181;
    background-image: url(../../images/icons/sensor_acc_on.png);
}
.magicon.active {
    color: #818181;
    background-image: url(../../images/icons/sensor_mag_on.png);
}
.gpsicon.active {
    color: #818181;
    background-image: url(../../images/icons/sensor_sat_on_no_fix.png);
}
.gpsicon.active_fix {
    color: #818181;
    background-image: url(../../images/icons/sensor_sat_on_with_fix.png);
}
.baroicon.active {
    color: #818181;
    background-image: url(../../images/icons/sensor_baro_on.png);
}
.sonaricon.active {
    color: #818181;
    background-image: url(../../images/icons/sensor_sonar_on.png);
}

.sensor-status--compact {
    background-color: transparent;
    display: inline-block;
}

.sensor-status--compact li {
    width: 2rem;
    height: auto;
    background: none;
    border: 0;
    padding: 0;
    margin-right: 0.25rem;
}

.sensor-status--compact .gyroicon,
.sensor-status--compact .accicon,
.sensor-status--compact .magicon,
.sensor-status--compact .baroicon,
.sensor-status--compact .gpsicon,
.sensor-status--compact .sonaricon {
    padding-top: 1.4rem;
    height: 0;
    background-size: 22px;
    background-position: center 0;
    font-size: 9px;
    margin-top: 0;
}
</style>
