<template>
    <BaseTab tab-name="transponder" :extra-class="supported ? 'transponder-supported' : ''">
        <div class="content_wrapper">
            <div class="tab_title" v-html="$t('tabTransponder')"></div>

            <WikiButton docUrl="transponder" />

            <div class="require-transponder-unsupported note">
                <p v-html="$t('transponderNotSupported')"></p>
            </div>

            <div class="require-transponder-supported">
                <div class="gui_box grey">
                    <div class="gui_box_titlebar">
                        <div class="spacer_box_title" v-html="$t('transponderConfigurationType')"></div>
                    </div>

                    <div class="spacer_box">
                        <div class="radio transponderType">
                            <div class="textspacer-small">
                                <select id="transponder_type_select" v-model="selectedProviderId">
                                    <option v-if="hasMultipleProviders" value="0">
                                        {{ $t("transponderType0") }}
                                    </option>
                                    <option
                                        v-for="provider in providers"
                                        :key="provider.id"
                                        :value="String(provider.id)"
                                    >
                                        {{ $t(`transponderType${provider.id}`) }}
                                    </option>
                                </select>
                            </div>
                        </div>

                        <div v-if="helpText" id="transponderHelpBox">
                            <div class="clear-both"></div>
                            <div class="note">
                                <p id="transponderHelp" v-html="helpText"></p>
                            </div>
                        </div>
                    </div>
                </div>

                <div v-if="currentProvider" id="transponder-configuration" class="gui_box grey">
                    <div class="gui_box_titlebar">
                        <div class="spacer_box_title" v-html="$t(`transponderData${currentProvider.id}`)"></div>
                    </div>
                    <div class="spacer_box">
                        <div class="text">
                            <span v-if="dataHelpText" class="dataHelp" v-html="dataHelpText"></span>
                            <div class="input_block textspacer">
                                <template v-if="currentConfig.dataType === DATA_TYPES.TEXT">
                                    <input
                                        v-model="dataInput"
                                        type="text"
                                        :maxlength="Number(currentProvider.dataLength) * 2"
                                    />
                                </template>
                                <template v-else-if="currentConfig.dataType === DATA_TYPES.LIST">
                                    <select v-model="dataInput">
                                        <option
                                            v-for="(hexValue, label) in currentConfig.dataOptions"
                                            :key="label"
                                            :value="hexValue"
                                        >
                                            {{ label }}
                                        </option>
                                    </select>
                                </template>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="clear-both"></div>
            <div class="note">
                <p v-html="$t('transponderInformation')"></p>
            </div>
        </div>

        <div v-if="supported" class="content_toolbar require-transponder-supported toolbar_fixed_bottom">
            <div class="btn save_btn" :class="{ save_reboot: needsReboot, save_no_reboot: !needsReboot }">
                <a class="save" href="#" @click.prevent="saveConfig">
                    {{ needsReboot ? $t("transponderButtonSaveReboot") : $t("transponderButtonSave") }}
                </a>
            </div>
        </div>
    </BaseTab>
</template>

<script>
import { computed, defineComponent, nextTick, onMounted, ref, watch } from "vue";
import { useFlightControllerStore } from "@/stores/fc";
import { useReboot } from "@/composables/useReboot";
import CONFIGURATOR from "@/js/data_storage";
import { gui_log } from "@/js/gui_log";
import { i18n } from "@/js/localization";
import MSP from "@/js/msp";
import { mspHelper } from "@/js/msp/MSPHelper";
import MSPCodes from "@/js/msp/MSPCodes";
import WikiButton from "../elements/WikiButton.vue";
import BaseTab from "./BaseTab.vue";

const DATA_TYPES = {
    NONE: 0,
    TEXT: 1,
    LIST: 2,
};

const TRANSPONDER_CONFIGURATIONS = {
    0: { dataType: DATA_TYPES.NONE },
    1: { dataType: DATA_TYPES.TEXT },
    2: {
        dataType: DATA_TYPES.LIST,
        dataOptions: {
            "ID 1": "E00370FC0FFE07E0FF",
            "ID 2": "007C003EF800FC0FFE",
            "ID 3": "F8811FF8811FFFC7FF",
            "ID 4": "007C003EF81F800FFE",
            "ID 5": "F00FFF00FFF00FF0FF",
            "ID 6": "007CF0C1071F7C00F0",
            "ID 7": "E003F03F00FF03F0C1",
            "ID 8": "00FC0FFE071F3E00FE",
            "ID 9": "E083BFF00F9E38C0FF",
        },
    },
    3: {
        dataType: DATA_TYPES.LIST,
        dataOptions: Object.fromEntries(
            Array.from({ length: 64 }, (_, index) => [index, index.toString(16).padStart(2, "0").toUpperCase()]),
        ),
    },
};

function ensureTransponderState(fcStore) {
    if (!fcStore.transponder) {
        fcStore.transponder = {
            supported: false,
            provider: 0,
            providers: [],
            data: [],
        };
    }
}

function hexToBytes(hex) {
    if (typeof hex !== "string" || hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) {
        return [];
    }

    const bytes = [];

    for (let index = 0; index < hex.length; index += 2) {
        const parsedByte = Number.parseInt(hex.slice(index, index + 2), 16);
        if (Number.isNaN(parsedByte)) {
            return [];
        }
        bytes.push(~parsedByte);
    }

    return bytes;
}

function bytesToHex(bytes) {
    return bytes
        .map((value) => (~value & 0xff).toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase();
}

function isValidHexData(value, byteLength) {
    return new RegExp(`^[0-9a-fA-F]{${byteLength * 2}}$`).test(value);
}

export default defineComponent({
    name: "TransponderTab",
    components: {
        BaseTab,
        WikiButton,
    },
    setup() {
        const fcStore = useFlightControllerStore();
        const { reboot } = useReboot();

        const dataInput = ref("");
        const selectedProviderId = ref("0");
        const defaultProviderId = ref("0");
        const persistentInputValues = ref({});
        const isHydrating = ref(false);

        const supported = computed(() => fcStore.transponder?.supported ?? false);
        const providers = computed(() => fcStore.transponder?.providers ?? []);
        const hasMultipleProviders = computed(() => providers.value.length > 1);
        const currentProvider = computed(() =>
            providers.value.find((provider) => String(provider.id) === selectedProviderId.value),
        );
        const currentConfig = computed(
            () => TRANSPONDER_CONFIGURATIONS[currentProvider.value?.id ?? 0] ?? TRANSPONDER_CONFIGURATIONS[0],
        );
        const helpText = computed(() => {
            if (!currentProvider.value) {
                return "";
            }

            const message = i18n.getMessage(`transponderHelp${currentProvider.value.id}`);
            return message.length ? message : "";
        });
        const dataHelpText = computed(() => {
            if (!currentProvider.value) {
                return "";
            }

            const key = `transponderDataHelp${currentProvider.value.id}`;
            return i18n.existsMessage(key) ? i18n.getMessage(key) : "";
        });
        const needsReboot = computed(() => selectedProviderId.value !== defaultProviderId.value);

        function loadData() {
            ensureTransponderState(fcStore);

            MSP.send_message(MSPCodes.MSP_TRANSPONDER_CONFIG, false, false, () => {
                ensureTransponderState(fcStore);

                const providerId = String(fcStore.transponder.provider ?? 0);
                const loadedValue = bytesToHex(fcStore.transponder.data ?? []);

                isHydrating.value = true;
                persistentInputValues.value = {
                    ...persistentInputValues.value,
                    [providerId]: loadedValue,
                };
                selectedProviderId.value = providerId;
                defaultProviderId.value = providerId;
                dataInput.value = loadedValue;

                nextTick(() => {
                    isHydrating.value = false;
                });
            });
        }

        function updateStore() {
            ensureTransponderState(fcStore);

            fcStore.transponder.provider = Number(selectedProviderId.value);

            if (selectedProviderId.value === "0" || !currentProvider.value) {
                fcStore.transponder.data = [];
                return;
            }

            if (!isValidHexData(dataInput.value, Number(currentProvider.value.dataLength))) {
                fcStore.transponder.data = [];
                return;
            }

            fcStore.transponder.data = hexToBytes(dataInput.value);
        }

        function saveConfig() {
            updateStore();

            if (
                selectedProviderId.value !== "0" &&
                fcStore.transponder.data.length !== Number(currentProvider.value?.dataLength ?? 0)
            ) {
                gui_log(i18n.getMessage("transponderDataInvalid"));
                return;
            }

            MSP.send_message(
                MSPCodes.MSP_SET_TRANSPONDER_CONFIG,
                mspHelper.crunch(MSPCodes.MSP_SET_TRANSPONDER_CONFIG),
                false,
                (response) => {
                    if (!CONFIGURATOR.virtualMode && (!response || response.crcError)) {
                        gui_log(i18n.getMessage("configurationSaveFailed"));
                        selectedProviderId.value = defaultProviderId.value;
                        return;
                    }

                    mspHelper.writeConfiguration(needsReboot.value, () => {
                        const shouldReboot = needsReboot.value;
                        defaultProviderId.value = selectedProviderId.value;

                        if (shouldReboot) {
                            reboot();
                        }
                    });
                },
            );
        }

        watch(selectedProviderId, (newValue, oldValue) => {
            if (isHydrating.value || newValue === oldValue) {
                return;
            }

            if (oldValue !== undefined) {
                persistentInputValues.value = {
                    ...persistentInputValues.value,
                    [oldValue]: dataInput.value,
                };
            }

            dataInput.value = persistentInputValues.value[newValue] ?? "";
        });

        watch(dataInput, (newValue) => {
            persistentInputValues.value = {
                ...persistentInputValues.value,
                [selectedProviderId.value]: newValue,
            };
        });

        onMounted(loadData);

        return {
            supported,
            providers,
            hasMultipleProviders,
            selectedProviderId,
            dataInput,
            currentProvider,
            currentConfig,
            helpText,
            dataHelpText,
            needsReboot,
            DATA_TYPES,
            saveConfig,
        };
    },
});
</script>

<style lang="less">
.tab-transponder {
    .spacer_box {
        padding-bottom: 10px;
        float: left;
        width: calc(100% - 20px);
    }
    .text {
        input {
            width: 100px;
            padding-left: 3px;
            height: 20px;
            line-height: 20px;
            text-align: left;
            border: 1px solid var(--surface-500);
            border-radius: 3px;
            margin-right: 11px;
            font-size: 12px;
            font-weight: normal;
            background: var(--surface-200);
            color: var(--text);
        }
        span {
            margin-left: 0px;
        }
        margin-bottom: 5px;
        clear: left;
        padding-bottom: 5px;
        border-bottom: 1px solid var(--surface-500);
        width: 100%;
        float: left;
        &:last-child {
            border-bottom: none;
            padding-bottom: 0px;
            margin-bottom: 0px;
        }
    }
    input {
        float: left;
    }
    span {
        margin: 0px;
    }
    .textspacer {
        float: left;
        width: 115px;
        height: 21px;
    }
    .gui_box {
        span {
            font-style: normal;
            line-height: 19px;
            color: var(--text);
            font-size: 11px;
        }
    }
    select {
        min-width: 100px;
        border: 1px solid var(--surface-500);
        border-radius: 3px;
        background: var(--surface-200);
        color: var(--text);
    }
}
.require-transponder-supported {
    display: none;
}
.tab-transponder.transponder-supported {
    .require-transponder-unsupported {
        display: none;
    }
    .require-transponder-supported {
        display: block;
    }
}
.textspacer-small {
    margin-bottom: 15px;
}
</style>
