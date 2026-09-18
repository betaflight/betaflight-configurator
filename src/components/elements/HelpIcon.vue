<template>
    <UTooltip :delayDuration="0" arrow :content="{ side: tooltipSide }">
        <UButton
            type="button"
            variant="ghost"
            color="neutral"
            :aria-label="$t('helpIconLabel')"
            class="p-0.5 rounded-full hover:bg-neutral-100/30 duration-100 w-fit"
            @click.stop
            @keydown.enter.space.stop
        >
            <UIcon name="i-lucide-circle-question-mark" class="size-4" />
        </UButton>
        <template #content>
            <div v-html="text"></div>
        </template>
    </UTooltip>
</template>

<script setup>
import { computed } from "vue";
import { useLocale } from "@nuxt/ui/composables";

defineProps({
    text: {
        type: String,
        required: true,
    },
});

// Reka UI builds the popper placement from `side` verbatim and never mirrors it, so an
// explicit horizontal side has to be flipped by hand for RTL languages.
const { dir } = useLocale();
const tooltipSide = computed(() => (dir.value === "rtl" ? "left" : "right"));
</script>
