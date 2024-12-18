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
import { defineComponent } from 'vue';

export default defineComponent({
  props: {
    isVirtual: {
      type: Boolean,
      default: true,
    },
  },
  data() {
    return {
      firmwareVersions: [
        { value: '1.46.0', label: 'MSP: 1.46 | Firmware: 4.5.*' },
        { value: '1.45.0', label: 'MSP: 1.45 | Firmware: 4.4.*' },
        { value: '1.44.0', label: 'MSP: 1.44 | Firmware: 4.3.*' },
        { value: '1.43.0', label: 'MSP: 1.43 | Firmware: 4.2.*' },
        { value: '1.42.0', label: 'MSP: 1.42 | Firmware: 4.1.*' },
        { value: '1.41.0', label: 'MSP: 1.41 | Firmware: 4.0.*' },
      ],
    };
  },
});
</script>
