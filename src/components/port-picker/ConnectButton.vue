<template>
    <div class="sidebar-connect">
        <UButton
            v-if="isConnected"
            block
            color="error"
            variant="soft"
            icon="i-lucide-plug"
            size="sm"
            :loading="connecting"
            @click="onDisconnectClick"
        >
            {{ $t("disconnect") }}
        </UButton>
        <UFieldGroup v-else size="sm" orientation="horizontal" class="sidebar-connect__group">
            <UButton
                class="sidebar-connect__main"
                color="success"
                variant="soft"
                icon="i-lucide-plug"
                :loading="connecting"
                :disabled="portPickerDisabled"
                @click="onConnectClick"
            >
                {{ mainLabel }}
            </UButton>
            <UDropdownMenu :items="menuItems" :content="{ align: 'end', side: 'top' }" :ui="{ content: 'max-h-96' }">
                <UButton
                    color="success"
                    variant="soft"
                    icon="i-lucide-chevron-up"
                    square
                    :disabled="portPickerDisabled"
                    :aria-label="$t('connect')"
                />
            </UDropdownMenu>
        </UFieldGroup>
    </div>
</template>

<script>
import { defineComponent, computed } from "vue";
import { useConnectionStore } from "../../stores/connection";
import PortHandler from "../../js/port_handler";
import { connectDisconnect, disconnect } from "../../js/serial_backend";
import { i18n } from "../../js/localization";

export default defineComponent({
    name: "ConnectButton",
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

        function selectAndConnect(path) {
            PortHandler.portPicker.selectedPort = path;
            connectDisconnect();
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
                    onSelect: () => selectAndConnect("virtual"),
                });
            }
            if (PortHandler.showManualMode) {
                devices.push({
                    label: i18n.getMessage("portsSelectManual"),
                    icon: "i-lucide-keyboard",
                    onSelect: () => selectAndConnect("manual"),
                });
            }

            if (devices.length) {
                items.push(...devices);
                items.push({ type: "separator" });
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

        function onDisconnectClick() {
            disconnect();
        }

        return {
            isConnected,
            connecting,
            portPickerDisabled,
            mainLabel,
            menuItems,
            onConnectClick,
            onDisconnectClick,
        };
    },
});
</script>

<style scoped>
.sidebar-connect {
    padding: 0.5rem 0;
}

.sidebar-connect__group {
    display: flex;
    width: 100%;
}

.sidebar-connect__main {
    flex: 1 1 auto;
    min-width: 0;
    justify-content: center;
}
</style>
