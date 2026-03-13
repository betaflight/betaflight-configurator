<template>
    <dialog ref="dialogRef" class="dialogReportProblems" @cancel.prevent>
        <h3>{{ $t("warningTitle") }}</h3>
        <div class="content">
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
        </div>
        <div class="buttons">
            <button type="button" class="regular-button" @click.prevent="handleClose">
                {{ $t("close") }}
            </button>
        </div>
    </dialog>
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

const dialogRef = ref(null);

const show = () => {
    dialogRef.value?.showModal();
};

const close = () => {
    dialogRef.value?.close();
};

const handleClose = () => {
    close();
    emit("close");
};

defineExpose({
    show,
    close,
    dialog: dialogRef,
});
</script>

<style scoped>
.dialogReportProblems {
    display: block;
    z-index: 1000;
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    margin: 0;
    border: 1px solid var(--surface-500);
    border-radius: 8px;
    padding: 15px 20px;
    background: var(--surface-100);
    min-width: 300px;
    max-width: 600px;
}

.dialogReportProblems::backdrop {
    background: rgba(0, 0, 0, 0.5);
    z-index: 999;
}

.dialogReportProblems:not([open]) {
    display: none;
}

.dialogReportProblems h3 {
    margin: 0 0 10px 0;
    color: var(--text);
}

.dialogReportProblems .content {
    margin-bottom: 15px;
}

.dialogReportProblems-header {
    margin-top: 10px;
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
    margin-bottom: 10px;
}

.dialogReportProblems .buttons {
    text-align: right;
}
</style>
