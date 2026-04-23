<template>
    <div class="bottomStatusIcons" :class="{ 'bottomStatusIcons--compact': compact }">
        <UTooltip :text="$t('mainHelpArmed')">
            <div class="armedicon" :class="{ active: setActiveArmed }" />
        </UTooltip>
        <UTooltip :text="$t('mainHelpFailsafe')">
            <div class="failsafeicon" :class="{ active: setFailsafeActive }" />
        </UTooltip>
        <UTooltip :text="$t('mainHelpLink')">
            <div class="linkicon" :class="{ active: setActiveLink }" />
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
button {
    padding: 0.5em 0.75em;
    border-radius: 4px;
    background-color: #ccc;
    color: #666;
    border: 1px solid var(--surface-500);
    font-weight: 600;
    font-size: 10pt;
    cursor: pointer;
}
button.active {
    background-color: var(--primary-500);
    border: 1px solid #dba718;
    color: #000;
}
.armedicon {
    margin-left: 8px;
    margin-right: 8px;
    margin-top: 6px;
    height: 18px;
    width: 18px;
    opacity: 0.8;
    background-size: contain;
    background-position: center;
    transition: none;
    background-image: url(../../images/icons/cf_icon_armed_grey.svg);
}
.failsafeicon {
    margin-left: 8px;
    margin-right: 8px;
    margin-top: 6px;
    height: 18px;
    width: 18px;
    opacity: 0.8;
    background-size: contain;
    background-position: center;
    transition: none;
    background-image: url(../../images/icons/cf_icon_failsafe_grey.svg);
}
.linkicon {
    margin-left: 8px;
    margin-right: 8px;
    margin-top: 6px;
    height: 18px;
    width: 18px;
    opacity: 0.8;
    background-size: contain;
    background-position: center;
    transition: none;
    background-image: url(../../images/icons/cf_icon_link_grey.svg);
}
.armedicon.active {
    background-image: url(../../images/icons/cf_icon_armed_active.svg);
}
.failsafeicon.active {
    background-image: url(../../images/icons/cf_icon_failsafe_active.svg);
}
.linkicon.active {
    background-image: url(../../images/icons/cf_icon_link_active.svg);
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

.bottomStatusIcons--compact .armedicon,
.bottomStatusIcons--compact .failsafeicon,
.bottomStatusIcons--compact .linkicon {
    margin: 0;
    height: 16px;
    width: 16px;
}
</style>
