<template>
    <dialog class="dialogCopyProfile" open>
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
    <div class="dialog-backdrop"></div>
</template>

<script setup>
import { ref, onMounted } from "vue";

const props = defineProps({
    title: { type: String, default: "" },
    note: { type: String, default: "" },
    profileOptions: { type: Array, default: () => [] },
    rateOptions: { type: Array, default: () => [] },
    profileText: { type: String, default: "Copy profile to:" },
    rateProfileText: { type: String, default: "Copy rate profile to:" },
    confirmText: { type: String, default: "OK" },
    cancelText: { type: String, default: "Cancel" },
});

const emit = defineEmits(["confirm", "cancel"]);

const selectedProfile = ref(null);
const selectedRateProfile = ref(null);

onMounted(() => {
    selectedProfile.value = props.profileOptions?.length ? props.profileOptions[0].value : null;
    selectedRateProfile.value = props.rateOptions?.length ? props.rateOptions[0].value : null;
});

const confirm = () => {
    emit("confirm", { profile: selectedProfile.value, rateProfile: selectedRateProfile.value });
};

const cancel = () => {
    emit("cancel");
};
</script>

<style scoped>
.dialog-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.5);
    z-index: 999;
}

.dialogCopyProfile {
    display: block;
    z-index: 1000;
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    margin: 0;
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
