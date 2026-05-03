<template>
    <UTooltip :text="$t('statusbar_port_utilization')">
        <div class="port-utilization">
            <UIcon name="i-lucide-arrow-down" class="port-utilization__icon" />
            <span class="value w-8">{{ usageDown }}%</span>
            <UIcon name="i-lucide-arrow-up" class="port-utilization__icon" />
            <span class="value w-8">{{ usageUp }}%</span>
        </div>
    </UTooltip>
</template>

<script>
import { defineComponent } from "vue";

export default defineComponent({
    props: {
        usageDown: {
            type: Number,
            default: 0,
        },
        usageUp: {
            type: Number,
            default: 0,
        },
    },
});
</script>

<style scoped>
.port-utilization {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
}

.value {
    font-variant-numeric: tabular-nums;
}
</style>
