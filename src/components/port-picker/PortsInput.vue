<template>
  <div
    id="portsinput"
    style="width: 220px"
  >
    <div class="dropdown dropdown-dark">
      <select
        id="port"
        i18n_title="firmwareFlasherManualPort"
        class="dropdown-select i18n_title-replaced"
        title="Port"
      >
        <option value="virtual">
          Virtual Mode (Experimental)
        </option>
        <option value="manual">
          Manual Selection
        </option>
      </select>
    </div>
    <div id="auto-connect-and-baud">
      <div id="auto-connect-switch">
        <label style="display: flex; align-items: baseline">
          <input
            type="checkbox"
            class="auto_connect"
            title="Auto-Connect: Enabled - Configurator automatically tries to connect when new port is detected"
            style="display: none"
            data-switchery="true"
          >
          <span
            class="switchery switchery-small"
            :style="{ backgroundColor: isAutoConnect ? '#ffbb00' : '#858585' }"
          >
            <small
              :style="{ left: isAutoConnect ? '10px' : '0px', transition: 'ease-in-out 0.2s' }"
              @click="isAutoConnect = !isAutoConnect"
            /></span>
          <span
            i18n="autoConnect"
            class="auto_connect i18n-replaced"
            title="Auto-Connect: Enabled - Configurator automatically tries to connect when new port is detected"
          >Auto-Connect</span></label>
      </div>
      <div id="baudselect">
        <div class="dropdown dropdown-dark">
          <select
            id="baud"
            i18n_title="firmwareFlasherBaudRate"
            class="dropdown-select i18n_title-replaced"
            title="Baud Rate"
            :disabled="isAutoConnect"
          >
            <option value="1000000">
              1000000
            </option>
            <option value="500000">
              500000
            </option>
            <option value="250000">
              250000
            </option>
            <option
              value="115200"
              selected="selected"
            >
              115200
            </option>
            <option value="57600">
              57600
            </option>
            <option value="38400">
              38400
            </option>
            <option value="28800">
              28800
            </option>
            <option value="19200">
              19200
            </option>
            <option value="14400">
              14400
            </option>
            <option value="9600">
              9600
            </option>
            <option value="4800">
              4800
            </option>
            <option value="2400">
              2400
            </option>
            <option value="1200">
              1200
            </option>
          </select>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
    data() {
        return {
            isAutoConnect: false,
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

#auto-connect-switch {
    width: 110px;
    float: left;
    margin-top: 4px;
    margin-right: 20px;
}
.auto_connect {
    color: var(--subtleAccent);
    font-family: "Open Sans", "Segoe UI", Tahoma, sans-serif;
    font-size: 12px;
}

.switchery {
    height: 14px;
    width: 45px;
    -moz-user-select: none;
    -khtml-user-select: none;
    -webkit-user-select: none;
    -ms-user-select: none;
    user-select: none;
    box-sizing: content-box;
    background-clip: content-box;

    cursor: pointer;
    display: inline-block;
    position: relative;
    vertical-align: middle;
}

.switchery-small {
    border-radius: 20px;
    height: 10px;
    width: 20px;
    margin-right: 5px;

    background-color: var(--switcherysecond);
    transition: border 0.3s ease 0s, box-shadow 0.3s ease 0s,
        background-color 0.5s ease 0s;
}

.switchery small {
    background: #fff;
    border-radius: 100%;
    box-shadow: 0 1px 3px rgb(0 0 0 / 40%);
    height: 10px;
    width: 10px;
    position: absolute;
    top: 0;
}
#baudselect {
    width: 80px;
    float: right;
    margin-right: 2px;
}
</style>
