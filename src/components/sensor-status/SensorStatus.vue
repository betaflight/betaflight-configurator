<template>
  <div
    id="sensor-status"
    class="sensor_state mode-connected"
    style="display: block"
  >
    <ul>
      <li
        class="gyro"
        :title="$t('sensorStatusGyro')"
        :class="{ on: setGyroActive }"
      >
        <div
          class="gyroicon"
          :class="{ active: setGyroActive }"
        >
          {{ $t('sensorStatusGyroShort') }}
        </div>
      </li>
      <li
        class="accel"
        :title="$t('sensorStatusAccel')"
        :class="{ on: setAccActive }"
      >
        <div
          class="accicon"
          :class="{ active: setAccActive }"
        >
          {{ $t('sensorStatusAccelShort') }}
        </div>
      </li>
      <li
        class="mag"
        :title="$t('sensorStatusMag')"
        :class="{ on: setMagActive }"
      >
        <div
          class="magicon"
          :class="{ active: setMagActive }"
        >
          {{ $t('sensorStatusMagShort') }}
        </div>
      </li>
      <li
        class="baro"
        :title="$t('sensorStatusBaro')"
        :class="{ on: setBaroActive }"
      >
        <div
          class="baroicon"
          :class="{ active: setBaroActive }"
        >
          {{ $t('sensorStatusBaroShort') }}
        </div>
      </li>
      <li
        class="gps"
        :class="{ on: setGpsActive }"
        :title="$t('sensorStatusGPS')"
      >
        <div
          class="gpsicon"
          :class="{
            active: setGpsFixState && setGpsActive,
            active_fix: !setGpsFixState && setGpsActive,
          }"
        >
          {{ $t('sensorStatusGPSShort') }}
        </div>
      </li>
      <li
        class="sonar"
        :title="$t('sensorStatusSonar')"
        :class="{ on: setSonarActive }"
      >
        <div
          class="sonaricon"
          :class="{ active: setSonarActive }"
        >
          {{ $t('sensorStatusSonarShort') }}
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
