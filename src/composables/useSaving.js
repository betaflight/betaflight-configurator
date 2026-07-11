import { ref } from "vue";

export function useSaving() {
    const isSaving = ref(false);

    async function runSave(fn, { onError } = {}) {
        if (isSaving.value) {
            return;
        }
        isSaving.value = true;
        try {
            await fn();
        } catch (e) {
            if (onError) {
                onError(e);
            } else {
                console.error(e);
            }
        } finally {
            isSaving.value = false;
        }
    }

    return {
        isSaving,
        runSave,
    };
}
