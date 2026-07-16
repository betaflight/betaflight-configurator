<template>
    <div class="battery-icon">
        <div class="quad-status-contents">
            <div class="battery-status" :class="classes" :style="{ width: batteryWidth + '%' }" />
        </div>
    </div>
</template>

<script>
import { defineComponent, computed } from "vue";

const NO_BATTERY_VOLTAGE_MAXIMUM = 1.8;

export default defineComponent({
    props: {
        batteryState: {
            type: String,
            default: "",
        },
        voltage: {
            type: Number,
            default: 0,
        },
        vbatmaxcellvoltage: {
            type: Number,
            default: 1,
        },
        vbatwarningcellvoltage: {
            type: Number,
            default: 1,
        },
    },
    setup(props) {
        const nbCells = computed(() => {
            let cells = Math.floor(props.voltage / props.vbatmaxcellvoltage) + 1;
            if (props.voltage === 0) {
                cells = 1;
            }
            return cells;
        });

        const min = computed(() => {
            return props.vbatwarningcellvoltage * nbCells.value;
        });

        const max = computed(() => {
            return props.vbatmaxcellvoltage * nbCells.value;
        });

        const warn = computed(() => {
            return props.vbatwarningcellvoltage * nbCells.value;
        });

        const isEmpty = computed(() => {
            return props.voltage < min.value && props.voltage > NO_BATTERY_VOLTAGE_MAXIMUM;
        });

        const classes = computed(() => {
            if (props.batteryState) {
                return {
                    "state-ok": props.batteryState === "0",
                    "state-warning": props.batteryState === "1",
                    "state-empty": props.batteryState === "2",
                    // TODO: BATTERY_NOT_PRESENT
                    // TODO: BATTERY_INIT
                };
            }
            const isWarning = props.voltage < warn.value;
            return {
                "state-empty": isEmpty.value,
                "state-warning": isWarning,
                "state-ok": !isEmpty.value && !isWarning,
            };
        });

        const batteryWidth = computed(() => {
            return isEmpty.value ? 100 : ((props.voltage - min.value) / (max.value - min.value)) * 100;
        });

        return {
            nbCells,
            min,
            max,
            warn,
            isEmpty,
            classes,
            batteryWidth,
        };
    },
});
</script>

<style scoped>
.quad-status-contents {
    display: inline-block;
    margin-top: 10px;
    margin-left: 14px;
    height: 10px;
    width: 31px;
}

.quad-status-contents progress::-webkit-progress-bar {
    height: 12px;
    background-color: var(--surface-300);
}

.quad-status-contents progress::-webkit-progress-value {
    background-color: #bcf;
}

.battery-icon {
    background-image: url(../../images/icons/cf_icon_bat_grey.svg);
    background-size: contain;
    background-position: center;
    display: inline-block;
    height: 30px;
    width: 60px;
    transition: none;
    margin-top: 4px;
    margin-left: -4px;
    background-repeat: no-repeat;
}

.battery-status {
    height: 11px;
}

@keyframes error-blinker {
    0% {
        background-color: transparent;
    }
    50% {
        background-color: var(--error-500);
    }
}

.battery-status.state-ok {
    background-color: #59aa29;
}
.battery-status.state-warning {
    background-color: var(--error-500);
}

.battery-status.state-empty {
    animation: error-blinker 1s linear infinite;
}
</style>
