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
.dropdown {
    display: inline-block;
    position: relative;
    overflow: hidden;
    height: 20px;
    background: #fff;
    background-image: -webkit-linear-gradient(
        top,
        transparent,
        rgba(0, 0, 0, 0.06)
    );
    background-image: -moz-linear-gradient(
        top,
        transparent,
        rgba(0, 0, 0, 0.06)
    );
    background-image: -o-linear-gradient(top, transparent, rgba(0, 0, 0, 0.06));
    background-image: linear-gradient(
        to bottom,
        transparent,
        rgba(0, 0, 0, 0.06)
    );
    -webkit-box-shadow: 0 1px 1px rgba(0, 0, 0, 0.08);
    box-shadow: 0 1px 1px rgba(0, 0, 0, 0.08);
    width: 99%;
    margin-bottom: 7px;
    border: 1px solid;
    border-color: #ccc #ccc #ccc;
    border-radius: 3px;
}

.dropdown:before,
.dropdown:after {
    content: "";
    position: absolute;
    z-index: 2;
    top: 7px;
    right: 7px;
    width: 0;
    height: 0;
    border: 4px dashed;
    border-color: #888 transparent;
    pointer-events: none;
}

.dropdown:before {
    border-bottom-style: solid;
    border-top: none;
    margin-top: -2px;
}

.dropdown:after {
    margin-top: 5px;
    border-top-style: solid;
    border-bottom: none;
}

.dropdown-select {
    position: relative;
    overflow: visible;
    width: 100%;
    margin-top: 0px;
    padding: 1px 8px 6px 5px;
    height: 23px;
    line-height: 20px;
    font-size: 12px;
    color: #62717a;
    text-shadow: 0 1px white;
    /* Fallback for IE 8 */
    background: #f2f2f2;
    /* "transparent" doesn't work with Opera */
    background: rgba(0, 0, 0, 0) !important;
    border: 0;
    border-radius: 0;
    -webkit-appearance: none;
    appearance: "none";
}

.dropdown-select:focus {
    z-index: 3;
    width: 90%;
    color: #4fa619;
    outline: 0px solid #49aff2;
    outline: 0px solid -webkit-focus-ring-color;
    outline-offset: 5px;
    height: 25px;
}

.dropdown-select > option {
    margin: 3px;
    padding: 6px 8px;
    text-shadow: none;
    background: #f2f2f2;
    border-radius: 3px;
    cursor: pointer;
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
</style>
