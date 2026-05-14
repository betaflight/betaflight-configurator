<template>
    <div :class="ledClasses">
        <div class="indicators">
            <span class="north" v-show="led.directions.includes('n')"></span>
            <span class="south" v-show="led.directions.includes('s')"></span>
            <span class="west" v-show="led.directions.includes('w')"></span>
            <span class="east" v-show="led.directions.includes('e')"></span>
            <span class="up" v-show="led.directions.includes('u')">U</span>
            <span class="down" v-show="led.directions.includes('d')">D</span>
        </div>
        <span class="wire">{{ led.wireNumber }}</span>
        <span class="overlay-t" v-show="led.functions.includes('t')"> </span>
        <span class="overlay-y" v-show="led.functions.includes('y')"> </span>
        <span class="overlay-o" v-show="led.functions.includes('o')"> </span>
        <span class="overlay-b" v-show="led.functions.includes('b')"> </span>
        <span class="overlay-v" v-show="led.functions.includes('v')"> </span>
        <span class="overlay-i" v-show="led.functions.includes('i')"> </span>
        <span class="overlay-w" v-show="led.functions.includes('w')"> </span>
        <span
            class="overlay-color"
            v-show="showColorOverlay"
            :class="'color-' + led.colorIndex"
            :style="{ backgroundColor: colorStyle }"
        ></span>
    </div>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
    led: {
        type: Object,
        required: true,
    },
    index: {
        type: Number,
        required: true,
    },
    wireMode: {
        type: Boolean,
        default: false,
    },
    isSelected: {
        type: Boolean,
        default: false,
    },
    hsvToColor: {
        type: Function,
        required: true,
    },
    ledColors: {
        type: Array,
        required: true,
    },
});

// Computed classes for LED cell
const ledClasses = computed(() => {
    const classes = ["gPoint"];

    // Add function classes
    props.led.functions.forEach((func) => {
        classes.push(`function-${func}`);
    });

    // Add direction classes
    props.led.directions.forEach((dir) => {
        classes.push(`dir-${dir}`);
    });

    // Add color class
    if (props.led.colorIndex !== null) {
        classes.push(`color-${props.led.colorIndex}`);
    }

    // Add selection class
    if (props.isSelected) {
        classes.push("ui-selected");
    }

    return classes;
});

// Show color overlay for certain functions OR when LED is selected/configured
const showColorOverlay = computed(() => {
    // Show if specific functions are set
    if (props.led.functions.some((f) => ["c", "r", "b", "u"].includes(f))) {
        return true;
    }
    // Also show if LED has a wire number (is configured) OR is selected
    if (props.led.wireNumber !== "" || props.isSelected) {
        return true;
    }
    return false;
});

// Color style for overlay
const colorStyle = computed(() => {
    const colors = props.ledColors;
    if (!Array.isArray(colors) || !colors[props.led.colorIndex]) {
        return "";
    }
    return props.hsvToColor(colors[props.led.colorIndex]);
});
</script>

<style scoped>
/* Base gPoint styles */
.gPoint {
    float: left;
    border: solid 1px var(--surface-500);
    width: 23px;
    height: 23px;
    margin: 3px;
    border-radius: 7px;
    background: var(--surface-300);
    cursor: pointer;
    position: relative;
}

.gPoint:hover {
    opacity: 0.9;
}

/* Selection states */
.gPoint.ui-selected {
    box-shadow: inset 0 0 8px rgba(255, 0, 255, 1) !important;
    border: solid 1px #000 !important;
}

/* Function-specific backgrounds */
.gPoint.function-s {
    background: brown;
    box-shadow: inset 0 0 30px rgba(0, 0, 0, 0.7);
    border-color: rgb(52, 155, 255);
}

.gPoint.function-c {
    background: linear-gradient(
        to bottom right,
        rgba(255, 0, 0, 0.5) 0%,
        rgba(255, 255, 0, 0.5) 15%,
        rgba(0, 255, 0, 0.5) 30%,
        rgba(0, 255, 255, 0.5) 50%,
        rgba(0, 0, 255, 0.5) 65%,
        rgba(255, 0, 255, 0.5) 80%,
        rgba(255, 0, 0, 0.5) 100%
    );
    box-shadow: inset 0 0 30px rgba(0, 0, 0, 0.7);
    border-color: grey;
}

.gPoint.function-f {
    background: rgb(50, 205, 50);
    box-shadow: inset 0 0 30px rgba(0, 0, 0, 0.7);
    border-color: rgb(50, 205, 50);
}

.gPoint.function-a {
    background: rgb(52, 155, 255);
    box-shadow: inset 0 0 30px rgba(0, 0, 0, 0.7);
    border-color: rgb(52, 155, 255);
}

.gPoint.function-l {
    background: magenta;
    box-shadow: inset 0 0 30px rgba(0, 0, 0, 0.7);
    border-color: rgb(52, 155, 255);
}

.gPoint.function-r {
    background: radial-gradient(
        ellipse at center,
        rgba(0, 0, 0, 1) 0%,
        rgba(0, 0, 0, 1) 60%,
        white 60%,
        white 70%,
        black 70%,
        black 100%
    );
    box-shadow: inset 0 0 30px rgba(0, 0, 0, 0.7);
    border-color: black;
}

.gPoint.function-g {
    background: green;
    box-shadow: inset 0 0 30px rgba(0, 0, 0, 0.7);
    border-color: rgb(52, 155, 255);
}

.gPoint.function-p {
    background: rgb(0, 128, 85);
    box-shadow: inset 0 0 30px rgba(0, 0, 0, 0.7);
    border-color: rgb(52, 155, 255);
}

.gPoint.function-e {
    background: rgb(0, 0, 128);
    box-shadow: inset 0 0 30px rgba(0, 0, 0, 0.7);
    border-color: rgb(52, 155, 255);
}

.gPoint.function-u {
    background: linear-gradient(
        to bottom right,
        rgba(191, 0, 255, 0.5) 0%,
        rgba(0, 179, 255, 0.5) 33%,
        rgba(0, 4, 255, 0.5) 66%,
        rgba(191, 0, 255, 0.5) 100%
    );
    box-shadow: inset 0 0 30px rgba(0, 0, 0, 0.7);
    border-color: grey;
}

/* Wire number display */
.wire {
    text-align: center;
    font-size: 12px;
    display: block;
    margin-left: -1px;
    margin-top: -21px;
    width: 24px;
    height: 24px;
    color: white;
    text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
    line-height: 24px;
}

/* Direction indicators */
.indicators {
    position: relative;
    height: 24px;
}

.indicators span {
    width: 0;
    height: 0;
    position: absolute;
    display: none;
    font-size: 10px;
    font-weight: bold;
}

.indicators .north {
    top: -9px;
    left: 5px;
    border-left: 7px solid transparent;
    border-right: 7px solid transparent;
    border-bottom: 7px solid rgba(0, 0, 0, 0.8);
}

.indicators .south {
    bottom: -8px;
    left: 5px;
    border-left: 7px solid transparent;
    border-right: 7px solid transparent;
    border-top: 7px solid rgba(0, 0, 0, 0.8);
}

.indicators .east {
    bottom: 7px;
    right: -9px;
    border-top: 7px solid transparent;
    border-bottom: 7px solid transparent;
    border-left: 7px solid rgba(0, 0, 0, 0.8);
}

.indicators .west {
    bottom: 7px;
    left: -9px;
    border-top: 7px solid transparent;
    border-bottom: 7px solid transparent;
    border-right: 7px solid rgba(0, 0, 0, 0.8);
}

.indicators .up {
    display: none;
    width: auto;
    height: auto;
    top: 0px;
    left: 2px;
    color: white;
    text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
}

.indicators .down {
    display: none;
    width: auto;
    height: auto;
    bottom: 17px;
    right: 10px;
    color: white;
    text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
}

/* Show indicators based on direction classes */
.gPoint.dir-n .north {
    display: inline;
}

.gPoint.dir-s .south {
    display: inline;
}

.gPoint.dir-e .east {
    display: inline;
}

.gPoint.dir-w .west {
    display: inline;
}

.gPoint.dir-u .up {
    display: inline;
}

.gPoint.dir-d .down {
    display: inline;
}

/* Overlay indicators */
.gPoint.function-w .overlay-w {
    float: left;
    height: 6px;
    width: 16px;
    background-image: radial-gradient(1px at 8px 50%, red 0%, red 2px, rgba(0, 0, 0, 0.3) 3px, rgba(0, 0, 0, 0) 4px);
    margin-top: -30px;
    margin-left: -9px;
}

.gPoint.function-v .overlay-v {
    float: left;
    height: 6px;
    width: 16px;
    background-image: radial-gradient(
        1px at 8px 50%,
        black 0%,
        black 2px,
        rgba(0, 0, 0, 0.3) 3px,
        rgba(0, 0, 0, 0) 4px
    );
    margin-top: -6px;
    margin-left: 4px;
}

.gPoint.function-i .overlay-i {
    float: left;
    height: 6px;
    width: 16px;
    background-image: radial-gradient(
        1px at 8px 50%,
        yellow 0%,
        yellow 2px,
        rgba(0, 0, 0, 0.3) 3px,
        rgba(0, 0, 0, 0) 4px
    );
    margin-top: -30px;
    margin-left: 16px;
}

.gPoint.function-t .overlay-t {
    float: left;
    height: 6px;
    width: 16px;
    background-image: radial-gradient(
        1px at 8px 50%,
        orange 0%,
        orange 2px,
        rgba(0, 0, 0, 0.3) 3px,
        rgba(0, 0, 0, 0) 4px
    );
    margin-top: -6px;
    margin-left: -9px;
}

.gPoint.function-o .overlay-o {
    float: left;
    height: 6px;
    width: 16px;
    background-image: radial-gradient(
        1px at 8px 50%,
        brown 0%,
        brown 2px,
        rgba(0, 0, 0, 0.3) 3px,
        rgba(0, 0, 0, 0) 4px
    );
    margin-top: -6px;
    margin-left: 16px;
}

.gPoint.function-b .overlay-b {
    float: left;
    height: 6px;
    width: 16px;
    background-image: radial-gradient(
        1px at 8px 50%,
        rgb(52, 155, 255) 0%,
        rgb(52, 155, 255) 2px,
        rgba(0, 0, 0, 0.3) 3px,
        rgba(0, 0, 0, 0) 4px
    );
    margin-top: -18px;
    margin-left: -9px;
}

.gPoint.function-y .overlay-y {
    float: left;
    height: 6px;
    width: 16px;
    background-image: radial-gradient(
        1px at 8px 50%,
        rgb(0, 242, 12) 0%,
        rgb(0, 242, 12) 2px,
        rgba(0, 0, 0, 0.3) 3px,
        rgba(0, 0, 0, 0) 4px
    );
    margin-top: -30px;
    margin-left: 4px;
}

.gPoint.function-s .overlay-s {
    float: left;
    height: 6px;
    width: 16px;
    background-image: radial-gradient(
        1px at 8px 50%,
        brown 0%,
        brown 2px,
        rgba(0, 0, 0, 0.3) 3px,
        rgba(0, 0, 0, 0) 4px
    );
    margin-top: -6px;
    margin-left: 16px;
}

/* Color overlay for color function */
.gPoint.function-c .overlay-color,
.gPoint.function-r .overlay-color,
.gPoint.function-b .overlay-color,
.gPoint.function-u .overlay-color,
.gPoint .overlay-color {
    float: left;
    height: 15px;
    width: 15px;
    margin-top: -23px;
    margin-left: 4px;
    border-radius: 4px;
    display: block;
}
</style>
