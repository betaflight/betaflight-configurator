<template>
  <div class="bottomStatusIcons">
    <div
      i18n_title="mainHelpArmed"
      class="armedicon cf_tip i18n_title-replaced"
      :class="{ active: setActiveArmed }"
    />
    <div
      i18n_title="mainHelpFailsafe"
      class="failsafeicon cf_tip i18n_title-replaced"
      :class="{ active: setFailsafeActive }"
    />
    <div
      i18n_title="mainHelpLink"
      class="linkicon cf_tip i18n_title-replaced"
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
        auxConfig: { type: Object, default: null },
    },
    computed: {
        setActiveArmed() {
            if (!this.auxConfig?.length) {
                return false;
            }
            if (
                this.auxConfig.includes("ARM") &&
                bit_check(this.mode, this.auxConfig.indexOf("ARM"))
            ) {
                return true;
            }
            return false;
        },
        setFailsafeActive() {
            if (!this.auxConfig?.length) {
                return false;
            }
            if (
                this.auxConfig.includes("FAILSAFE") &&
                bit_check(this.mode, this.auxConfig.indexOf("FAILSAFE"))
            ) {
                return true;
            }
            return false;
        },
        setActiveLink() {
            const active = performance.now() - this.lastReceivedTimestamp < 300;
            if (active) {
                return true;
            }
            return false;
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
