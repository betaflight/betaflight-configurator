<template>
  <div
    id="sensor-status"
    class="sensor_state mode-connected"
    style="display: block"
  >
    <ul>
      <li
        i18n_title="sensorStatusGyro"
        class="gyro i18n_title-replaced"
        title="Gyroscope"
        :class="{ on: setGyroActive }"
      >
        <div
          i18n="sensorStatusGyroShort"
          class="gyroicon i18n-replaced"
          :class="{ active: setGyroActive }"
        >
          Gyro
        </div>
      </li>
      <li
        i18n_title="sensorStatusAccel"
        class="accel i18n_title-replaced"
        title="Accelerometer"
        :class="{ on: setAccActive }"
      >
        <div
          i18n="sensorStatusAccelShort"
          class="accicon i18n-replaced"
          :class="{ active: setAccActive }"
        >
          Accel
        </div>
      </li>
      <li
        i18n_title="sensorStatusMag"
        class="mag i18n_title-replaced"
        title="Magnetometer"
        :class="{ on: setMagActive }"
      >
        <div
          i18n="sensorStatusMagShort"
          class="magicon i18n-replaced"
          :class="{ active: setMagActive }"
        >
          Mag
        </div>
      </li>
      <li
        i18n_title="sensorStatusBaro"
        class="baro i18n_title-replaced"
        title="Barometer"
        :class="{ on: setBaroActive }"
      >
        <div
          i18n="sensorStatusBaroShort"
          class="baroicon i18n-replaced"
          :class="{ active: setBaroActive }"
        >
          Baro
        </div>
      </li>
      <li
        i18n_title="sensorStatusGPS"
        class="gps i18n_title-replaced"
        :class="{ on: setGpsActive }"
        title="GPS"
      >
        <div
          i18n="sensorStatusGPSShort"
          class="gpsicon i18n-replaced"
          :class="{
            active: setGpsFixState && setGpsActive,
            active_fix: !setGpsFixState && setGpsActive,
          }"
        >
          GPS
        </div>
      </li>
      <li
        i18n_title="sensorStatusSonar"
        class="sonar i18n_title-replaced"
        title="Sonar / Range finder"
        :class="{ on: setSonarActive }"
      >
        <div
          i18n="sensorStatusSonarShort"
          class="sonaricon i18n-replaced"
          :class="{ active: setSonarActive }"
        >
          Sonar
        </div>
      </li>
    </ul>
  </div>
</template>

<script>
import { bit_check } from "../../js/bit";

export default {
    props: {
        sensorsDetected: {
            type: Number,
            default: 0,
        },
        gpsFixState: {
            type: Number,
            default: 0,
        },
    },
    computed: {
        setAccActive() {
            return this.haveSensor(this.sensorsDetected, "acc");
        },
        setGyroActive() {
            return this.haveSensor(this.sensorsDetected, "gyro");
        },
        setBaroActive() {
            return this.haveSensor(this.sensorsDetected, "baro");
        },
        setMagActive() {
            return this.haveSensor(this.sensorsDetected, "mag");
        },
        setGpsActive() {
            return this.haveSensor(this.sensorsDetected, "gps");
        },
        setGpsFixState() {
            return this.gpsFixState !== 0;
        },
        setSonarActive() {
            return this.haveSensor(this.sensorsDetected, "sonar");
        },
    },
    methods: {
        haveSensor(sensorsDetected, sensorCode) {
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
        },
    },
};
</script>

<style scoped>
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
    background-image: -webkit-linear-gradient(
        top,
        transparent,
        rgba(0, 0, 0, 0.45)
    );
    padding-left: 5px;
    padding-right: 5px;
    text-shadow: 0 1px rgba(0, 0, 0, 1);
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
    background-image: -webkit-linear-gradient(
        top,
        transparent,
        rgba(0, 0, 0, 0.45)
    );
}

.gyroicon {
    background-repeat: no-repeat;
    height: 30px;
    margin-top: 3px;
    width: 100%;
    padding-top: 40px;
    color: #4f4f4f;
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
    color: #4f4f4f;
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
    color: #4f4f4f;
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
    color: #4f4f4f;
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
    color: #4f4f4f;
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
    color: #4f4f4f;
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
</style>
