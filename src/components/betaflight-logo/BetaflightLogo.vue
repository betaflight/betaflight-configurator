<style>
.logo {
  height: 70px;
  width: 240px;
  background-image: url(./images/light-wide-2.svg);
  background-repeat: no-repeat;
  background-position: left center;
  background-size: contain;
  position: relative;
  margin-top: -25px;
}

.logo_text {
  position: absolute;
  left: 80px;
  top: 49px;
  color: #949494;
  opacity: 0.5;
  font-size: 10px;
  min-width: 210px;
}

.tab_container .logo {
  display: none;
}

@media all and (max-width: 575px) {
  .logo {
    height: 24px;
    width: 150px;
    background-image: url(./images/light-wide-2-compact.svg);
    background-position: left center;
    order: 2;
    margin-top: 0;
  }
  .logo_text {
    display: none !important;
  }
  .tab_container .logo {
    display: block;
    background-image: url(./images/light-wide-2.svg);
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
  .tab_container .logo .logo_text {
    display: block !important;
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

<template>
  <div class="logo">
    <div class="logo_text">
      <span>
        {{ $t("versionLabelConfigurator") }}: {{ configuratorVersion }}
        <br />
        <span v-if="firmwareVersion && firmwareId">
          {{ $t("versionLabelFirmware") }}: {{ firmwareVersion }}
          {{ firmwareId }}
        </span>
        <br />
        <span v-if="firmwareVersion && hardwareId">
          {{ $t("versionLabelTarget") }}: {{ hardwareId }}
        </span>
      </span>
    </div>
  </div>
</template>

<script>
export default {
  props: {
    configuratorVersion: {
      type: String,
      required: true,
    },
    firmwareVersion: {
      type: String,
    },
    firmwareId: {
      type: String,
    },
    hardwareId: {
      type: String,
    },
  },
};
</script>
