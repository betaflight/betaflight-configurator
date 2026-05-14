import { onUnmounted } from "vue";
import GUI from "../js/gui";

/**
 * A composable for managing named timeouts via GUI's timeout registry.
 * All timeouts added through this composable are automatically removed
 * when the component is unmounted.
 *
 * Usage:
 *   const { addTimeout, removeTimeout } = useTimeout();
 *   addTimeout("my_delay", () => doSomething(), 5000);
 */
export function useTimeout() {
    const localTimeouts = [];

    function addTimeout(name, code, timeout) {
        GUI.timeout_add(name, code, timeout);
        if (!localTimeouts.includes(name)) {
            localTimeouts.push(name);
        }
    }

    function removeTimeout(name) {
        GUI.timeout_remove(name);
        const idx = localTimeouts.indexOf(name);
        if (idx !== -1) {
            localTimeouts.splice(idx, 1);
        }
    }

    function removeAllTimeouts() {
        localTimeouts.forEach((name) => GUI.timeout_remove(name));
        localTimeouts.length = 0;
    }

    onUnmounted(() => {
        removeAllTimeouts();
    });

    return {
        addTimeout,
        removeTimeout,
        removeAllTimeouts,
    };
}
