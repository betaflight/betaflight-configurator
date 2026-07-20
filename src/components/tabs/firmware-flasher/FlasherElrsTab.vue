<template>
    <UiBox title="GIGLRS" type="neutral" class="mt-4">
        <p class="mb-4">
            The integrated ELRS workflow is limited to the GIGLRS target maintained by GIGFPV.
        </p>
        <SettingRow label="Receiver target" help="Only verified GIGLRS targets are offered in GIGFPV Station." full-width>
            <div class="font-medium">{{ receiver.productName }}</div>
        </SettingRow>
        <SettingRow label="Firmware build" help="The matching GIGLRS firmware profile is selected automatically." full-width>
            <div>{{ receiver.firmware }}</div>
        </SettingRow>
        <SettingRow
            label="Betaflight passthrough"
            help="Uses the active Betaflight connection. No second USB or serial handler is opened."
            full-width
        >
            <UButton v-if="!passthrough.active.value" color="primary" @click="startPassthrough">
                Open passthrough
            </UButton>
            <UButton v-else color="error" variant="outline" @click="stopPassthrough">Close passthrough</UButton>
        </SettingRow>
        <UAlert
            v-if="passthrough.active.value"
            color="success"
            variant="soft"
            title="GIGLRS passthrough is active"
            description="The connected flight controller is now bridging its Serial RX port to the GIGLRS receiver. Close this session before returning to flight-controller configuration."
        />
        <UAlert
            v-else-if="passthroughError"
            color="error"
            variant="soft"
            title="Could not open GIGLRS passthrough"
            :description="passthroughError"
        />
        <UAlert
            v-else
            color="neutral"
            variant="soft"
            title="Ready for the GIGLRS workflow"
            description="Connect to the flight controller first, then open passthrough. Firmware releases will be listed here once they are published by GIGLRS."
        />
    </UiBox>
</template>

<script setup>
import { onBeforeUnmount, ref } from "vue";
import UiBox from "@/components/elements/UiBox.vue";
import SettingRow from "@/components/elements/SettingRow.vue";
import { GIGLRS_TARGETS } from "@/js/GigfpvCatalog";
import { FcSerialPortFunction, useFcSerialPassthrough } from "@/composables/useFcSerialPassthrough";

const receiver = GIGLRS_TARGETS[0];
const passthrough = useFcSerialPassthrough();
const passthroughError = ref("");

const startPassthrough = async () => {
    passthroughError.value = "";
    try {
        await passthrough.start({
            name: receiver.productName,
            portFunction: FcSerialPortFunction.RX_SERIAL,
        });
    } catch (error) {
        passthroughError.value = error instanceof Error ? error.message : String(error);
    }
};

const stopPassthrough = async () => {
    passthroughError.value = "";
    try {
        await passthrough.stop();
    } catch (error) {
        passthroughError.value = error instanceof Error ? error.message : String(error);
    }
};

onBeforeUnmount(async () => {
    if (passthrough.active.value) {
        await stopPassthrough();
    }
});
</script>
