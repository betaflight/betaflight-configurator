<template>
    <UiBox :title="$t('firmwareFlasherBoardSelectionHead')" type="neutral" class="mt-4">
        <SettingRow :help="$t('firmwareFlasherOnlineSelectBoardHint')" full-width>
            <div class="flex items-center gap-2">
                <UFieldGroup class="min-w-80">
                    <USelectMenu
                        v-model="boardSelection.state.selectedBoard"
                        v-model:search-term="boardSelection.state.boardSelectSearchTerm"
                        :items="boardSelection.getSelectMenuItems()"
                        value-key="value"
                        :placeholder="$t('firmwareFlasherSearchBoard')"
                        ignore-filter
                        class="w-full"
                        :virtualize="{
                            estimateSize: 28,
                        }"
                        @update:model-value="onBoardChange"
                    />
                    <UButton
                        :label="$t('firmwareFlasherDetectBoardButton')"
                        color="primary"
                        :disabled="boardSelection.state.detectingBoard"
                        :title="$t('firmwareFlasherOnlineSelectBoardDescription')"
                        icon="i-lucide-search"
                        :loading="boardSelection.state.detectingBoard"
                        @click="onDetectBoard"
                    />
                </UFieldGroup>
            </div>
        </SettingRow>
        <SettingRow :help="$t('firmwareFlasherOnlineSelectFirmwareVersionDescription')" full-width>
            <USelect
                v-model="boardSelection.state.selectedFirmwareVersion"
                value-key="release"
                :items="boardSelection.state.firmwareVersionOptions"
                class="min-w-80"
                :disabled="
                    !boardSelection.state.firmwareVersionOptions ||
                    boardSelection.state.firmwareVersionOptions.length === 0
                "
                @update:model-value="onFirmwareVersionChange"
                :placeholder="$t('firmwareFlasherOptionLabelSelectFirmwareVersion')"
            />
        </SettingRow>
    </UiBox>
</template>

<script setup>
import UiBox from "@/components/elements/UiBox.vue";
import SettingRow from "@/components/elements/SettingRow.vue";

defineProps({
    state: { type: Object, required: true },
    boardSelection: { type: Object, required: true },
    onBoardChange: { type: Function, required: true },
    onDetectBoard: { type: Function, required: true },
    onFirmwareVersionChange: { type: Function, required: true },
});
</script>
