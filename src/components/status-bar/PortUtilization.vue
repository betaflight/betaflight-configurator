<template>
    <div
        class="port-utilization"
        :title="`${$t('statusbar_port_utilization')}  \u2193 ${usageDown}%  \u2191 ${usageUp}%`"
    >
        <UIcon name="i-lucide-arrow-down" class="port-utilization__icon" />
        <span class="value">{{ usageDown }}%</span>
        <UIcon name="i-lucide-arrow-up" class="port-utilization__icon" />
        <span class="value">{{ usageUp }}%</span>
    </div>
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

.port-utilization__icon {
    width: 14px;
    height: 14px;
}

.value {
    font-variant-numeric: tabular-nums;
}
</style>
