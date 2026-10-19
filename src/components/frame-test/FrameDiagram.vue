<template>
    <!-- the quad seen from above, front up; each motor's own peaks stacked beside its corner -->
    <div class="mx-auto grid w-fit grid-cols-[minmax(4.5rem,auto)_auto_minmax(4.5rem,auto)] gap-x-2">
        <div
            v-for="side in SIDES"
            :key="side.column"
            class="flex flex-col justify-between"
            :class="[side.items, side.place]"
        >
            <div
                v-for="index in side.motors"
                :key="index"
                class="flex gap-1"
                :class="[index === side.motors[0] ? 'flex-col' : 'flex-col-reverse', side.items]"
            >
                <UBadge
                    v-for="peak in motors[index].peaks ?? []"
                    :key="peak.label"
                    :color="peak.color"
                    variant="subtle"
                    size="sm"
                    class="tabular-nums"
                    :title="peak.title"
                    :label="peak.label"
                />
            </div>
        </div>
        <div class="relative col-start-2 row-start-1 size-56">
            <svg viewBox="0 0 200 200" class="size-full" role="img" :aria-label="$t('frameDiagramAlt')">
                <path
                    d="M40 40 160 160M40 160 160 40"
                    class="text-(--ui-border-accented)"
                    stroke="currentColor"
                    stroke-width="28"
                    stroke-linecap="round"
                    fill="none"
                />
                <circle
                    v-for="(at, index) in MOTOR_AT"
                    :key="index"
                    :cx="at.x"
                    :cy="at.y"
                    r="28"
                    class="text-primary"
                    stroke="currentColor"
                    stroke-width="4"
                    fill="none"
                />
            </svg>
            <!-- the motors where they sit -->
            <UBadge
                v-for="(at, index) in MOTOR_AT"
                :key="index"
                :color="motors[index].color"
                variant="solid"
                size="lg"
                class="absolute -translate-x-1/2 -translate-y-1/2 tabular-nums"
                :style="{ left: `${at.x / 2}%`, top: `${at.y / 2}%` }"
                :title="motors[index].title"
                :label="motors[index].label"
            />
            <!-- the frame's own modes, the ones most motors drive, in the middle -->
            <div class="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1">
                <UBadge
                    v-for="mode in centre"
                    :key="mode.label"
                    :color="mode.color"
                    variant="solid"
                    size="sm"
                    class="tabular-nums"
                    :title="mode.title"
                    :label="mode.label"
                />
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import type { PropType } from "vue";

type BadgeColor = "success" | "warning" | "error" | "neutral";

export interface MotorBadge {
    label: string;
    color: BadgeColor;
    title?: string;
    /** The motor's own peaks, listed beside its corner. */
    peaks?: { label: string; color: BadgeColor; title?: string }[];
}

defineProps({
    /** Motors 1-4, Betaflight Quad X numbering. */
    motors: {
        type: Array as PropType<MotorBadge[]>,
        required: true,
    },
    /** The frame's modes most motors drive, shown in the middle. */
    centre: {
        type: Array as PropType<NonNullable<MotorBadge["peaks"]>>,
        default: () => [],
    },
});

// Quad X, front up: motor 1 rear right, 2 front right, 3 rear left, 4 front left (viewBox units).
const MOTOR_AT = [
    { x: 160, y: 160 },
    { x: 160, y: 40 },
    { x: 40, y: 160 },
    { x: 40, y: 40 },
];
// Per side the front motor first (its peaks grow down from the top), then the rear one (up from the bottom).
const SIDES = [
    { column: "left", motors: [3, 2], items: "items-end", place: "col-start-1 row-start-1" },
    { column: "right", motors: [1, 0], items: "items-start", place: "col-start-3 row-start-1" },
];
</script>
