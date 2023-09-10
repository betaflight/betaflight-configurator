<template>
  <div class="data-flash">
    <div
      v-if="!supportDataflash"
      class="noflash_global"
    >
      {{ $t("sensorDataFlashNotFound") }}
    </div>
    <div
      v-if="supportDataflash"
      class="dataflash-contents_global"
    >
      <div
        class="dataflash-free_global"
        :style="{
          width: indicatorWidth,
        }"
      >
        <span>
          {{ $t("sensorDataFlashFreeSpace") }}
          {{ freeSpace }}
        </span>
      </div>
    </div>
  </div>
</template>
<script>
export default {
    props: {
        fcTotalSize: { type: Number, default: 100000 },
        fcUsedSize: { type: Number, default: 82000 },
    },
    computed: {
        supportDataflash() {
            if (this.fcTotalSize > 0) return true;
            else return false;
        },
        freeSpace() {
            if (!this.supportDataflash) return;
            const bytes = this.fcTotalSize - this.fcUsedSize;
            if (this.fcUsedSize >= this.fcTotalSize) {
                return "0B";
            }
            if (bytes < 1024) {
                return `${bytes}B`;
            }
            const kilobytes = bytes / 1024;
            if (kilobytes < 1024) {
                return `${Math.round(kilobytes)}kB`;
            }
            const megabytes = kilobytes / 1024;
            return `${megabytes.toFixed(1)}MB`;
        },
        indicatorWidth() {
            if (!this.supportDataflash) return;
            return `${Math.min(
                (this.fcUsedSize / this.fcTotalSize) * 100,
                100,
            )}%`;
        },
    },
};
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
    background-image: -webkit-linear-gradient(
        top,
        transparent,
        rgba(0, 0, 0, 0.55)
    );
    padding-top: 5px;
    text-shadow: 0 1px #000000;
}
.noflash_global {
    color: #868686;
    text-align: center;
    text-shadow: 0 1px #000000;
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
    background-color: var(--accent);
}
.dataflash-contents_global div span {
    position: absolute;
    top: -18px;
    left: 0;
    width: 120px;
    text-align: left;
    color: silver;
}
</style>
