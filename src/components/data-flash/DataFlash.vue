<template>
    <div class="data-flash" :class="{ 'data-flash--compact': compact }">
        <div v-if="!supportDataflash" class="noflash_global">
            {{ $t("sensorDataFlashNotFound") }}
        </div>
        <template v-else>
            <UIcon
                v-if="compact"
                name="i-lucide-database"
                class="dataflash-icon"
                :title="$t('sensorDataFlashFreeSpace')"
            />
            <div class="dataflash-contents_global">
                <div
                    class="dataflash-free_global"
                    :class="usageClass"
                    :style="{
                        width: indicatorWidth,
                    }"
                >
                    <span v-if="!compact">
                        {{ $t("sensorDataFlashFreeSpace") }}
                        {{ freeSpace }}
                    </span>
                </div>
            </div>
            <span v-if="compact" class="dataflash-free-label">{{ freeSpace }}</span>
        </template>
    </div>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
    fcTotalSize: { type: Number, default: 100000 },
    fcUsedSize: { type: Number, default: 82000 },
    compact: { type: Boolean, default: false },
});

const supportDataflash = computed(() => props.fcTotalSize > 0);

const freeSpace = computed(() => {
    if (!supportDataflash.value) {
        return;
    }
    const bytes = props.fcTotalSize - props.fcUsedSize;
    if (props.fcUsedSize >= props.fcTotalSize) {
        return "0B";
    }
    if (bytes < 1024) {
        return `${bytes}B`;
    }
    const kilobytes = bytes / 1024;
    if (kilobytes < 1024) {
        return `${Math.round(kilobytes)}KB`;
    }
    const megabytes = kilobytes / 1024;
    if (megabytes < 1024) {
        return `${megabytes.toFixed(1)}MB`;
    }
    const gigabytes = megabytes / 1024;
    return `${gigabytes.toFixed(1)}GB`;
});

const usagePercent = computed(() =>
    supportDataflash.value ? Math.min((props.fcUsedSize / props.fcTotalSize) * 100, 100) : 0,
);

const indicatorWidth = computed(() => `${usagePercent.value}%`);

const usageClass = computed(() => {
    if (usagePercent.value >= 85) {
        return "dataflash-free_global--critical";
    }
    if (usagePercent.value >= 60) {
        return "dataflash-free_global--warning";
    }
    return "dataflash-free_global--ok";
});
</script>

<style scoped>
.data-flash {
    display: block;
    font-size: 10px;
    width: 125px;
    height: 33px;
    border-radius: 5px;
    border: 1px solid #272727;
    box-shadow: 0 1px 0 rgb(92 92 92 / 50%);
    background-color: #434343;
    background-image: -webkit-linear-gradient(top, transparent, rgba(0, 0, 0, 0.55));
    padding-top: 5px;
}
.noflash_global {
    color: #868686;
    text-align: center;
    margin-top: 2px;
}

.dataflash-contents_global {
    margin-top: 18px;
    padding: 0;
    border: 1px solid #4a4a4a;
    background-color: #4a4a4a;
    flex-direction: row;
    flex-wrap: nowrap;
    border-radius: 3px;
    margin-left: 5px;
    margin-right: 5px;
}
.dataflash-contents_global div {
    height: 5px;
    position: relative;
    box-shadow: inset 0 0 5px rgb(0 0 0 / 20%);
    border-radius: 2px;
    width: 25%;
    display: block;
    background-color: var(--primary-500);
}

.dataflash-contents_global div.dataflash-free_global--ok {
    background-color: var(--success-500);
}

.dataflash-contents_global div.dataflash-free_global--warning {
    background-color: var(--warning-500);
}

.dataflash-contents_global div.dataflash-free_global--critical {
    background-color: var(--error-500);
}
.dataflash-contents_global div span {
    position: absolute;
    top: -18px;
    left: 0;
    width: 120px;
    text-align: left;
    color: silver;
}

.data-flash--compact {
    display: inline-flex;
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
    width: auto;
    min-width: 156px;
    height: auto;
    padding: 0;
    border: none;
    box-shadow: none;
    background-color: transparent;
    background-image: none;
    color: var(--text);
    font-size: 11px;
}

.data-flash--compact .dataflash-icon {
    flex-shrink: 0;
    width: 14px;
    height: 14px;
    opacity: 0.75;
}

.data-flash--compact .dataflash-contents_global {
    flex: 1 1 auto;
    margin: 0;
    padding: 0;
    border: none;
    background-color: var(--surface-500);
    border-radius: 3px;
    overflow: hidden;
    height: 9px;
    width: auto;
}

.data-flash--compact .dataflash-contents_global div {
    height: 9px;
    border-radius: 3px 0 0 3px;
    box-shadow: none;
    overflow: hidden;
    width: 0;
}

.data-flash--compact .dataflash-free-label {
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
}

.data-flash--compact .noflash_global {
    margin: 0;
    text-align: left;
    color: var(--text);
}
</style>
