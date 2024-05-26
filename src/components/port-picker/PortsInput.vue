<template>
  <div
    id="portsinput"
    style="width: 220px"
  >
    <div class="dropdown dropdown-dark">
      <select
        id="port"
        :key="value.selectedPort"
        :value="value.selectedPort"
        class="dropdown-select"
        :title="$t('firmwareFlasherManualPort')"
        :disabled="disabled"
        @change="onChangePort"
      >
        <option
          value="noselection"
          disabled
        >
          {{ $t("portsSelectNoSelection") }}
        </option>
        <option
          v-show="showManualOption"
          value="manual"
        >
          {{ $t("portsSelectManual") }}
        </option>
        <option
          v-show="showVirtualOption"
          value="virtual"
        >
          {{ $t("portsSelectVirtual") }}
        </option>
        <option
          v-for="connectedDevice in connectedDevices"
          :key="connectedDevice.path"
          :value="connectedDevice.path"
        >
          {{ connectedDevice.displayName }}
        </option>
        <option value="requestpermission">
          {{ $t("portsSelectPermission") }}
        </option>
      </select>
    </div>
    <div id="auto-connect-and-baud">
      <div id="auto-connect-switch">
        <input
          id="auto-connect"
          class="auto_connect togglesmall"
          type="checkbox"
          :value="value.autoConnect"
          :title="value.autoConnect ? $t('autoConnectEnabled') : $t('autoConnectDisabled')"
          @change="onChangeAutoConnect"
        >
        <span class="auto_connect">
          {{ $t("autoConnect") }}
        </span>
      </div>
      <div
        v-if="value.selectedPort !== 'virtual'"
        id="baudselect"
      >
        <div class="dropdown dropdown-dark">
          <select
            id="baud"
            :value="value.selectedBauds"
            class="dropdown-select"
            :title="$t('firmwareFlasherBaudRate')"
            :disabled="disabled"
            @input="updateValue('selectedBauds', $event.target.value)"
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
import { get as getConfig, set as setConfig } from '../../js/ConfigStorage';
import { EventBus } from '../eventBus';

export default {
  props: {
    value: {
      type: Object,
      default: () => ({
        selectedPort: 'noselection',
        selectedBauds: 115200,
        autoConnect: true,
      }),
    },
    connectedDevices: {
      type: Array,
      default: () => [],
    },
    disabled: {
        type: Boolean,
        default: false,
    },
    showVirtualOption: {
      type: Boolean,
      default: true,
    },
    showManualOption: {
      type: Boolean,
      default: true,
    },
  },
  data() {
      return {
          showVirtual: false,
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
  methods: {
    updateValue(key, value) {
      this.$emit('input', { ...this.value, [key]: value });
    },
    onChangePort(event) {
      if (event.target.value === 'requestpermission') {
        EventBus.$emit('ports-input:request-permission');
      } else {
        EventBus.$emit('ports-input:change', event.target.value);
      }
      this.updateValue('selectedPort', event.target.value);
    },
    onChangeAutoConnect(event) {
      setConfig({'autoConnect': event.target.checked});
      this.updateValue('autoConnect', event.target.checked);
      return event;
    },
  },
};

</script>
