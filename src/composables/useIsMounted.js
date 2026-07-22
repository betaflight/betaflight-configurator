import { onMounted, onUnmounted, ref } from "vue";

/**
 * Tracks whether the current component is mounted.
 * @returns {import("vue").Ref<boolean>} true between mount and unmount
 */
export function useIsMounted() {
    const isMounted = ref(false);

    onMounted(() => {
        isMounted.value = true;
    });

    onUnmounted(() => {
        isMounted.value = false;
    });

    return isMounted;
}
