import { ref, onMounted, onUnmounted } from "vue";

/**
 * A composable for handling polling intervals.
 * Automatically cleans up the interval when the component is unmounted.
 *
 * @param {Function} callback - The function to execute on each interval.
 * @param {number} intervalMs - The interval duration in milliseconds.
 * @param {object} options - Optional settings.
 * @param {boolean} [options.immediate=false] - If true, execute the callback immediately on start.
 * @param {boolean} [options.autoStart=true] - If true, start the polling automatically on mount.
 */
export function usePolling(callback, intervalMs, options = {}) {
    const { immediate = false, autoStart = true } = options;
    const isActive = ref(false);
    const isPaused = ref(false);
    let timerId = null;

    const execute = () => {
        if (!process.env.NODE_ENV || process.env.NODE_ENV !== "test") {
            try {
                callback();
            } catch (error) {
                console.error("[usePolling] Error during polling execution:", error);
            }
        } else {
            callback();
        }
    };

    const stop = () => {
        if (timerId) {
            clearInterval(timerId);
            timerId = null;
        }
        isActive.value = false;
        isPaused.value = false;
    };

    const start = () => {
        stop(); // Ensure no duplicates
        isActive.value = true;
        isPaused.value = false;

        if (immediate) {
            execute();
        }

        timerId = setInterval(() => {
            if (!isPaused.value) {
                execute();
            }
        }, intervalMs);
    };

    const pause = () => {
        if (isActive.value) {
            isPaused.value = true;
        }
    };

    const resume = () => {
        if (isActive.value && isPaused.value) {
            isPaused.value = false;
            // Optionally execute immediately on resume?
            // Legacy behavior doesn't specify, but standard Intervals just continue.
            // We'll stick to simple standard behavior.
        }
    };

    onMounted(() => {
        if (autoStart) {
            start();
        }
    });

    onUnmounted(() => {
        stop();
    });

    return {
        isActive,
        isPaused,
        start,
        stop,
        pause,
        resume,
    };
}
