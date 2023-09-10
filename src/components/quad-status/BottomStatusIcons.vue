<template>
  <div class="bottomStatusIcons">
    <div
      class="armedicon cf_tip"
      :title="$t('mainHelpArmed')"
      :class="{ active: setActiveArmed }"
    />
    <div
      class="failsafeicon cf_tip"
      :title="$t('mainHelpFailsafe')"
      :class="{ active: setFailsafeActive }"
    />
    <div
      class="linkicon cf_tip"
      :title="$t('mainHelpLink')"
      :class="{ active: setActiveLink }"
    />
  </div>
</template>

<script>
import { bit_check } from "../../js/bit";

export default {
    props: {
        lastReceivedTimestamp: { type: Number, default: 0 },
        mode: { type: Number, default: 0 },
        auxConfig: { type: Array, default: null },
    },
    computed: {
        setActiveArmed() {
            return (
                this.auxConfig?.length &&
                this.auxConfig?.includes("ARM") &&
                bit_check(this.mode, this.auxConfig?.indexOf("ARM"))
            );
        },
        setFailsafeActive() {
            return (
                this.auxConfig?.length &&
                this.auxConfig?.includes("FAILSAFE") &&
                bit_check(this.mode, this.auxConfig?.indexOf("FAILSAFE"))
            );
        },
        setActiveLink() {
            return (performance.now() - this.lastReceivedTimestamp < 300);
        },
    },
};
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
    border: 1px solid var(--subtleAccent);
    font-weight: 600;
    font-size: 10pt;
    cursor: pointer;
}
button.active {
    background-color: var(--accent);
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
</style>
