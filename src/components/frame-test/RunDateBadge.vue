<template>
    <!-- when a result is from; kept by this app (the FC forgot it) gets the history icon and says so on hover -->
    <span
        v-if="onFrame"
        class="absolute top-0 right-4 flex w-fit translate-y-[-50%] items-center gap-1.5 rounded-full bg-elevated p-1 px-3 text-[13px] text-muted tabular-nums"
        :title="hint"
    >
        <UIcon :name="icon" class="size-3.5" />
        {{ label }}
    </span>
    <UBadge
        v-else
        color="neutral"
        variant="subtle"
        size="sm"
        :icon="icon"
        class="tabular-nums"
        :title="hint"
        :label="label"
    />
</template>

<script setup lang="ts">
import { computed } from "vue";
import { i18n } from "@/js/localization";

const props = defineProps({
    /** ISO date. */
    at: { type: String, required: true },
    /** Kept by this app: the flight controller no longer has it. */
    kept: { type: Boolean, default: false },
    /** More for the hover text (which runs the date covers). */
    detail: { type: String, default: "" },
    /** On the box's frame at the right, shaped as the box's title on the left. */
    onFrame: { type: Boolean, default: false },
});

const icon = computed(() => (props.kept ? "i-lucide-history" : "i-lucide-clock"));
const hint = computed(() =>
    [i18n.getMessage(props.kept ? "runDateKept" : "runDateLive"), props.detail].filter(Boolean).join("\n"),
);
const label = computed(() =>
    new Date(props.at).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }),
);
</script>
