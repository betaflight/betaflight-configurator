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
            :title="disconnectLabel"
            @click="onDisconnectClick"
        >
            <span class="sidebar-connect__label">{{ disconnectLabel }}</span>
        </UButton>
        <UFieldGroup v-else size="sm" orientation="horizontal" class="sidebar-connect__group w-full !flex">
            <UButton
                class="sidebar-connect__main"
                block
                color="success"
                variant="soft"
                icon="i-lucide-link-2"
                :loading="connecting"
                :disabled="devicePickerDisabled"
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
                    :disabled="devicePickerDisabled"
                    :aria-label="$t('connect')"
                />
            </UDropdownMenu>
        </UFieldGroup>
        <ConnectOptionsDialog
            v-model="dialogOpen"
            :mode="dialogMode"
            :initial-version="devicePicker.virtualMspVersion"
            :initial-port-override="devicePicker.portOverride"
            @confirm="onDialogConfirm"
        />
    </div>
</template>

<script>
import { defineComponent, computed, ref } from "vue";
import { useConnectionStore } from "../../stores/connection";
import DeviceHandler from "../../js/device_handler";
import { connectDisconnect, disconnect } from "../../js/serial_backend";
import { i18n } from "../../js/localization";
import { set as setConfig } from "../../js/ConfigStorage";
import { isExpertModeEnabled } from "../../js/utils/isExpertModeEnabled";
import ConnectOptionsDialog from "./ConnectOptionsDialog.vue";

function selectAndConnect(path) {
    DeviceHandler.devicePicker.selectedDevice = path;
    connectDisconnect();
}

function onDialogConfirm({ mode, version, portOverride }) {
    if (mode === "virtual") {
        DeviceHandler.devicePicker.virtualMspVersion = version;
        setConfig({ virtualMspVersion: version });
        selectAndConnect("virtual");
    } else {
        DeviceHandler.devicePicker.portOverride = portOverride;
        setConfig({ portOverride });
        selectAndConnect("manual");
    }
}

function toggleAutoConnect(value) {
    DeviceHandler.devicePicker.autoConnect = value;
    setConfig({ autoConnect: value });
}

export default defineComponent({
    name: "ConnectButton",
    components: { ConnectOptionsDialog },
    setup() {
        const connectionStore = useConnectionStore();

        const isConnected = computed(() => connectionStore.connectionValid);
        const connecting = computed(() => Boolean(connectionStore.connectingTo));
        const isVirtualMode = computed(() => connectionStore.virtualMode);
        const connectedTo = computed(() => connectionStore.connectedTo);

        const disconnectLabel = computed(() => {
            if (isVirtualMode.value) {
                return i18n.getMessage("disconnectVirtual");
            }
            const path = connectedTo.value || "";
            if (path.startsWith("bluetooth")) {
                return i18n.getMessage("disconnectBluetooth");
            }
            if (/^(tcp|ws|wss):\/\//.test(path)) {
                return i18n.getMessage("disconnectManual");
            }
            return i18n.getMessage("disconnect");
        });
        const devicePickerDisabled = computed(() => DeviceHandler.devicePickerDisabled);

        const selectedDevice = computed(() => DeviceHandler.devicePicker.selectedDevice);
        const serialPorts = computed(() => DeviceHandler.currentSerialPorts);
        const usbPorts = computed(() => DeviceHandler.currentUsbPorts);
        const bluetoothPorts = computed(() => DeviceHandler.currentBluetoothPorts);

        const selectedDisplayName = computed(() => {
            const path = selectedDevice.value;
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
            if (selectedDevice.value === "virtual") {
                return i18n.getMessage("connectVirtual");
            }
            return selectedDisplayName.value ?? i18n.getMessage("connect");
        });

        const dialogOpen = ref(false);
        const dialogMode = ref("virtual");
        const devicePicker = computed(() => DeviceHandler.devicePicker);

        function openConnectDialog(mode) {
            dialogMode.value = mode;
            dialogOpen.value = true;
        }

        function buildDeviceItems() {
            const expertMode = isExpertModeEnabled();
            const devices = [];
            if (DeviceHandler.showSerialOption) {
                for (const d of serialPorts.value) {
                    devices.push({
                        label: d.displayName,
                        icon: "i-lucide-usb",
                        onSelect: () => selectAndConnect(d.path),
                    });
                }
            }
            if (DeviceHandler.showUsbOption) {
                for (const d of usbPorts.value) {
                    devices.push({
                        label: d.displayName,
                        icon: "i-lucide-cpu",
                        onSelect: () => selectAndConnect(d.path),
                    });
                }
            }
            if (DeviceHandler.showBluetoothOption) {
                for (const d of bluetoothPorts.value) {
                    devices.push({
                        label: d.displayName,
                        icon: "i-lucide-bluetooth",
                        onSelect: () => selectAndConnect(d.path),
                    });
                }
            }
            if (expertMode && DeviceHandler.showVirtualMode) {
                devices.push({
                    label: i18n.getMessage("portsSelectVirtual"),
                    icon: "i-lucide-flask-conical",
                    onSelect: () => openConnectDialog("virtual"),
                });
            }
            if (expertMode && DeviceHandler.showManualMode) {
                devices.push({
                    label: i18n.getMessage("portsSelectManual"),
                    icon: "i-lucide-keyboard",
                    onSelect: () => openConnectDialog("manual"),
                });
            }
            return devices;
        }

        function buildPermissionItems() {
            const items = [];
            if (DeviceHandler.showSerialOption) {
                items.push({
                    label: i18n.getMessage("portsSelectPermission"),
                    icon: "i-lucide-plug-zap",
                    onSelect: () => DeviceHandler.requestDevicePermission("serial"),
                });
            }
            if (DeviceHandler.showBluetoothOption) {
                items.push({
                    label: i18n.getMessage("portsSelectPermissionBluetooth"),
                    icon: "i-lucide-bluetooth",
                    onSelect: () => DeviceHandler.requestDevicePermission("bluetooth"),
                });
            }
            return items;
        }

        const menuItems = computed(() => {
            const devices = buildDeviceItems();
            const items = devices.length ? [...devices, { type: "separator" }] : [];
            items.push(
                ...buildPermissionItems(),
                { type: "separator" },
                {
                    type: "checkbox",
                    label: i18n.getMessage("autoConnect"),
                    checked: devicePicker.value.autoConnect,
                    onUpdateChecked: toggleAutoConnect,
                    onSelect: (e) => e.preventDefault(),
                },
            );
            return items;
        });

        async function onConnectClick() {
            if (devicePickerDisabled.value) {
                return;
            }

            // Guard against a persisted virtual/manual selection when expert mode is off.
            const gatedModes = ["virtual", "manual"];
            if (!isExpertModeEnabled() && gatedModes.includes(selectedDevice.value)) {
                DeviceHandler.devicePicker.selectedDevice = "noselection";
            }

            if (selectedDevice.value === "noselection") {
                DeviceHandler.selectActivePort();
                if (DeviceHandler.devicePicker.selectedDevice !== "noselection") {
                    connectDisconnect();
                    return;
                }
                await DeviceHandler.requestDevicePermission("serial");
                if (DeviceHandler.devicePicker.selectedDevice !== "noselection") {
                    connectDisconnect();
                }
                return;
            }

            connectDisconnect();
        }

        return {
            isConnected,
            connecting,
            devicePickerDisabled,
            disconnectLabel,
            mainLabel,
            menuItems,
            dialogOpen,
            dialogMode,
            devicePicker,
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
html:not(.dark) .sidebar-connect :deep(button.color-success) {
    background-color: var(--success-400);
    border: 1px solid var(--success-600);
    color: var(--surface-900);
}
html:not(.dark) .sidebar-connect :deep(button.color-success:hover) {
    background-color: var(--success-500);
}

/* Disconnect button (error) styling for light mode - ensure it's red */
html:not(.dark) .sidebar-connect :deep(button.color-error) {
    background-color: var(--error-500);
    border: 1px solid var(--error-600);
    color: var(--surface-50);
}
html:not(.dark) .sidebar-connect :deep(button.color-error:hover) {
    background-color: var(--error-600);
}

/* Disconnect button (error) styling for dark mode - ensure proper contrast */
html.dark .sidebar-connect :deep(button.color-error) {
    background-color: var(--error-500);
    border: 1px solid var(--error-600);
    color: var(--surface-50);
}
html.dark .sidebar-connect :deep(button.color-error:hover) {
    background-color: var(--error-600);
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
