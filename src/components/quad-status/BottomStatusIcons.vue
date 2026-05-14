<template>
    <div class="bottomStatusIcons" :class="{ 'bottomStatusIcons--compact': compact }">
        <UTooltip :text="$t('mainHelpArmed')">
            <UIcon
                name="i-lucide-triangle-alert"
                class="size-4"
                :class="setActiveArmed ? 'text-primary' : 'text-muted'"
            />
        </UTooltip>
        <UTooltip :text="$t('mainHelpFailsafe')">
            <UIcon
                name="i-lucide-shield-alert"
                class="size-4"
                :class="setFailsafeActive ? 'text-primary' : 'text-muted'"
            />
        </UTooltip>
        <UTooltip :text="$t('mainHelpLink')">
            <UIcon name="i-lucide-link" class="size-4" :class="setActiveLink ? 'text-primary' : 'text-muted'" />
        </UTooltip>
    </div>
</template>

<script setup>
import { computed } from "vue";
import { bit_check } from "../../js/bit";

const props = defineProps({
    lastReceivedTimestamp: { type: Number, default: 0 },
    mode: { type: Number, default: 0 },
    auxConfig: { type: Array, default: null },
    compact: { type: Boolean, default: false },
});

const setActiveArmed = computed(
    () =>
        props.auxConfig?.length &&
        props.auxConfig?.includes("ARM") &&
        bit_check(props.mode, props.auxConfig?.indexOf("ARM")),
);

const setFailsafeActive = computed(
    () =>
        props.auxConfig?.length &&
        props.auxConfig?.includes("FAILSAFE") &&
        bit_check(props.mode, props.auxConfig?.indexOf("FAILSAFE")),
);

const setActiveLink = computed(() => performance.now() - props.lastReceivedTimestamp < 300);
</script>

<style scoped>
.bottomStatusIcons {
    display: flex;
    justify-content: space-between;
    background-color: #272727;
    height: 31px;
    max-width: 105px;
    margin-top: 2px;
    border-bottom-left-radius: 5px;
    border-bottom-right-radius: 5px;
}

.bottomStatusIcons--compact {
    height: auto;
    max-width: none;
    margin: 0;
    padding: 0.1rem 0.25rem;
    background-color: transparent;
    border-radius: 0;
    display: flex;
    align-items: center;
    gap: 0.5rem;
}
</style>
