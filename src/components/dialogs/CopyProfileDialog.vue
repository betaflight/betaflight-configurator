<template>
    <dialog ref="dialogRef" class="dialogCopyProfile" @cancel.prevent="cancel">
        <h3 class="dialogCopyProfileTitle">{{ title }}</h3>
        <div class="content">
            <div v-if="note" class="dialogCopyProfile-note" v-html="note"></div>

            <div v-if="profileOptions && profileOptions.length" class="contentProfile">
                <div>
                    <span>{{ profileText }}</span>
                    <select v-model.number="selectedProfile">
                        <option v-for="opt in profileOptions" :key="opt.value" :value="opt.value">
                            {{ opt.label }}
                        </option>
                    </select>
                </div>
            </div>

            <div v-if="rateOptions && rateOptions.length" class="contentRateProfile">
                <div>
                    <span>{{ rateProfileText }}</span>
                    <select v-model.number="selectedRateProfile">
                        <option v-for="opt in rateOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                    </select>
                </div>
            </div>
        </div>
        <div class="buttons">
            <button type="button" class="dialogCopyProfile-confirmbtn regular-button" @click.prevent="confirm">
                {{ confirmText }}
            </button>
            <button type="button" class="dialogCopyProfile-cancelbtn regular-button" @click.prevent="cancel">
                {{ cancelText }}
            </button>
        </div>
    </dialog>
</template>

<script setup>
import { ref } from "vue";
import { i18n } from "@/js/localization";

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

const dialogRef = ref(null);
const selectedProfile = ref(null);
const selectedRateProfile = ref(null);

const show = () => {
    selectedProfile.value = props.profileOptions?.length ? props.profileOptions[0].value : null;
    selectedRateProfile.value = props.rateOptions?.length ? props.rateOptions[0].value : null;
    dialogRef.value?.showModal();
};

const close = () => {
    dialogRef.value?.close();
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
    dialog: dialogRef,
});
</script>

<style scoped>
.dialogCopyProfile {
    width: fit-content;
    max-width: 500px;
}

.dialogCopyProfile-note {
    margin-top: 10px;
}

.contentProfile,
.contentRateProfile {
    margin-top: 20px;
}

.contentProfile select,
.contentRateProfile select {
    margin-left: 8px;
}

.dialogCopyProfile-confirmbtn {
    margin: 0;
    margin-right: 12px;
}

.dialogCopyProfile-cancelbtn {
    margin: 0;
}
</style>
