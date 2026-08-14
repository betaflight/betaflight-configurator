<template>
    <UiBox v-if="dirty" type="warning" highlight class="mb-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex flex-col">
                <span class="font-semibold" v-html="$t('serialPortPendingChanges')"></span>
                <span class="text-xs text-dimmed" v-html="$t('serialPortRebootRequired')"></span>
            </div>
            <UButton :label="$t('serialPortSaveAndReboot')" size="xs" @click="save" />
        </div>
    </UiBox>
</template>

<script setup>
import { storeToRefs } from "pinia";
import UiBox from "../elements/UiBox.vue";
import { useSerialPortsStore } from "../../stores/serialPorts";

/**
 * Serial port edits now survive a tab switch, so an edit made here can be applied from anywhere -
 * which also means an edit can be forgotten. This banner is what stops a user assigning GPS,
 * wandering off, and never rebooting. It belongs on every tab that hosts a SerialFunctionRow and
 * on the Ports tab.
 */
const store = useSerialPortsStore();
const { dirty } = storeToRefs(store);
const { save } = store;
</script>
