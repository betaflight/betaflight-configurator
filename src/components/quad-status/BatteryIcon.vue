<template>
    <div class="battery-icon shrink-0" :class="{ 'battery-icon--compact': compact }">
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
            type: [String, Number],
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
        compact: {
            type: Boolean,
            default: false,
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
            const state = String(props.batteryState ?? "");
            if (state) {
                return {
                    "state-ok": state === "0",
                    "state-warning": state === "1",
                    "state-empty": state === "2",
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
    position: absolute;
    top: 10px;
    left: 14px;
    height: 10px;
    width: 31px;
}

.battery-icon {
    position: relative;
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
    max-width: 100%;
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

.battery-icon--compact {
    margin-top: 0;
    margin-left: 0;
    height: 24px;
    width: 48px;
}

.battery-icon--compact .quad-status-contents {
    top: 8px;
    left: 11px;
    width: 26px;
    height: 8px;
}

.battery-icon--compact .battery-status {
    height: 9px;
}
</style>
