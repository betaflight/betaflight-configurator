<template>
    <UModal :open="open" :title="title" :close="false" :dismissible="false">
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

<script setup lang="ts">
import { ref } from "vue";
import type { PropType } from "vue";
import { i18n } from "@/js/localization";
import SettingRow from "../elements/SettingRow.vue";

interface ProfileOption {
    label: string;
    value: number;
}

const props = defineProps({
    title: { type: String, default: "" },
    note: { type: String, default: "" },
    profileOptions: { type: Array as PropType<ProfileOption[]>, default: () => [] },
    rateOptions: { type: Array as PropType<ProfileOption[]>, default: () => [] },
    profileText: { type: String, default: () => i18n.getMessage("dialogCopyProfileText") },
    rateProfileText: { type: String, default: () => i18n.getMessage("dialogCopyRateProfileText") },
    confirmText: { type: String, default: () => i18n.getMessage("dialogCopyProfileConfirm") },
    cancelText: { type: String, default: () => i18n.getMessage("dialogCopyProfileClose") },
});

const emit = defineEmits(["confirm", "cancel"]);

const open = ref(false);
const selectedProfile = ref<number | undefined>(undefined);
const selectedRateProfile = ref<number | undefined>(undefined);

const show = () => {
    selectedProfile.value = props.profileOptions?.length ? props.profileOptions[0].value : undefined;
    selectedRateProfile.value = props.rateOptions?.length ? props.rateOptions[0].value : undefined;
    open.value = true;
};

const close = () => {
    open.value = false;
};

const confirm = () => {
    // null, not undefined, is the payload contract the consumers in useDialog.js see.
    emit("confirm", { profile: selectedProfile.value ?? null, rateProfile: selectedRateProfile.value ?? null });
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
