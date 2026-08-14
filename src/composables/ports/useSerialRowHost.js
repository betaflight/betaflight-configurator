import { computed } from "vue";
import { useSerialPortsStore } from "../../stores/serialPorts";

/**
 * What a feature tab has to do to host a SerialFunctionRow.
 *
 * Six tabs put one of these rows next to their own settings, and every one of them needs the same
 * three things: the row's pending edit ORed into the tab's dirty state, the edit pushed into the
 * shared store as part of the tab's save, and the store refreshed on mount. Written out per tab it
 * is four lines of code under six lines of comment, six times over - and the two things that are
 * easy to get wrong are invisible until a user loses an edit.
 *
 * Those two things:
 *
 * - **Ask the row, not the store.** `store.dirty` also goes true for an unsaved edit made on the
 *   Ports tab, which this tab must neither adopt nor reboot for.
 * - **Capture pending before applying.** `apply()` clears the row's pending flag, so a save that
 *   reads it afterwards decides it has nothing to write. The same reason the flag is ORed into
 *   dirty rather than folded into a `useDirtyState` serializer: the row goes clean partway through
 *   the save, which would leave a snapshot baseline permanently out of step.
 *
 * Where in the save sequence the write belongs is the tab's business, not this composable's -
 * SensorsTab writes first so a firmware rejection aborts before anything else is written, VtxTab
 * writes after its VTX table and then reboots early, ReceiverTab lets a pending serial edit decide
 * the reboot path for the whole tab. So `applyRows()` and `writeConfig()` stay separate, and
 * `saveRows()` is the shorthand for the tabs that just want them back to back.
 *
 * @param {import("vue").Ref[]} rowRefs template refs on the tab's SerialFunctionRow components
 */
export function useSerialRowHost(rowRefs) {
    const store = useSerialPortsStore();

    const rows = () => rowRefs.map((r) => r.value).filter(Boolean);

    /** Whether any hosted row has an edit a save would push into the store. */
    const pending = computed(() => rows().some((row) => row.hasPendingChange));

    /**
     * Push every row's edit into the shared store - the point at which these controls first change
     * anything outside the tab.
     *
     * @returns {boolean} whether there was anything to apply, read before applying clears it
     */
    function applyRows() {
        const hadPending = pending.value;
        for (const row of rows()) {
            row.apply();
        }
        return hadPending;
    }

    /**
     * Apply, then write the port array and the feature bits it implies - skipping the write
     * entirely when no row was touched, so an untouched tab costs no serial write.
     *
     * Throws if the FC rejects the write, which abandons the host tab's save.
     *
     * @returns {Promise<boolean>} whether anything was written
     */
    async function saveRows() {
        if (!applyRows()) {
            return false;
        }
        await store.writeConfig();
        return true;
    }

    /** Drop every pending edit, for a tab whose Refresh means "show me what the FC has". */
    function resetRows() {
        for (const row of rows()) {
            row.reset();
        }
    }

    /**
     * Refetch on mount. The store is shared across tabs, so this refetches when it is clean and
     * skips when it holds unsaved edits made on another tab - pass `{ force: true }` from an
     * explicit Refresh, which means the user asked for those edits to go. It resolves even on
     * failure, setting the store's loadFailed.
     */
    const loadPorts = (options) => store.loadConfig(options);

    return {
        // The store itself, for a host that also reads it - MotorsTab keeps its ESC_SENSOR row
        // visible while any port carries the function, whatever the protocol.
        serialPortsStore: store,
        serialRowsPending: pending,
        applySerialRows: applyRows,
        resetSerialRows: resetRows,
        saveSerialRows: saveRows,
        loadSerialPorts: loadPorts,
    };
}
