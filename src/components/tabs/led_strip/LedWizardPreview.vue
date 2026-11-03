<!--
This file is part of Betaflight.

Betaflight is free software. You can redistribute this software
and/or modify this software under the terms of the GNU General
Public License as published by the Free Software Foundation,
either version 3 of the License, or (at your option) any later
version.

Betaflight is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
See the GNU General Public License for more details.

You should have received a copy of the GNU General Public
License along with this software.
If not, see <http://www.gnu.org/licenses/>.
-->
<template>
    <figure class="led-wizard-preview">
        <svg viewBox="0 0 400 320" role="img" :aria-label="$t('ledWizardPreview')">
            <g v-for="(arm, index) in arms" :key="index">
                <line class="arm" :x1="arm.start.x" :y1="arm.start.y" :x2="arm.end.x" :y2="arm.end.y" />
                <text class="arm-label" :x="arm.label.x" :y="arm.label.y" text-anchor="middle">
                    {{ $t("ledWizardArm", { index: index + 1 }) }}
                </text>
                <g v-for="led in arm.leds" :key="led.index">
                    <circle :cx="led.x" :cy="led.y" :r="radius" :style="{ fill: off ? 'var(--surface-100)' : color }" />
                    <line
                        v-if="off"
                        class="off-mark"
                        :x1="led.x - radius"
                        :y1="led.y + radius"
                        :x2="led.x + radius"
                        :y2="led.y - radius"
                    />
                    <text v-if="led.showIndex" :x="led.x" :y="led.y + 22" text-anchor="middle">
                        {{ led.index }}
                    </text>
                </g>
                <path class="arrow" :d="arm.arrow" />
            </g>
            <rect v-if="model.layout !== 'strip'" x="178" y="138" width="44" height="44" rx="8" />
            <text v-if="model.layout !== 'strip'" x="200" y="165" text-anchor="middle">
                {{ $t("ledWizardCenter") }}
            </text>
        </svg>
        <figcaption>
            {{ $t(model.topology === "parallel" ? "ledWizardPreviewParallelNote" : "ledWizardPreviewNote") }}
        </figcaption>
    </figure>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { ledsPerArm, previewArmIndices, type LedWizardModel } from "@/composables/ledWizard";

const props = defineProps<{ model: LedWizardModel; color: string; off: boolean }>();
const radius = computed(() => {
    const count = Number.isFinite(props.model.count) ? props.model.count : 0;
    return Math.min(9, 65 / Math.max(1, ledsPerArm({ ...props.model, count }) ?? 0));
});
const arms = computed(() => {
    const model = props.model;
    const indices = previewArmIndices(model);
    const perArm = indices[0]?.length ?? 0;
    const vectors =
        model.layout === "four"
            ? [
                  [-1, -1],
                  [1, -1],
                  [-1, 1],
                  [1, 1],
              ]
            : model.layout === "two"
              ? [
                    [-1, 0],
                    [1, 0],
                ]
              : [[1, 0]];
    return vectors.map(([dx, dy], arm) => {
        const center = model.layout === "strip" ? { x: 25, y: 160 } : { x: 200, y: 160 };
        const length = model.layout === "strip" ? 340 : 115;
        const point = (distance: number) => ({ x: center.x + dx * distance, y: center.y + dy * distance });
        const start = point(model.layout === "strip" ? 0 : 32);
        const end = point(length);
        const spacing = Math.hypot(end.x - start.x, end.y - start.y) / Math.max(1, perArm - 1);
        // Reserve seven units per digit plus a gap for the 12px index labels.
        const labelWidth = Math.max(...indices[arm].map((index) => String(index).length), 1) * 7 + 4;
        const leds = Array.from({ length: perArm }, (_, position) => {
            const distance = perArm === 1 ? 0.5 : position / (perArm - 1);
            return {
                x: start.x + (end.x - start.x) * distance,
                y: start.y + (end.y - start.y) * distance,
                index: indices[arm][position],
                showIndex: spacing >= labelWidth || position === 0 || position === perArm - 1,
            };
        });
        const sign = model.direction === "outward" ? 1 : -1;
        const middle = point(length * 0.65);
        const x = middle.x;
        const y = middle.y - 38;
        const arrow = `M ${x - dx * 12 * sign} ${y - dy * 12 * sign} L ${x + dx * 12 * sign} ${y + dy * 12 * sign} m ${(-dx - dy) * 7 * sign} ${(-dy + dx) * 7 * sign} l ${(dx + dy) * 7 * sign} ${(dy - dx) * 7 * sign} l ${(-dx + dy) * 7 * sign} ${(-dy - dx) * 7 * sign}`;
        const label =
            model.layout === "four" ? { x: 200 + dx * 145, y: 160 + dy * 50 } : { x: (start.x + end.x) / 2, y: 110 };
        return { start, end, leds, arrow, label };
    });
});
</script>

<style lang="less">
.led-wizard-preview {
    margin: 0;
    svg {
        width: 100%;
        max-height: 340px;
    }
    .arm {
        stroke: var(--surface-400);
        stroke-width: 12;
        stroke-linecap: round;
    }
    circle {
        stroke: var(--text);
        stroke-width: 1;
    }
    text {
        fill: var(--text);
        font-size: 12px;
    }
    rect {
        fill: var(--surface-100);
        stroke: var(--surface-500);
    }
    .arm-label {
        font-size: 14px;
        font-weight: 700;
        fill: var(--text);
    }
    .off-mark {
        stroke: var(--text);
        stroke-width: 2;
    }
    .arrow {
        fill: none;
        stroke: var(--primary-500);
        stroke-width: 2;
    }
    figcaption {
        font-size: 0.85rem;
    }
}
</style>
