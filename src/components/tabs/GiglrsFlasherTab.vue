<template>
    <BaseTab tab-name="giglrs_flasher">
        <div class="content_wrapper">
            <div class="tab_title">GIGLRS Flasher</div>
            <FlasherElrsTab ref="elrsFlasher" />
        </div>

        <div class="content_toolbar toolbar_fixed_bottom">
            <UFieldGroup size="sm" orientation="horizontal" class="flex!">
                <UButton
                    :disabled="!elrsCanFlash"
                    :color="elrsCanFlash ? 'success' : 'neutral'"
                    :loading="elrsBusy && elrsActiveOperation === 'flash'"
                    @click="handleElrsFlashFirmware"
                >
                    {{ $t("firmwareFlasherFlashFirmware") }}
                </UButton>
                <UDropdownMenu v-slot="{ open }" :items="elrsFlashActionMenuItems" :content="{ align: 'end', side: 'top' }">
                    <UButton
                        :color="elrsCanFlash ? 'success' : 'neutral'"
                        :icon="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                        :aria-label="$t('firmwareFlasherFlashFirmwareOptions')"
                        square
                    />
                </UDropdownMenu>
            </UFieldGroup>
            <UFieldGroup size="sm" orientation="horizontal" class="flex!">
                <UButton
                    :disabled="!elrsCanLoadOnlineFirmware"
                    :loading="elrsBusy && elrsActiveOperation === 'load-online'"
                    @click="handleElrsLoadOnlineFirmware"
                >
                    {{ $t("firmwareFlasherButtonLoadOnline") }}
                </UButton>
            </UFieldGroup>
        </div>
    </BaseTab>
</template>

<script setup>
import { computed, ref } from "vue";
import BaseTab from "./BaseTab.vue";
import FlasherElrsTab from "./firmware-flasher/FlasherElrsTab.vue";

const elrsFlasher = ref(null);

function getElrsExposedValue(key, fallback = false) {
    const value = elrsFlasher.value?.[key];
    return value?.value ?? value ?? fallback;
}

const elrsCanFlash = computed(() => Boolean(getElrsExposedValue("canFlash")));
const elrsCanLoadOnlineFirmware = computed(() => Boolean(getElrsExposedValue("canLoadOnlineFirmware")));
const elrsBusy = computed(() => Boolean(getElrsExposedValue("busy")));
const elrsActiveOperation = computed(() => String(getElrsExposedValue("activeOperation", "")));
const elrsPassthroughActive = computed(() => Boolean(getElrsExposedValue("passthroughActive")));

function handleElrsFlashFirmware() {
    elrsFlasher.value?.flashReceiver?.();
}

function handleElrsLoadOnlineFirmware() {
    elrsFlasher.value?.loadOnlineFirmware?.();
}

function handleElrsStopPassthrough() {
    elrsFlasher.value?.stopPassthrough?.();
}

const elrsFlashActionMenuItems = computed(() => [
    [
        {
            label: "Flash Firmware",
            icon: "i-lucide-zap",
            disabled: !elrsCanFlash.value,
            onSelect: handleElrsFlashFirmware,
        },
        {
            label: "Close passthrough",
            icon: "i-lucide-unplug",
            disabled: !elrsPassthroughActive.value || elrsBusy.value,
            onSelect: handleElrsStopPassthrough,
        },
    ],
]);
</script>
