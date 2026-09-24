<template>
    <div class="w-full">
        <USlider
            v-model="rangeValue"
            v-range-drag="{
                getRange: () => rangeValue,
                setRange: (nextRange: number[]) => {
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

<script lang="ts">
import { computed, defineComponent } from "vue";
import type { DirectiveBinding, PropType } from "vue";

const DEFAULT_RANGE = [1300, 1700];

/** What the directive is bound to: the slider range plus its limits. */
interface RangeDragBinding {
    getRange?: () => number[];
    setRange?: (next: number[]) => void;
    min?: number;
    max?: number;
    step?: number;
}

/** Live state for one drag of the whole range, captured on pointerdown. */
interface DragState {
    min: number;
    max: number;
    step: number;
    directionSign: number;
    startX: number;
    startValue: number;
    rangeWidth: number;
    trackWidth: number;
}

/** The cleanup hook the directive parks on the element between mounted and unmounted. */
type RangeDragElement = HTMLElement & { __rangeDragCleanup?: () => void };

const vRangeDrag = {
    mounted(el: RangeDragElement, binding: DirectiveBinding<RangeDragBinding>) {
        const rangeEl = el.querySelector<HTMLElement>('[data-slot="range"]');
        if (!rangeEl) {
            return;
        }

        rangeEl.style.touchAction = "none";

        let drag: DragState | null = null;

        const getRange = () => binding.value?.getRange?.() || DEFAULT_RANGE;
        const setRange = (nextRange: number[]) => binding.value?.setRange?.(nextRange);
        const getLimits = () => ({
            min: binding.value?.min ?? 900,
            max: binding.value?.max ?? 2100,
            step: binding.value?.step ?? 25,
        });

        // The slider mirrors itself in RTL locales, so a pointer moving right walks the value
        // down. Read the direction per drag: the language can change while the tab is mounted.
        const getDirectionSign = () => (getComputedStyle(rangeEl).direction === "rtl" ? -1 : 1);

        const onPointerDown = (e: PointerEvent) => {
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
                directionSign: getDirectionSign(),
                startX: e.clientX,
                startValue: start,
                rangeWidth: end - start,
                trackWidth,
            };

            rangeEl.setPointerCapture(e.pointerId);
            e.preventDefault();
            e.stopPropagation();
        };

        const onPointerMove = (e: PointerEvent) => {
            if (!drag) {
                return;
            }

            e.stopPropagation();

            const pointerDelta = (e.clientX - drag.startX) * drag.directionSign;
            const rawDelta = ((drag.max - drag.min) * pointerDelta) / drag.trackWidth;
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
    unmounted(el: RangeDragElement) {
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
            type: Array as PropType<number[]>,
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
        const clampChannel = (value: number) => {
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

        const snapChannel = (value: number) => {
            const numericValue = Number(value);
            if (Number.isNaN(numericValue)) {
                return DEFAULT_RANGE[0];
            }
            return clampChannel(Math.round(numericValue / props.step) * props.step);
        };

        const normalizeRangeValues = (values: number[]) => {
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
