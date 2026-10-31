<template>
    <ProgressRing
        :value="step.state === 'error' ? 100 : Math.round(step.progress * 100)"
        :color="{ pending: 'primary', active: 'primary', done: 'success', error: 'error' }[step.state]"
        :size="32"
        :stroke-width="3"
        :class="[flash, { 'animate-pulse': step.clipped }]"
    >
        <UIcon v-if="step.state === 'done'" name="i-lucide-check" class="size-4 text-success" />
        <UIcon v-else-if="step.id === 'acc' && step.state === 'error'" name="i-lucide-x" class="size-4 text-error" />
        <span
            v-else
            class="text-xs font-semibold"
            :class="step.state === 'pending' ? 'text-muted' : 'text-highlighted'"
        >
            {{ step.state === "pending" ? ordinal : step.count }}
        </span>
    </ProgressRing>
</template>

<script setup lang="ts">
import type { PropType } from "vue";
import ProgressRing from "@/components/ProgressRing.vue";
import type { ChecklistStep } from "@/stores/frameWizardProtocol";

/** One tap step as a ring: the tap count in it, the check when done, the flash class while a tap lands. */
defineProps({
    step: { type: Object as PropType<ChecklistStep>, required: true },
    ordinal: { type: Number, required: true },
    flash: { type: String, default: "" },
});
</script>
