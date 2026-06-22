<template>
    <UModal
        :open="open"
        :title="title"
        :close="false"
        :dismissible="false"
        :ui="{ overlay: 'z-3000', content: 'z-3001' }"
    >
        <template #body>
            <div class="flex flex-col gap-4">
                <div v-if="note" v-html="note"></div>

                <SettingRow v-if="profileOptions && profileOptions.length" :label="profileText">
                    <USelect
                        v-model="selectedProfile"
                        :items="profileOptions"
                        class="min-w-40"
                        :ui="{ content: 'z-3002' }"
                    />
                </SettingRow>

                <SettingRow v-if="rateOptions && rateOptions.length" :label="rateProfileText">
                    <USelect
                        v-model="selectedRateProfile"
                        :items="rateOptions"
                        class="min-w-40"
                        :ui="{ content: 'z-3002' }"
                    />
                </SettingRow>
            </div>
        </template>
        <template #footer>
            <div class="flex gap-2 justify-end w-full">
                <UButton color="neutral" variant="soft" @click="cancel">{{ cancelText }}</UButton>
                <UButton @click="confirm">{{ confirmText }}</UButton>
            </div>
        </template>
    </UModal>
</template>

<script setup>
import { ref } from "vue";
import { i18n } from "@/js/localization";
import SettingRow from "../elements/SettingRow.vue";

const props = defineProps({
    title: { type: String, default: "" },
    note: { type: String, default: "" },
    profileOptions: { type: Array, default: () => [] },
    rateOptions: { type: Array, default: () => [] },
    profileText: { type: String, default: () => i18n.getMessage("dialogCopyProfileText") },
    rateProfileText: { type: String, default: () => i18n.getMessage("dialogCopyRateProfileText") },
    confirmText: { type: String, default: () => i18n.getMessage("dialogCopyProfileConfirm") },
    cancelText: { type: String, default: () => i18n.getMessage("dialogCopyProfileClose") },
});

const emit = defineEmits(["confirm", "cancel"]);

const open = ref(false);
const selectedProfile = ref(null);
const selectedRateProfile = ref(null);

const show = () => {
    selectedProfile.value = props.profileOptions?.length ? props.profileOptions[0].value : null;
    selectedRateProfile.value = props.rateOptions?.length ? props.rateOptions[0].value : null;
    open.value = true;
};

const close = () => {
    open.value = false;
};

const confirm = () => {
    emit("confirm", { profile: selectedProfile.value, rateProfile: selectedRateProfile.value });
    close();
};

const cancel = () => {
    emit("cancel");
    close();
};

defineExpose({
    show,
    close,
});
</script>
