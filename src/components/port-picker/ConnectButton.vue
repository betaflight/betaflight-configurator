<template>
    <div class="sidebar-connect">
        <UButton
            v-if="isConnected"
            block
            color="error"
            variant="soft"
            icon="i-lucide-link-2-off"
            size="sm"
            :loading="connecting"
            :title="$t('disconnect')"
            @click="onDisconnectClick"
        >
            <span class="sidebar-connect__label">{{ $t("disconnect") }}</span>
        </UButton>
        <UFieldGroup v-else size="sm" orientation="horizontal" class="sidebar-connect__group w-full !flex">
            <UButton
                class="sidebar-connect__main"
                block
                color="success"
                variant="soft"
                icon="i-lucide-link-2"
                :loading="connecting"
                :disabled="portPickerDisabled"
                :title="mainLabel"
                @click="onConnectClick"
            >
                <span class="sidebar-connect__label">{{ mainLabel }}</span>
            </UButton>
            <UDropdownMenu
                v-slot="{ open }"
                :items="menuItems"
                :content="{ align: 'end', side: 'top' }"
                :ui="{ content: 'max-h-96 z-[2100]' }"
            >
                <UButton
                    color="success"
                    variant="soft"
                    :icon="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                    square
                    :disabled="portPickerDisabled"
                    :aria-label="$t('connect')"
                />
            </UDropdownMenu>
        </UFieldGroup>
        <ConnectOptionsDialog
            v-model="dialogOpen"
            :mode="dialogMode"
            :initial-version="portPicker.virtualMspVersion"
            :initial-port-override="portPicker.portOverride"
            @confirm="onDialogConfirm"
        />
    </div>
</template>

<script>
import { defineComponent, computed, ref } from "vue";
import { useConnectionStore } from "../../stores/connection";
import PortHandler from "../../js/port_handler";
import { connectDisconnect, disconnect } from "../../js/serial_backend";
import { i18n } from "../../js/localization";
import { set as setConfig } from "../../js/ConfigStorage";
import ConnectOptionsDialog from "./ConnectOptionsDialog.vue";

function selectAndConnect(path) {
    PortHandler.portPicker.selectedPort = path;
    connectDisconnect();
}

function onDialogConfirm({ mode, version, portOverride }) {
    if (mode === "virtual") {
        PortHandler.portPicker.virtualMspVersion = version;
        setConfig({ virtualMspVersion: version });
        selectAndConnect("virtual");
    } else {
        PortHandler.portPicker.portOverride = portOverride;
        setConfig({ portOverride });
        selectAndConnect("manual");
    }
}

function toggleAutoConnect(value) {
    PortHandler.portPicker.autoConnect = value;
    setConfig({ autoConnect: value });
}

export default defineComponent({
    name: "ConnectButton",
    components: { ConnectOptionsDialog },
    setup() {
        const connectionStore = useConnectionStore();

        const isConnected = computed(() => connectionStore.connectionValid);
        const connecting = computed(() => Boolean(connectionStore.connectingTo));
        const portPickerDisabled = computed(() => PortHandler.portPickerDisabled);

        const selectedPort = computed(() => PortHandler.portPicker.selectedPort);
        const serialPorts = computed(() => PortHandler.currentSerialPorts);
        const usbPorts = computed(() => PortHandler.currentUsbPorts);
        const bluetoothPorts = computed(() => PortHandler.currentBluetoothPorts);

        const selectedDisplayName = computed(() => {
            const path = selectedPort.value;
            if (!path || path === "noselection") {
                return null;
            }
            const all = [...serialPorts.value, ...usbPorts.value, ...bluetoothPorts.value];
            return all.find((d) => d.path === path)?.displayName ?? null;
        });

        const mainLabel = computed(() => {
            if (connecting.value) {
                return i18n.getMessage("connecting");
            }
            return selectedDisplayName.value ?? i18n.getMessage("connect");
        });

        const dialogOpen = ref(false);
        const dialogMode = ref("virtual");
        const portPicker = computed(() => PortHandler.portPicker);

        function openConnectDialog(mode) {
            dialogMode.value = mode;
            dialogOpen.value = true;
        }

        const menuItems = computed(() => {
            const items = [];
            const devices = [];

            if (PortHandler.showSerialOption) {
                for (const d of serialPorts.value) {
                    devices.push({
                        label: d.displayName,
                        icon: "i-lucide-usb",
                        onSelect: () => selectAndConnect(d.path),
                    });
                }
            }
            if (PortHandler.showUsbOption) {
                for (const d of usbPorts.value) {
                    devices.push({
                        label: d.displayName,
                        icon: "i-lucide-cpu",
                        onSelect: () => selectAndConnect(d.path),
                    });
                }
            }
            if (PortHandler.showBluetoothOption) {
                for (const d of bluetoothPorts.value) {
                    devices.push({
                        label: d.displayName,
                        icon: "i-lucide-bluetooth",
                        onSelect: () => selectAndConnect(d.path),
                    });
                }
            }

            if (PortHandler.showVirtualMode) {
                devices.push({
                    label: i18n.getMessage("portsSelectVirtual"),
                    icon: "i-lucide-flask-conical",
                    onSelect: () => openConnectDialog("virtual"),
                });
            }
            if (PortHandler.showManualMode) {
                devices.push({
                    label: i18n.getMessage("portsSelectManual"),
                    icon: "i-lucide-keyboard",
                    onSelect: () => openConnectDialog("manual"),
                });
            }

            if (devices.length) {
                items.push(...devices, { type: "separator" });
            }

            if (PortHandler.showSerialOption) {
                items.push({
                    label: i18n.getMessage("portsSelectPermission"),
                    icon: "i-lucide-plug-zap",
                    onSelect: () => PortHandler.requestDevicePermission("serial"),
                });
            }
            if (PortHandler.showBluetoothOption) {
                items.push({
                    label: i18n.getMessage("portsSelectPermissionBluetooth"),
                    icon: "i-lucide-bluetooth",
                    onSelect: () => PortHandler.requestDevicePermission("bluetooth"),
                });
            }
            if (PortHandler.showUsbOption) {
                items.push({
                    label: i18n.getMessage("portsSelectPermissionDFU"),
                    icon: "i-lucide-cpu",
                    onSelect: () => PortHandler.requestDevicePermission("usb"),
                });
            }

            items.push(
                { type: "separator" },
                {
                    type: "checkbox",
                    label: i18n.getMessage("autoConnect"),
                    checked: portPicker.value.autoConnect,
                    onUpdateChecked: toggleAutoConnect,
                    onSelect: (e) => e.preventDefault(),
                },
            );

            return items;
        });

        async function onConnectClick() {
            if (portPickerDisabled.value) {
                return;
            }

            if (selectedPort.value === "noselection") {
                PortHandler.selectActivePort();
                if (PortHandler.portPicker.selectedPort !== "noselection") {
                    connectDisconnect();
                    return;
                }
                await PortHandler.requestDevicePermission("serial");
                if (PortHandler.portPicker.selectedPort !== "noselection") {
                    connectDisconnect();
                }
                return;
            }

            connectDisconnect();
        }

        return {
            isConnected,
            connecting,
            portPickerDisabled,
            mainLabel,
            menuItems,
            dialogOpen,
            dialogMode,
            portPicker,
            onConnectClick,
            onDisconnectClick: disconnect,
            onDialogConfirm,
        };
    },
});
</script>

<style scoped>
.sidebar-connect {
    padding: 0.5rem 0;
}

.sidebar-connect__group {
    display: flex !important;
    width: 100% !important;
}

.sidebar-connect__main {
    flex: 1 1 0 !important;
    min-width: 0;
}

.sidebar-connect__label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

@media (max-width: 1055px) {
    .sidebar-connect {
        display: flex;
        justify-content: center;
    }
    .sidebar-connect__label {
        display: none;
    }
    .sidebar-connect__group {
        width: auto !important;
    }
}

/* Default Nuxt UI `success` soft tint is too pale in light mode — lift the contrast. */
html:not(.dark) .sidebar-connect :deep(button) {
    background-color: var(--success-400);
    border: 1px solid var(--success-600);
    color: var(--surface-900);
}
html:not(.dark) .sidebar-connect :deep(button:hover) {
    background-color: var(--success-500);
}

.tab_container.reveal .sidebar-connect {
    display: block;
}
.tab_container.reveal .sidebar-connect__label {
    display: inline;
}
.tab_container.reveal .sidebar-connect__group {
    width: 100% !important;
}
</style>
