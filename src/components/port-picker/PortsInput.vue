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
        <option value="virtual">
          {{ $t("portsSelectVirtual") }}
        </option>
        <option value="manual">
          {{ $t("portsSelectManual") }}
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
export default {
    props: {
      value: {
        type: String,
        // TODO: this should be loaded from config
        default: 'virtual',
      },
    },
    data() {
        return {
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
};
</script>
<style scoped>
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
    color: #a6a6a6;
    text-shadow: 0 1px black;
    width: calc(100% - 10px);
    background: #444;
}

.dropdown-dark {
    background: #636363; /* NEW2 */
    background: #3e403f; /* NEW */
    border-color: #111 #0a0a0a black;
    background-image: -webkit-linear-gradient(
        top,
        transparent,
        rgba(0, 0, 0, 0.4)
    );
    background-image: -moz-linear-gradient(
        top,
        transparent,
        rgba(0, 0, 0, 0.4)
    );
    background-image: -o-linear-gradient(top, transparent, rgba(0, 0, 0, 0.4));
    background-image: linear-gradient(
        to bottom,
        transparent,
        rgba(0, 0, 0, 0.4)
    );
    -webkit-box-shadow: inset 0 1px rgba(255, 255, 255, 0.1),
        0 1px 1px rgba(0, 0, 0, 0.2);
    box-shadow: inset 0 1px rgba(255, 255, 255, 0.1),
        0 1px 1px rgba(0, 0, 0, 0.2);
    color: #a6a6a6;
    text-shadow: 0px 1px rgba(0, 0, 0, 0.25);
}

.dropdown-dark:before {
    border-bottom-color: #aaa;
}

.dropdown-dark:after {
    border-top-color: #aaa;
}

.dropdown-dark .dropdown-select {
    color: #a6a6a6;
    text-shadow: 0 1px black;
    width: calc(100% - 10px);
    /* Fallback for IE 8 */
    background: #444;
}

.dropdown-dark .dropdown-select:focus {
    color: #fff;
}

.dropdown-dark .dropdown-select > option {
    background: #56ab1a;
    text-shadow: 0 1px rgba(0, 0, 0, 0.4);
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
