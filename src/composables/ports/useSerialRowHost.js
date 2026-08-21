import { computed, ref } from "vue";
import { useSerialPortsStore } from "../../stores/serialPorts";
import { usePortsReadOnly } from "./usePortsReadOnly";

/**
 * What a feature tab has to do to host a SerialFunctionRow.
 *
 * Six tabs put one of these rows next to their own settings, and every one of them needs the same
 * three things: the row's pending edit ORed into the tab's dirty state, the edit pushed into the
 * shared store as part of the tab's save, and the store refreshed on mount. Written out per tab it
 * is four lines of code under six lines of comment, six times over - and the things that are easy
 * to get wrong are invisible until a user loses an edit.
 *
 * Those things:
 *
 * - **Ask the row, not the store.** `store.dirty` also goes true for an unsaved edit made on the
 *   Ports tab, which this tab must neither adopt nor reboot for.
 * - **Capture pending before applying.** `apply()` clears the row's pending flag, so a save that
 *   reads it afterwards decides it has nothing to write. The same reason the flag is ORed into
 *   dirty rather than folded into a `useDirtyState` serializer: the row goes clean partway through
 *   the save, which would leave a snapshot baseline permanently out of step.
 * - **A rejected write leaves the edit behind.** Once applied, the edit lives in the store and the
 *   row is clean - so if the FC then refuses the write, a host that only asked the rows would show
 *   a clean tab with a disabled Save over an edit that never reached the board. `unwritten` is this
 *   host's claim on that applied-but-unwritten edit: it keeps Save reachable and makes the next
 *   Save retry the write, without adopting an unrelated Ports-tab edit the way `store.dirty` would.
 *
 * Where in the save sequence the write belongs is the tab's business, not this composable's -
 * SensorsTab writes first so a firmware rejection aborts before anything else is written, VtxTab
 * writes after its VTX table and then reboots early, ReceiverTab lets a pending serial edit decide
 * the reboot path for the whole tab. So `applyRows()` and `writeRows()` stay separate, and
 * `saveRows()` is the shorthand for the tabs that just want them back to back.
 *
 * @param {import("vue").Ref[]} rowRefs template refs on the tab's SerialFunctionRow components
 */
export function useSerialRowHost(rowRefs) {
    const store = useSerialPortsStore();
    const readOnly = usePortsReadOnly();

    /**
     * Whether these rows are the way to assign a port on this firmware.
     *
     * They write the port function mask, which firmware retired as a write path in API 1.49 - from
     * there each feature owns its port on its own parameter group and useFeaturePort writes it over
     * the CLI. A host with a box or a heading of its own reads this so the box goes too; the row
     * itself will not render either way.
     */
    const available = computed(() => !readOnly.value);

    const rows = () => rowRefs.map((r) => r.value).filter(Boolean);

    /** An edit this host applied into the store, whose write has not landed yet. */
    const unwritten = ref(false);

    const rowsTouched = () => rows().some((row) => row.hasPendingChange);

    /** Whether this tab has serial work a save would carry - drafted, or applied but unwritten. */
    const pending = computed(() => unwritten.value || rowsTouched());

    /**
     * Push every row's edit into the shared store - the point at which these controls first change
     * anything outside the tab.
     *
     * @returns {boolean} whether there was anything to apply, read before applying clears it
     */
    function applyRows() {
        const hadPending = rowsTouched();
        for (const row of rows()) {
            row.apply();
        }
        if (hadPending) {
            unwritten.value = true;
        }
        return hadPending;
    }

    /**
     * Write the port array and the feature bits it implies, if this host has anything to write.
     *
     * Throws if the FC rejects it, which abandons the host tab's save - and leaves `unwritten` set,
     * so the tab stays dirty and the next Save tries again.
     *
     * @returns {Promise<boolean>} whether anything was written
     */
    async function writeRows() {
        if (!unwritten.value) {
            return false;
        }
        await store.writeConfig();
        unwritten.value = false;
        return true;
    }

    /**
     * Apply, then write - skipping the write entirely when no row was touched and nothing is owed
     * from an earlier failure, so an untouched tab costs no serial write.
     *
     * @returns {Promise<boolean>} whether anything was written
     */
    async function saveRows() {
        applyRows();
        return writeRows();
    }

    /**
     * Drop every pending edit, for a tab whose Refresh means "show me what the FC has". The
     * applied-but-unwritten claim goes too: the caller follows this with a forced reload, which is
     * what actually takes the edit back out of the store.
     */
    function resetRows() {
        for (const row of rows()) {
            row.reset();
        }
        unwritten.value = false;
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
        serialRowsAvailable: available,
        serialRowsPending: pending,
        applySerialRows: applyRows,
        writeSerialRows: writeRows,
        resetSerialRows: resetRows,
        saveSerialRows: saveRows,
        loadSerialPorts: loadPorts,
    };
}
