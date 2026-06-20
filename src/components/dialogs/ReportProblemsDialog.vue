<template>
    <UModal
        :open="open"
        :title="$t('warningTitle')"
        :close="false"
        :dismissible="false"
        :ui="{ overlay: 'z-3000', content: 'z-3001' }"
    >
        <template #body>
            <div class="dialogReportProblems-header" v-html="$t('reportProblemsDialogHeader')"></div>
            <ul class="dialogReportProblems-list">
                <li
                    v-for="(problem, index) in problems"
                    :key="index"
                    class="dialogReportProblems-listItem"
                    v-html="problem.description"
                ></li>
            </ul>
            <div class="dialogReportProblems-footer" v-html="$t('reportProblemsDialogFooter')"></div>
        </template>
        <template #footer>
            <div class="flex justify-end w-full">
                <UButton @click="handleClose">{{ $t("close") }}</UButton>
            </div>
        </template>
    </UModal>
</template>

<script setup>
import { ref } from "vue";

defineProps({
    problems: {
        type: Array,
        default: () => [],
    },
});

const emit = defineEmits(["close"]);

const open = ref(false);

const show = () => {
    open.value = true;
};

const close = () => {
    open.value = false;
};

const handleClose = () => {
    close();
    emit("close");
};

defineExpose({
    show,
    close,
});
</script>

<style scoped>
.dialogReportProblems-header {
    margin-bottom: 5px;
}

.dialogReportProblems-list {
    margin: 10px 0;
    padding-left: 0;
    list-style: none;
}

.dialogReportProblems-listItem {
    list-style: circle;
    margin-left: 20px;
    margin-bottom: 5px;
}

.dialogReportProblems-footer {
    margin-top: 10px;
}
</style>
