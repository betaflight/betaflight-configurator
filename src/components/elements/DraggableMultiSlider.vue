<template>
    <div class="w-full">
        <USlider
            v-model="rangeValue"
            v-range-drag="{
                getRange: () => rangeValue,
                setRange: (nextRange) => {
                    rangeValue = nextRange;
                },
                min,
                max,
                step,
            }"
            :min="min"
            :max="max"
            :step="step"
            :min-steps-between-thumbs="minRangeGap / step"
            size="xl"
            :ui="{
                track: 'bg-elevated',
                thumb: 'cursor-pointer',
                range: 'rounded-none cursor-w-resize',
            }"
        />
    </div>
</template>

<script>
import { computed, defineComponent } from "vue";

const DEFAULT_RANGE = [1300, 1700];

const vRangeDrag = {
    mounted(el, binding) {
        const rangeEl = el.querySelector('[data-slot="range"]');
        if (!rangeEl) {
            return;
        }

        rangeEl.style.touchAction = "none";

        let drag = null;

        const getRange = () => binding.value?.getRange?.() || DEFAULT_RANGE;
        const setRange = (nextRange) => binding.value?.setRange?.(nextRange);
        const getLimits = () => ({
            min: binding.value?.min ?? 900,
            max: binding.value?.max ?? 2100,
            step: binding.value?.step ?? 25,
        });

        const onPointerDown = (e) => {
            if (e.button !== 0) {
                return;
            }

            const [start, end] = getRange();
            const { min, max, step } = getLimits();
            const trackWidth = (el.querySelector('[data-slot="track"]') || el).getBoundingClientRect().width;
            if (!trackWidth) {
                return;
            }

            drag = {
                min,
                max,
                step,
                startX: e.clientX,
                startValue: start,
                rangeWidth: end - start,
                trackWidth,
            };

            rangeEl.setPointerCapture(e.pointerId);
            e.preventDefault();
            e.stopPropagation();
        };

        const onPointerMove = (e) => {
            if (!drag) {
                return;
            }

            e.stopPropagation();

            const rawDelta = ((drag.max - drag.min) * (e.clientX - drag.startX)) / drag.trackWidth;
            const delta = Math.round(rawDelta / drag.step) * drag.step;
            const nextStart = Math.max(drag.min, Math.min(drag.max - drag.rangeWidth, drag.startValue + delta));
            setRange([nextStart, nextStart + drag.rangeWidth]);
        };

        const clearDrag = () => {
            drag = null;
        };

        rangeEl.addEventListener("pointerdown", onPointerDown);
        rangeEl.addEventListener("pointermove", onPointerMove);
        rangeEl.addEventListener("pointerup", clearDrag);
        rangeEl.addEventListener("pointercancel", clearDrag);
        rangeEl.addEventListener("lostpointercapture", clearDrag);

        el.__rangeDragCleanup = () => {
            rangeEl.removeEventListener("pointerdown", onPointerDown);
            rangeEl.removeEventListener("pointermove", onPointerMove);
            rangeEl.removeEventListener("pointerup", clearDrag);
            rangeEl.removeEventListener("pointercancel", clearDrag);
            rangeEl.removeEventListener("lostpointercapture", clearDrag);
        };
    },
    unmounted(el) {
        el.__rangeDragCleanup?.();
        delete el.__rangeDragCleanup;
    },
};

export default defineComponent({
    name: "DraggableMultiSlider",
    directives: {
        "range-drag": vRangeDrag,
    },
    props: {
        modelValue: {
            type: Array,
            required: true,
        },
        min: {
            type: Number,
            default: 900,
        },
        max: {
            type: Number,
            default: 2100,
        },
        step: {
            type: Number,
            default: 25,
        },
        minRangeGap: {
            type: Number,
            default: 25,
        },
    },
    emits: ["update:modelValue"],
    setup(props, { emit }) {
        const clampChannel = (value) => {
            if (value === undefined || value === null || Number.isNaN(value)) {
                return (props.min + props.max) / 2;
            }
            if (value < props.min) {
                return props.min;
            }
            if (value > props.max) {
                return props.max;
            }
            return value;
        };

        const snapChannel = (value) => {
            const numericValue = Number(value);
            if (Number.isNaN(numericValue)) {
                return DEFAULT_RANGE[0];
            }
            return clampChannel(Math.round(numericValue / props.step) * props.step);
        };

        const normalizeRangeValues = (values) => {
            const [rawStart = DEFAULT_RANGE[0], rawEnd = DEFAULT_RANGE[1]] = Array.isArray(values) ? values : [];
            let start = snapChannel(rawStart);
            let end = snapChannel(rawEnd);

            if (start > end) {
                [start, end] = [end, start];
            }

            if (end - start < props.minRangeGap) {
                if (start <= props.min) {
                    end = Math.min(props.max, start + props.minRangeGap);
                } else {
                    start = Math.max(props.min, end - props.minRangeGap);
                }
            }

            return [start, end];
        };

        const rangeValue = computed({
            get: () => normalizeRangeValues(props.modelValue),
            set: (value) => emit("update:modelValue", normalizeRangeValues(value)),
        });

        return {
            rangeValue,
        };
    },
});
</script>
