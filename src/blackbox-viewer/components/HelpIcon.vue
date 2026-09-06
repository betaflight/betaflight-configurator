<template>
    <UTooltip :delay-duration="0" arrow :content="{ side: tooltipSide }">
        <div class="p-0.5 rounded-full hover:bg-elevated cursor-pointer duration-100 w-fit">
            <UIcon name="i-lucide-circle-help" class="size-4" />
        </div>
        <template #content>
            <div v-html="text" />
        </template>
    </UTooltip>
</template>

<script setup>
import { computed } from "vue";
import { useLocale } from "@nuxt/ui/composables";

defineProps({
    text: { type: String, required: true },
});

// Reka UI builds the popper placement from `side` verbatim and never mirrors it, so an
// explicit horizontal side has to be flipped by hand for RTL languages.
const { dir } = useLocale();
const tooltipSide = computed(() => (dir.value === "rtl" ? "left" : "right"));
</script>
