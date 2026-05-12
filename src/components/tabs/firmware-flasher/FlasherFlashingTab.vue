<template>
    <div class="flashing-tab-content">
        <!-- Flash progress / spinner -->
        <div v-if="state.flashingInProgress" class="flashing-wait">
            <ProgressRing
                :value="state.flashProgressValue"
                :indeterminate="state.flashProgressValue === 0"
                :size="80"
                :stroke-width="6"
                :color="flashRingColor"
                :label="$t('firmwareFlasherFlashingProgress')"
            />
            <p>{{ state.progressLabelText }} {{ $t("firmwareFlasherPleaseWait") }}</p>
        </div>
        <div
            v-else-if="state.progressLabelText && state.progressLabelClass === 'invalid'"
            class="flash-status-message flash-status-error"
        >
            {{ state.progressLabelText }}
        </div>

        <!-- Warning and Recovery panes -->
        <div class="grid-box col2 mt-2">
            <UiBox :title="$t('warningTitle')" type="error" highlight class="note-text-format">
                <p>{{ $t("firmwareFlasherWarningShort") }}</p>
                <a
                    href="https://betaflight.com/docs/wiki/app/firmware-flasher-tab#basic-flashing-procedure"
                    target="_blank"
                    rel="noopener noreferrer"
                    >{{ $t("firmwareFlasherReadMore") }}</a
                >
            </UiBox>
            <UiBox :title="$t('firmwareFlasherRecoveryHead')" highlight class="note-text-format">
                <p>{{ $t("firmwareFlasherRecoveryShort") }}</p>
                <a
                    href="https://betaflight.com/docs/wiki/app/firmware-flasher-tab#troubleshooting"
                    target="_blank"
                    rel="noopener noreferrer"
                    >{{ $t("firmwareFlasherReadMore") }}</a
                >
            </UiBox>
        </div>

        <!-- Advanced (expert) options -->
        <UiBox
            v-if="state.expertOptionsVisible"
            :title="$t('firmwareFlasherAdvancedTitle')"
            collapsible
            :default-open="false"
            type="neutral"
            class="mt-2"
        >
            <SettingRow
                :label="$t('firmwareFlasherNoReboot')"
                :help="$t('firmwareFlasherNoRebootDescription')"
                full-width
            >
                <USwitch v-model="state.noRebootSequence" @change="onNoRebootChange" />
            </SettingRow>
            <SettingRow
                :label="$t('firmwareFlasherFullChipErase')"
                :help="$t('firmwareFlasherFullChipEraseDescription')"
                full-width
            >
                <USwitch v-model="state.eraseChip" @change="onEraseChipChange" />
            </SettingRow>
            <SettingRow
                :label="$t('firmwareFlasherManualBaud')"
                :help="$t('firmwareFlasherManualBaudDescription')"
                full-width
            >
                <USwitch v-model="state.flashManualBaud" @change="onFlashManualBaudChange" />
                <USelect
                    v-model="state.flashManualBaudRate"
                    :items="[
                        { value: 921600, label: '921600' },
                        { value: 460800, label: '460800' },
                        { value: 256000, label: '256000' },
                        { value: 230400, label: '230400' },
                        { value: 115200, label: '115200' },
                        { value: 57600, label: '57600' },
                    ]"
                    class="min-w-24"
                />
            </SettingRow>
        </UiBox>
    </div>
</template>

<script setup>
import UiBox from "@/components/elements/UiBox.vue";
import SettingRow from "@/components/elements/SettingRow.vue";
import ProgressRing from "@/components/ProgressRing.vue";

defineProps({
    state: { type: Object, required: true },
    flashRingColor: { type: String, required: true },
    onNoRebootChange: { type: Function, required: true },
    onEraseChipChange: { type: Function, required: true },
    onFlashManualBaudChange: { type: Function, required: true },
});
</script>

<style scoped>
.flashing-tab-content {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

.flashing-wait {
    min-height: 150px;
    height: 50%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
}

.flash-status-message {
    padding: 0.5rem 1rem;
    border-radius: 0.25rem;
    font-size: 0.85rem;
}

.flash-status-error {
    background-color: var(--error-500);
    color: white;
}
</style>
