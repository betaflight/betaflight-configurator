<template>
    <UiBox class="build_configuration col-span-1 mt-6">
        <SettingRow :label="$t('coreBuild')" :help="$t('coreBuildModeDescription')" full-width>
            <USwitch v-model="state.coreBuildMode" />
        </SettingRow>
        <div class="grid-box col1">
            <div v-show="!state.coreBuildMode" class="spacer">
                <div class="grid-box col2">
                    <SettingColumn
                        :label="$t('firmwareFlasherBuildRadioProtocols')"
                        :help="$t('firmwareFlasherRadioProtocolDescription')"
                    >
                        <USelect
                            v-model="state.selectedRadioProtocol"
                            :items="state.radioProtocolOptions"
                            @update:model-value="onRadioProtocolChange"
                            :placeholder="$t('firmwareFlasherSelectProtocol')"
                        />
                    </SettingColumn>
                    <SettingColumn
                        :label="$t('firmwareFlasherBuildTelemetryProtocols')"
                        :help="$t('firmwareFlasherTelemetryProtocolDescription')"
                    >
                        <USelect
                            v-model="state.selectedTelemetryProtocol"
                            :items="state.telemetryProtocolOptions"
                            @update:model-value="onTelemetryProtocolChange"
                            :placeholder="$t('firmwareFlasherSelectProtocol')"
                            :disabled="state.telemetryProtocolDisabled"
                        />
                    </SettingColumn>
                </div>
            </div>
            <div v-show="!state.coreBuildMode" class="spacer">
                <div class="grid-box col2">
                    <SettingColumn
                        :label="$t('firmwareFlasherBuildOsdProtocols')"
                        :help="$t('firmwareFlasherOsdProtocolDescription')"
                    >
                        <USelect
                            v-model="state.selectedOsdProtocol"
                            :items="state.osdProtocolOptions"
                            :placeholder="$t('firmwareFlasherSelectProtocol')"
                            @update:model-value="onOsdProtocolChange"
                            class="w-full"
                            :color="state.osdProtocolNeedsAttention ? 'error' : 'neutral'"
                        />
                    </SettingColumn>
                    <SettingColumn
                        :label="$t('firmwareFlasherBuildMotorProtocols')"
                        :help="$t('firmwareFlasherMotorProtocolDescription')"
                    >
                        <USelect
                            v-model="state.selectedMotorProtocol"
                            :items="state.motorProtocolOptions"
                            :placeholder="$t('firmwareFlasherSelectProtocol')"
                            @update:model-value="onMotorProtocolChange"
                            class="w-full"
                        />
                    </SettingColumn>
                </div>
            </div>
            <div v-show="!state.coreBuildMode" class="spacer">
                <div class="grid-box col1">
                    <SettingColumn
                        :label="$t('firmwareFlasherBuildOptions')"
                        :help="$t('firmwareFlasherOptionsDescription')"
                    >
                        <USelectMenu
                            id="optionsInfo"
                            v-model="state.selectedOptions"
                            multiple
                            by="value"
                            :items="state.optionsListOptions"
                            :placeholder="$t('firmwareFlasherSelectOptions')"
                            :search-input="{
                                placeholder: $t('search'),
                                icon: 'i-lucide-search',
                            }"
                            class="w-full"
                            :ui="{ content: 'max-h-96', base: 'pl-1.5' }"
                            @update:model-value="onOptionsChange"
                        >
                            <template #default>
                                <div class="flex gap-2 items-center min-h-6 flex-wrap">
                                    <UBadge
                                        v-for="option in state.selectedOptions"
                                        :key="option.value"
                                        color="neutral"
                                        variant="subtle"
                                        class="flex gap-2 items-center whitespace-nowrap"
                                    >
                                        {{ option.label }}
                                        <UButton
                                            type="button"
                                            variant="soft"
                                            color="neutral"
                                            size="xs"
                                            icon="i-lucide-x"
                                            class="p-0"
                                            :aria-label="
                                                $t('firmwareFlasherRemoveBuildOption', { option: option.label })
                                            "
                                            @click.stop="removeSelectedBuildOption(option)"
                                        />
                                    </UBadge>
                                </div>
                            </template>
                        </USelectMenu>
                    </SettingColumn>
                </div>
            </div>
            <div v-show="!state.coreBuildMode && state.expertOptionsVisible" class="expertOptions spacer">
                <div class="grid-box col1">
                    <SettingColumn
                        :label="$t('firmwareFlasherBuildCustomDefines')"
                        :help="$t('firmwareFlasherCustomDefinesDescription')"
                    >
                        <div id="customDefinesInfo">
                            <UInputTags
                                v-model="state.customDefinesTags"
                                name="customDefines"
                                delimiter=" "
                                add-on-paste
                                class="w-full"
                                :ui="{
                                    base: 'pl-1.5',
                                    input: 'appearance-none min-h-6',
                                    item: 'py-1 px-2 gap-2',
                                    itemDelete: 'p-0 rounded-full text-default',
                                    itemDeleteIcon: 'size-4',
                                }"
                            />
                        </div>
                    </SettingColumn>
                    <SettingColumn
                        v-show="state.commitSelectionVisible"
                        :label="$t('firmwareFlasherBranch')"
                        :help="$t('firmwareFlasherBranchDescription')"
                    >
                        <USelectMenu
                            id="branchInfo"
                            v-model="state.selectedCommit"
                            by="value"
                            :items="state.commitOptions"
                            create-item
                            :placeholder="$t('firmwareFlasherSelectBranch')"
                            :search-input="{
                                placeholder: $t('search'),
                                icon: 'i-lucide-search',
                            }"
                            class="w-full"
                            :ui="{ content: 'max-h-96' }"
                            @update:model-value="onCommitChange"
                            @create="onCommitCreate"
                        />
                    </SettingColumn>
                </div>
            </div>
        </div>
    </UiBox>
</template>

<script setup>
import UiBox from "@/components/elements/UiBox.vue";
import SettingRow from "@/components/elements/SettingRow.vue";
import SettingColumn from "@/components/elements/SettingColumn.vue";

defineProps({
    state: { type: Object, required: true },
    onRadioProtocolChange: { type: Function, required: true },
    onTelemetryProtocolChange: { type: Function, required: true },
    onOsdProtocolChange: { type: Function, required: true },
    onMotorProtocolChange: { type: Function, required: true },
    onOptionsChange: { type: Function, required: true },
    removeSelectedBuildOption: { type: Function, required: true },
    onCommitChange: { type: Function, required: true },
    onCommitCreate: { type: Function, required: true },
});
</script>
