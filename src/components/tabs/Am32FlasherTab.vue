<template>
    <BaseTab tab-name="am32_flasher">
        <div class="content_wrapper">
            <div class="tab_title">AM32 Flasher</div>
            <FlasherAm32Tab ref="am32Flasher" />
        </div>

        <div class="content_toolbar toolbar_fixed_bottom">
            <UFieldGroup size="sm" orientation="horizontal" class="flex!">
                <UButton
                    :disabled="!am32CanFlash"
                    :color="am32CanFlash ? 'success' : 'neutral'"
                    :loading="am32Busy && am32ActiveOperation === 'flash'"
                    @click="handleAm32FlashFirmware"
                >
                    {{ $t("firmwareFlasherFlashFirmware") }}
                </UButton>
                <UDropdownMenu v-slot="{ open }" :items="am32FlashActionMenuItems" :content="{ align: 'end', side: 'top' }">
                    <UButton
                        :color="am32CanFlash ? 'success' : 'neutral'"
                        :icon="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                        :aria-label="$t('firmwareFlasherFlashFirmwareOptions')"
                        square
                    />
                </UDropdownMenu>
            </UFieldGroup>

            <UFieldGroup size="sm" orientation="horizontal" class="flex!">
                <UButton :disabled="!am32CanRead" :loading="am32Busy && am32ActiveOperation === 'read'" @click="handleAm32ReadEscs">
                    Read ESCs
                </UButton>
            </UFieldGroup>

            <UFieldGroup size="sm" orientation="horizontal" class="flex!">
                <UButton
                    :disabled="!am32CanLoadOnlineFirmware"
                    :loading="am32Busy && am32ActiveOperation === 'load-online'"
                    @click="handleAm32LoadOnlineFirmware"
                >
                    {{ $t("firmwareFlasherButtonLoadOnline") }}
                </UButton>
                <UDropdownMenu v-slot="{ open }" :items="am32LoadFirmwareMenuItems" :content="{ align: 'end', side: 'top' }">
                    <UButton
                        :icon="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                        :aria-label="$t('firmwareFlasherLoadFirmwareOptions')"
                        square
                    />
                </UDropdownMenu>
            </UFieldGroup>
        </div>
    </BaseTab>
</template>

<script setup>
import { computed, ref } from "vue";
import BaseTab from "./BaseTab.vue";
import FlasherAm32Tab from "./firmware-flasher/FlasherAm32Tab.vue";

const am32Flasher = ref(null);

function getAm32ExposedValue(key, fallback = false) {
    const value = am32Flasher.value?.[key];
    return value?.value ?? value ?? fallback;
}

const am32Busy = computed(() => Boolean(getAm32ExposedValue("busy")));
const am32ActiveOperation = computed(() => String(getAm32ExposedValue("activeOperation", "")));
const am32CanRead = computed(() => Boolean(getAm32ExposedValue("canRead")));
const am32CanFlash = computed(() => Boolean(getAm32ExposedValue("canFlash")));
const am32CanLoadOnlineFirmware = computed(() => Boolean(getAm32ExposedValue("canLoadOnlineFirmware")));
const am32CanLoadLocalFirmware = computed(() => Boolean(getAm32ExposedValue("canLoadLocalFirmware")));
const am32SessionActive = computed(() => Boolean(getAm32ExposedValue("sessionActive")));

function handleAm32FlashFirmware() {
    am32Flasher.value?.flashSelectedEscs?.();
}

function handleAm32ReadEscs() {
    am32Flasher.value?.readEscs?.();
}

function handleAm32LoadOnlineFirmware() {
    am32Flasher.value?.loadOnlineFirmware?.();
}

function handleAm32LoadLocalFirmware() {
    am32Flasher.value?.loadLocalFirmware?.();
}

function handleAm32ExitPassthrough() {
    am32Flasher.value?.exitPassthrough?.();
}

const am32FlashActionMenuItems = computed(() => [
    [
        {
            label: "Flash Firmware",
            icon: "i-lucide-zap",
            disabled: !am32CanFlash.value,
            onSelect: handleAm32FlashFirmware,
        },
        {
            label: "Close passthrough",
            icon: "i-lucide-unplug",
            disabled: !am32SessionActive.value || am32Busy.value,
            onSelect: handleAm32ExitPassthrough,
        },
    ],
]);

const am32LoadFirmwareMenuItems = computed(() => [
    [
        {
            label: "Load local firmware",
            icon: "i-lucide-folder-open",
            disabled: !am32CanLoadLocalFirmware.value,
            onSelect: handleAm32LoadLocalFirmware,
        },
    ],
]);
</script>
