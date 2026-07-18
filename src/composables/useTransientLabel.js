import { computed, onScopeDispose, ref, toValue } from "vue";

export function useTransientLabel(baseLabel) {
    const transientText = ref(null);
    let timer = null;

    const label = computed(() => (transientText.value !== null ? transientText.value : toValue(baseLabel)));

    function clear() {
        if (timer !== null) {
            clearTimeout(timer);
            timer = null;
        }
    }

    function flash(text, ms) {
        clear();
        transientText.value = text;
        timer = setTimeout(() => {
            timer = null;
            transientText.value = null;
        }, ms);
    }

    onScopeDispose(clear);

    return {
        label,
        flash,
    };
}
