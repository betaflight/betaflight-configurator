<template>
  <div
    id="portsinput"
    style="width: 220px"
  >
    <div class="dropdown dropdown-dark">
      <select
        id="port"
        class="dropdown-select"
        :title="$t('firmwareFlasherManualPort')"
        @value="value"
        @input="$emit('input', $event.target.value)"
      >
        <option value="manual">
          {{ $t("portsSelectManual") }}
        </option>
        <option
          v-if="showVirtual"
          value="virtual"
        >
          {{ $t("portsSelectVirtual") }}
        </option>
      </select>
    </div>
    <div id="auto-connect-and-baud">
      <div id="baudselect">
        <div class="dropdown dropdown-dark">
          <select
            id="baud"
            v-model="selectedBaudRate"
            class="dropdown-select"
            :title="$t('firmwareFlasherBaudRate')"
          >
            <option
              v-for="baudRate in baudRates"
              :key="baudRate.value"
              :value="baudRate.value"
            >
              {{ baudRate.label }}
            </option>
          </select>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { get as getConfig } from '../../js/ConfigStorage';
import { EventBus } from '../eventBus';

export default {
    props: {
      value: {
        type: String,
        default: 'manual',
      },
    },

    data() {
        return {
            showVirtual: false,
            selectedBaudRate: "115200",
            baudRates: [
                { value: "1000000", label: "1000000" },
                { value: "500000", label: "500000" },
                { value: "250000", label: "250000" },
                { value: "115200", label: "115200" },
                { value: "57600", label: "57600" },
                { value: "38400", label: "38400" },
                { value: "28800", label: "28800" },
                { value: "19200", label: "19200" },
                { value: "14400", label: "14400" },
                { value: "9600", label: "9600" },
                { value: "4800", label: "4800" },
                { value: "2400", label: "2400" },
                { value: "1200", label: "1200" },
            ],
        };
    },
    mounted() {
      EventBus.$on('config-storage:set', this.setShowVirtual);
    },
    destroyed() {
      EventBus.$off('config-storage:set', this.setShowVirtual);
    },
    methods: {
      setShowVirtual() {
        this.showVirtual = getConfig('showVirtualMode').showVirtualMode;
      },
    },
};
</script>
<style scoped lang="less">
#portsinput {
    width: 220px;
    margin-right: 15px;
    .dropdown {
        margin-bottom: 5px;
    }
}
#portsinput .dropdown {
    margin-bottom: 5px;
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

.dropdown-dark .dropdown-select {
    color: var(--text);
    width: calc(100% - 10px);
    /* Fallback for IE 8 */
    background: #444;
}

.dropdown-dark .dropdown-select > option {
    background: var(--surface-300);
}
#auto-connect-and-baud {
    float: right;
}

#baudselect {
    width: 80px;
    float: right;
    margin-right: 2px;
}
</style>
