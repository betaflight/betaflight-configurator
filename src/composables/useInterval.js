import { onUnmounted } from "vue";
import GUI from "../js/gui";

/**
 * A composable for managing named intervals via GUI's interval registry.
 * All intervals added through this composable are automatically removed
 * when the component is unmounted.
 *
 * Usage:
 *   const { addInterval, removeInterval } = useInterval();
 *   addInterval("my_poll", () => fetchData(), 1000, true);
 */
export function useInterval() {
    const localIntervals = [];

    function addInterval(name, code, interval, first = false) {
        GUI.interval_add(name, code, interval, first);
        if (!localIntervals.includes(name)) {
            localIntervals.push(name);
        }
    }

    function removeInterval(name) {
        GUI.interval_remove(name);
        const idx = localIntervals.indexOf(name);
        if (idx !== -1) {
            localIntervals.splice(idx, 1);
        }
    }

    function removeAllIntervals() {
        localIntervals.forEach((name) => GUI.interval_remove(name));
        localIntervals.length = 0;
    }

    onUnmounted(() => {
        removeAllIntervals();
    });

    return {
        addInterval,
        removeInterval,
        removeAllIntervals,
    };
}
