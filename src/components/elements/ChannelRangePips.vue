<template>
    <div class="pips-channel-range" :class="variant">
        <div v-for="pip in pips" :key="pip" class="pip" :style="{ insetInlineStart: `${channelPercent(pip)}%` }">
            {{ pip }}
        </div>
        <div
            v-if="variant === 'aux' && markerPercent !== null"
            class="pip-marker"
            :style="{ insetInlineStart: `${markerPercent}%` }"
        ></div>
    </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import type { PropType } from "vue";
import { channelPercent } from "../../js/utils/rcChannel";

export default defineComponent({
    name: "ChannelRangePips",
    props: {
        pips: {
            type: Array as PropType<number[]>,
            required: true,
        },
        markerPercent: {
            type: Number,
            default: null,
        },
        variant: {
            type: String,
            default: "adjustments",
            validator: (value: unknown) => typeof value === "string" && ["aux", "adjustments"].includes(value),
        },
    },
    setup() {
        return { channelPercent };
    },
});
</script>

<style scoped>
.pips-channel-range {
    position: relative;
}

.pips-channel-range.aux {
    height: 24px;
    margin-top: 16px;
    /* 20px is the width of the slider thumbs in DraggableMultiSlider, taking 10px from each side of the pip range makes the thumbs align cleanly */
    width: calc(100% - 20px);
}

.pips-channel-range.adjustments {
    height: 20px;
    margin-top: 4px;
}

/* The slider these pips annotate mirrors in RTL, so the offsets are inline-relative; the
   centering shift has to follow the same axis by hand because translateX is always physical. */
.pip {
    position: absolute;
    transform: translateX(-50%);
    white-space: nowrap;
}

html[dir="rtl"] .pip {
    transform: translateX(50%);
}

.pips-channel-range.aux .pip {
    top: 12px;
    font-size: 11px;
    color: var(--text-muted);
}

.pips-channel-range.aux .pip::before {
    content: "";
    position: absolute;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    width: 2px;
    height: 16px;
    background: var(--surface-600);
}

.pips-channel-range.adjustments .pip {
    font-size: 10px;
    color: var(--text-tertiary);
}

.pip-marker {
    position: absolute;
    bottom: 12px;
    transform: translateX(-50%);
    width: 6px;
    height: 20px;
    background: var(--primary-500);
    box-shadow: 0 0 6px rgba(255, 187, 0, 0.9);
    pointer-events: none;
    z-index: 10;
    border-radius: 9999px;
}

html[dir="rtl"] .pip-marker {
    transform: translateX(50%);
}
</style>
