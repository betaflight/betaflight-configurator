<template>
  <div
    id="portsinput"
  >
    <div class="dropdown dropdown-dark">
      <select
        id="port"
        :key="modelValue.selectedPort"
        :model-value="modelValue.selectedPort"
        :title="$t('firmwareFlasherManualPort')"
        :disabled="disabled"
        class="dropdown-select"
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
          v-for="connectedBluetoothDevice in connectedBluetoothDevices"
          :key="connectedBluetoothDevice.path"
          :value="connectedBluetoothDevice.path"
        >
          {{ connectedBluetoothDevice.displayName }}
        </option>
        <option
          v-for="connectedSerialDevice in connectedSerialDevices"
          :key="connectedSerialDevice.path"
          :value="connectedSerialDevice.path"
        >
          {{ connectedSerialDevice.displayName }}
        </option>
        <option
          v-for="connectedUsbDevice in connectedUsbDevices"
          :key="connectedUsbDevice.path"
          :value="connectedUsbDevice.path"
        >
          {{ connectedUsbDevice.displayName }}
        </option>
        <option value="requestpermission">
          {{ $t("portsSelectPermission") }}
        </option>
        <option value="requestpermissionbluetooth">
          {{ $t("portsSelectPermissionBluetooth") }}
        </option>
      </select>
    </div>
    <div id="auto-connect-and-baud">
      <div
        id="auto-connect-switch"
        :title="modelValue.autoConnect ? $t('autoConnectEnabled') : $t('autoConnectDisabled')"
      >
        <input
          id="auto-connect"
          class="auto_connect togglesmall"
          type="checkbox"
          :checked="modelValue.autoConnect"
          @change="onChangeAutoConnect"
        >
        <span class="auto_connect">
          {{ $t("autoConnect") }}
        </span>
      </div>
      <div
        v-if="modelValue.selectedPort !== 'virtual' && modelValue.selectedPort !== 'noselection'"
        id="baudselect"
      >
        <div class="dropdown dropdown-dark">
          <select
            id="baud"
            class="dropdown-select"
            :model-value="modelValue.selectedBauds"
            :title="$t('firmwareFlasherBaudRate')"
            :disabled="disabled"
            @update:modelValue="updateValue('selectedBauds', $event.target.value)"
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
import { defineComponent } from 'vue';
import { set as setConfig } from '../../js/ConfigStorage';
import { EventBus } from '../eventBus';

export default defineComponent({
  props: {
    modelValue: {
      type: Object,
      default: () => ({
        selectedPort: 'noselection',
        selectedBauds: 115200,
        autoConnect: true,
      }),
    },
    connectedSerialDevices: {
      type: Array,
      default: () => [],
    },
    connectedUsbDevices: {
      type: Array,
      default: () => [],
    },
    connectedBluetoothDevices: {
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

  emits: [
    'update:modelValue',
    'ports-input:request-permission',
    'ports-input:request-permission-bluetooth',
    'ports-input:change',
  ],

  data() {
    return {
      showVirtual: false,
      baudRates: [
        { value: '1000000', label: '1000000' },
        { value: '500000', label: '500000' },
        { value: '250000', label: '250000' },
        { value: '115200', label: '115200' },
        { value: '57600', label: '57600' },
        { value: '38400', label: '38400' },
        { value: '28800', label: '28800' },
        { value: '19200', label: '19200' },
        { value: '14400', label: '14400' },
        { value: '9600', label: '9600' },
        { value: '4800', label: '4800' },
        { value: '2400', label: '2400' },
        { value: '1200', label: '1200' },
      ],
    };
  },

  methods: {
    updateValue(key, value) {
      this.$emit('update:modelValue', { ...this.modelValue, [key]: value });
    },
    onChangePort(event) {
      if (event.target.value === 'requestpermission') {
        EventBus.$emit('ports-input:request-permission');
      } else if (event.target.value === 'requestpermissionbluetooth') {
        EventBus.$emit('ports-input:request-permission-bluetooth');
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
});

</script>
