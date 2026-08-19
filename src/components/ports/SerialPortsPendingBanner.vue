<template>
    <UiBox v-if="dirty" type="warning" highlight class="mb-4">
        <div class="flex flex-col">
            <span class="font-semibold" v-html="$t('serialPortPendingChanges')"></span>
            <span class="text-xs text-dimmed" v-html="$t('serialPortRebootRequired')"></span>
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
 * wandering off, and never rebooting.
 *
 * It says only that, and carries no button: it mounts on the Ports tab, whose own Save is enabled
 * on exactly the same condition and sits in the toolbar where every other tab keeps it. Two
 * controls doing one thing reads as two different saves.
 */
const store = useSerialPortsStore();
const { dirty } = storeToRefs(store);
</script>
