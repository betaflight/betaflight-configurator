<template>
    <!-- the quad seen from above, front up -->
    <div class="mx-auto w-fit">
        <div class="relative size-56">
            <svg viewBox="0 0 200 200" class="size-full" role="img" :aria-label="$t('frameDiagramAlt')">
                <path
                    d="M40 40 160 160M40 160 160 40"
                    class="text-(--ui-border-accented)"
                    stroke="currentColor"
                    stroke-width="28"
                    stroke-linecap="round"
                    fill="none"
                />
                <!-- the prop circle; with a spin check an arrow round it the way the motor turns, green / red when the
                     check confirms / contradicts the direction set -->
                <template v-for="(at, index) in MOTOR_AT" :key="index">
                    <g v-if="motors[index].spin" :class="SPIN_RING[motors[index].spin!.state]">
                        <title>{{ motors[index].spin!.title }}</title>
                        <path
                            :d="spinArc(at, motors[index].spin!.cw).arc"
                            stroke="currentColor"
                            stroke-width="4"
                            stroke-linecap="round"
                            fill="none"
                        />
                        <path :d="spinArc(at, motors[index].spin!.cw).head" fill="currentColor" />
                    </g>
                    <circle
                        v-else
                        :cx="at.x"
                        :cy="at.y"
                        r="28"
                        :class="SPIN_RING.none"
                        stroke="currentColor"
                        stroke-width="4"
                        fill="none"
                    />
                </template>
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

/** A frame mode most motors drive, shown in the middle. */
export interface CentreMode {
    label: string;
    color: BadgeColor;
    title?: string;
}

export interface MotorBadge {
    label: string;
    color: BadgeColor;
    title?: string;
    /** Its spin direction seen from above, and whether the spin check agrees ("unknown": no answer). */
    spin?: { cw: boolean; state: "ok" | "wrong" | "unknown"; title: string };
}

defineProps({
    /** Motors 1-4, Betaflight Quad X numbering. */
    motors: {
        type: Array as PropType<MotorBadge[]>,
        required: true,
    },
    /** The frame's modes most motors drive, shown in the middle. */
    centre: {
        type: Array as PropType<CentreMode[]>,
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
const SPIN_RING: Record<string, string> = {
    ok: "text-success",
    wrong: "text-error",
    unknown: "text-dimmed",
    none: "text-primary",
};
const RING_R = 28;
const ARC_GAP_DEG = 50; // the opening the arrowhead points into, on the outer side

/** The prop circle as an arrow round the motor the way it turns (seen from above), its opening on the outer side. */
function spinArc(at: { x: number; y: number }, cw: boolean): { arc: string; head: string } {
    const outward = Math.atan2(at.y - 100, at.x - 100); // screen angle, y down: clockwise is increasing
    const half = (ARC_GAP_DEG / 2) * (Math.PI / 180);
    const dir = cw ? 1 : -1;
    const a0 = outward + dir * half;
    const a1 = outward + dir * (2 * Math.PI - half);
    const point = (a: number, r = RING_R) => [at.x + r * Math.cos(a), at.y + r * Math.sin(a)];
    const [x0, y0] = point(a0);
    const [x1, y1] = point(a1);
    const arc = `M${x0.toFixed(2)} ${y0.toFixed(2)} A${RING_R} ${RING_R} 0 1 ${cw ? 1 : 0} ${x1.toFixed(2)} ${y1.toFixed(2)}`;
    // the head: its tip on along the turn, its base across the ring
    const tx = -Math.sin(a1) * dir;
    const ty = Math.cos(a1) * dir;
    const nx = Math.cos(a1);
    const ny = Math.sin(a1);
    const tip = [x1 + tx * 9, y1 + ty * 9];
    const b1 = [x1 + nx * 7, y1 + ny * 7];
    const b2 = [x1 - nx * 7, y1 - ny * 7];
    const head = `M${tip.map((v) => v.toFixed(2)).join(" ")} L${b1.map((v) => v.toFixed(2)).join(" ")} L${b2
        .map((v) => v.toFixed(2))
        .join(" ")} Z`;
    return { arc, head };
}
</script>
