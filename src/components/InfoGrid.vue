<template>
    <dl class="cf-info-grid" :class="gridClass">
        <template v-for="item in items" :key="item.id || item.i18n || item.label">
            <dt v-if="item.i18n || item.label" :id="item.id">
                <span v-if="item.i18n">{{ i18n.getMessage(item.i18n) }}</span>
                <span v-else>{{ item.label }}</span>
            </dt>

            <dd :class="item.class" :id="item.id ? item.id + '-value' : null">
                <slot :name="item.slotName || item.id">
                    <span v-if="item.html" v-html="item.html"></span>
                    <span v-else-if="item.value !== undefined">{{ item.value }}</span>
                </slot>
            </dd>
        </template>
    </dl>
</template>

<script setup>
import { i18n } from "../js/localization";

defineProps({
    items: {
        type: Array,
        default: () => [],
    },
    gridClass: String,
});
</script>

<style scoped lang="less">
.cf-info-grid {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0.25rem 1rem;
    align-items: center;
    width: 100%;
}
.cf-info-grid dt {
    font-weight: bold;
    margin: 0;
}
.cf-info-grid dd {
    margin: 0;
}
</style>
