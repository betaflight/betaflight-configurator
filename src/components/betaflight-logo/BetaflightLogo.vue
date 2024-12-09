<script setup>
import { defineProps } from 'vue';

defineProps({
  configuratorVersion: {
    type: String,
    required: true,
  },
  firmwareVersion: {
    type: String,
    default: '',
  },
  firmwareId: {
    type: String,
    default: '',
  },
  hardwareId: {
    type: String,
    default: '',
  },
});
</script>

<template>
  <div class="logo">
    <div class="logo_text">
      <span>
        {{ $t("versionLabelConfigurator") }}: {{ configuratorVersion }}
      </span>
      <span v-if="firmwareVersion && firmwareId">
        {{ $t("versionLabelFirmware") }}: {{ firmwareVersion }}
        {{ firmwareId }}
      </span>
      <span v-if="hardwareId">
        {{ $t("versionLabelTarget") }}: {{ hardwareId }}
      </span>
    </div>
  </div>
</template>

<style>
.logo {
  height: 70px;
  width: 240px;
  background-image: url(../../images/dark-wide-2.svg);
  background-repeat: no-repeat;
  background-position: left center;
  background-size: contain;
  position: relative;
}

.dark-theme .logo {
  background-image: url(../../images/light-wide-2.svg);
}

.logo_text {
  position: absolute;
  left: 80px;
  top: 49px;
  color: var(--text);
  font-size: 10px;
  display: flex;
  flex-direction: column;
}

.tab_container .logo {
  display: none;
}

@media all and (max-width: 575px) {
  .logo {
    height: 24px;
    width: 150px;
    background-image: url(../../images/dark-wide-2-compact.svg);
    background-position: left center;
    order: 2;
    margin-top: 0;
  }
  .dark-theme .logo {
    background-image: url(../../images/light-wide-2-compact.svg);
  }
  .logo_text {
    display: none !important;
  }
  .tab_container .logo {
    display: block;
    background-image: url(../../images/dark-wide-2.svg);
    background-repeat: no-repeat;
    background-position: center 20px;
    background-position-x: 12px;
    background-size: 80%;
    height: 120px;
    width: auto;
    margin-top: unset;
    position: relative;
    border-bottom: 1px solid rgba(0, 0, 0, 0.3);
  }
  .dark-theme .tab_container .logo {
    background-image: url(../../images/light-wide-2.svg);
  }
  .tab_container .logo .logo_text {
    display: flex !important;
    left: 82px;
    top: 62px;
  }
}

@media all and (min-width: 1125px) {
  .logo {
    width: 340px;
  }

  .logo_text {
    font-size: inherit;
    position: relative;
  }
}
</style>

export default {
  components: {
    BetaflightLogo
  }
}
