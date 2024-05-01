<template>
  <div
    id="firmware-virtual-option"
    :style="{ display: isVirtual ? 'block' : 'none' }"
  >
    <div class="dropdown dropdown-dark">
      <select
        id="firmware-version-dropdown"
        class="dropdown-select"
        :title="$t('virtualMSPVersion')"
      >
        <option
          v-for="(version, index) in firmwareVersions"
          :key="index"
          :value="version.value"
        >
          {{ version.label }}
        </option>
      </select>
    </div>
  </div>
</template>

<script>
export default {
    props: {
        isVirtual: {
            type: Boolean,
            default: true,
        },
    },
    data() {
        return {
            firmwareVersions: [
                { value: "1.46.0", label: "MSP: 1.46 | Firmware: 4.5.*" },
                { value: "1.45.0", label: "MSP: 1.45 | Firmware: 4.4.*" },
                { value: "1.44.0", label: "MSP: 1.44 | Firmware: 4.3.*" },
                { value: "1.43.0", label: "MSP: 1.43 | Firmware: 4.2.*" },
                { value: "1.42.0", label: "MSP: 1.42 | Firmware: 4.1.*" },
                { value: "1.41.0", label: "MSP: 1.41 | Firmware: 4.0.*" },
            ],
        };
    },
};
</script>

<style scoped>
#firmware-virtual-option {
    height: 76px;
    width: 180px;
    margin-right: 15px;
    margin-top: 0px;
    display: none;
}

.dropdown-dark .dropdown-select {
    color: var(--text);
    width: calc(100% - 10px);
    background: #444;
}

.dropdown-dark {
    background-color: var(--surface-300);
    border: 1px solid var(--surface-500);
    color: var(--text);
}

.dropdown-dark:before {
    border-bottom-color: var(--surface-700);
}

.dropdown-dark:after {
    border-top-color: var(--surface-700);
}

.dropdown-dark .dropdown-select > option {
    background: var(--surface-300);
}
</style>
