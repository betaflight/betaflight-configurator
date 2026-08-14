import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import { useTranslation } from "i18next-vue";
import { usePortsRules } from "./usePortsRules";
import { useSerialPortsStore } from "../../stores/serialPorts";

/** Sentinel for "no port", since a port identifier of 0 is a real port (UART1). */
export const NO_PORT = "_NONE_";

const BAUD_RATE_FIELDS = ["msp_baudrate", "gps_baudrate", "telemetry_baudrate", "blackbox_baudrate"];

/** The USB VCP port - the app's own link, and not somewhere a feature's UART ever goes. */
const USB_VCP_IDENTIFIER = 20;

/**
 * Everything SerialFunctionRow.vue does apart from render it. Split out so the option-list
 * construction and the eviction preview are testable without standing up Nuxt UI's select, which
 * resolves at compile time and cannot be stubbed.
 *
 * **Nothing here touches the shared port state until the user saves.** The edit is held locally
 * and applied by apply(), which the host tab calls as part of its own save. Writing straight into
 * the store instead would mean an assignment made here appeared on the Ports tab having never been
 * saved, and would need undoing if the user simply walked away. Held locally it goes away with the
 * tab, because it was never anywhere else.
 *
 * Two shapes. Given `serialFunction`, the row edits that one function's port. Given `group`
 * instead, it also offers a protocol picker over every rule in that group and edits whichever of
 * them is assigned - telemetry is one slot per port carrying one of six protocols, so choosing the
 * protocol and choosing the port are the same decision.
 *
 * @param {{serialFunction?: string, group?: string, baudField?: string|null}} props
 */
export function useSerialFunctionRow(props) {
    const { t } = useTranslation();
    const store = useSerialPortsStore();
    const { loaded, functionRules } = storeToRefs(store);

    const rules = usePortsRules();
    const baudRatesByField = {
        msp_baudrate: rules.mspBaudRates,
        gps_baudrate: rules.gpsBaudRates,
        telemetry_baudrate: rules.telemetryBaudRates,
        blackbox_baudrate: rules.blackboxBaudRates,
    };

    // The pending edit. `undefined` means "not touched", which is what keeps an untouched field
    // following the store rather than pinning a stale value.
    const draftPortId = ref(undefined);
    const draftBaudrate = ref(undefined);
    const draftMsp = ref(undefined);
    const draftMspBaudrate = ref(undefined);
    const draftFunction = ref(undefined);

    function displayName(name) {
        return functionRules.value.find((r) => r.name === name)?.displayName || name;
    }

    // ------------------------------------------------------------ which function

    const groupRules = computed(() => (props.group ? rules.getRules(props.group) : []));
    const hasGroup = computed(() => groupRules.value.length > 0);

    /** Which of the group's functions the FC currently has on a port, ignoring the pending edit. */
    const savedFunction = computed(() => {
        if (!hasGroup.value) {
            return props.serialFunction ?? "";
        }
        return groupRules.value.find((r) => store.ports.some((p) => store.portUses(p, r.name)))?.name ?? "";
    });

    /** Which function this row is editing once saved. Empty means "none of them". */
    const activeFunction = computed(() => draftFunction.value ?? savedFunction.value);

    const functionItems = computed(() => [
        { value: "", label: t("portsTelemetryDisabled") },
        ...groupRules.value.map((r) => ({
            value: r.name,
            label: r.displayName,
            disabled: Boolean(rules.isRuleDisabled(r)),
        })),
    ]);

    // USB VCP is not offered. It is the app's own connection, never a place a feature's serial link
    // belongs, and firmware refuses a config where it stops carrying MSP. The Ports tab still shows
    // it, because that view is the complete picture; this one is a choice, and VCP is not a real
    // choice. It stays listed only if firmware already put this function there.
    const options = computed(() =>
        activeFunction.value
            ? store
                .availableFor(activeFunction.value)
                .filter((option) => option.portId !== USB_VCP_IDENTIFIER || option.selected)
            : [],
    );

    /** Where the active function sits on the FC right now, ignoring the pending edit. */
    const savedPortId = computed(() => options.value.find((o) => o.selected)?.portId ?? NO_PORT);

    /**
     * Where the function this row is replacing sits. Swapping telemetry protocol should keep the
     * UART - the user picked that port for their wiring, not for the protocol.
     */
    const previousPortId = computed(() => {
        if (!savedFunction.value || savedFunction.value === activeFunction.value) {
            return NO_PORT;
        }
        return store.ports.find((p) => store.portUses(p, savedFunction.value))?.identifier ?? NO_PORT;
    });

    /** Where the function will sit once saved. */
    const selectedValue = computed(
        () => draftPortId.value ?? (savedPortId.value !== NO_PORT ? savedPortId.value : previousPortId.value),
    );

    const assignedPort = computed(() =>
        selectedValue.value === NO_PORT ? undefined : options.value.find((o) => o.portId === selectedValue.value),
    );

    const portItems = computed(() => [
        { value: NO_PORT, label: t("serialPortNone") },
        ...options.value.map((option) => ({
            value: option.portId,
            label: option.occupiedBy
                ? t("serialPortOccupiedBy", { port: option.portName, serialFunction: displayName(option.occupiedBy) })
                : option.portName,
            disabled: option.disabled,
        })),
    ]);

    const hasBaudField = computed(() => BAUD_RATE_FIELDS.includes(props.baudField));

    const baudItems = computed(() =>
        (baudRatesByField[props.baudField] ?? []).map((rate) => ({ value: rate, label: rate })),
    );

    /** The store's port object behind the pending selection, read-only until apply(). */
    const targetPort = computed(() =>
        selectedValue.value === NO_PORT ? undefined : store.portById(selectedValue.value),
    );

    const baudrate = computed(() => draftBaudrate.value ?? targetPort.value?.[props.baudField] ?? "");
    const msp = computed(() => draftMsp.value ?? Boolean(targetPort.value?.msp));
    const mspDisabled = computed(() => !assignedPort.value);
    const mspBaudItems = computed(() => rules.mspBaudRates.map((rate) => ({ value: rate, label: rate })));
    const mspBaudrate = computed(() => draftMspBaudrate.value ?? targetPort.value?.msp_baudrate ?? "");

    /**
     * What saving would displace. Computed against the store without touching it, so this is a
     * genuine preview rather than a report of something already done.
     *
     * Only *other* functions are worth naming: this function leaving the port it is being moved off
     * is the change the user just asked for and can see in the selector.
     */
    const evictions = computed(() => {
        const fn = activeFunction.value;
        const portId = selectedValue.value;
        if (!fn || portId === NO_PORT || !hasPendingPortOrFunction.value) {
            return [];
        }
        return store.evictionsFor(fn, portId).filter((e) => e.serialFunction !== fn);
    });

    const portChanged = computed(() => draftPortId.value !== undefined && draftPortId.value !== savedPortId.value);
    const functionChanged = computed(
        () => draftFunction.value !== undefined && draftFunction.value !== savedFunction.value,
    );
    const hasPendingPortOrFunction = computed(() => portChanged.value || functionChanged.value);

    /** Whether there is anything here for a save to apply. */
    const hasPendingChange = computed(() => {
        if (hasPendingPortOrFunction.value) {
            return true;
        }
        const port = targetPort.value;
        return (
            (draftBaudrate.value !== undefined && draftBaudrate.value !== port?.[props.baudField]) ||
            (draftMsp.value !== undefined && draftMsp.value !== Boolean(port?.msp)) ||
            (draftMspBaudrate.value !== undefined && draftMspBaudrate.value !== port?.msp_baudrate)
        );
    });

    function selectFunction(value) {
        draftFunction.value = value;
        // The new protocol has its own port, baudrate and MSP setting.
        draftPortId.value = undefined;
        draftBaudrate.value = undefined;
        draftMsp.value = undefined;
        draftMspBaudrate.value = undefined;
    }

    function selectPort(value) {
        draftPortId.value = value;
        // Another port carries its own baudrate and MSP setting, so pending edits to those no
        // longer refer to anything.
        draftBaudrate.value = undefined;
        draftMsp.value = undefined;
        draftMspBaudrate.value = undefined;
    }

    function setBaudrate(value) {
        draftBaudrate.value = value;
    }

    function setMsp(value) {
        draftMsp.value = value;
    }

    function setMspBaudrate(value) {
        draftMspBaudrate.value = value;
    }

    /** Forget the pending edit without applying it. */
    function reset() {
        draftPortId.value = undefined;
        draftBaudrate.value = undefined;
        draftMsp.value = undefined;
        draftMspBaudrate.value = undefined;
        draftFunction.value = undefined;
    }

    /**
     * Push the pending edit into the shared store. The host tab's save calls this immediately
     * before writing; it is the only point at which this control changes anything.
     */
    function apply() {
        const fn = activeFunction.value;
        const portId = selectedValue.value;

        // A protocol swap frees the one it replaces, whichever port that was on.
        if (functionChanged.value && savedFunction.value) {
            store.clear(savedFunction.value);
        }

        if (hasPendingPortOrFunction.value && fn) {
            if (portId === NO_PORT) {
                store.clear(fn);
            } else {
                store.assign(fn, portId);
            }
        }

        const port = portId === NO_PORT ? undefined : store.portById(portId);
        if (port) {
            if (draftBaudrate.value !== undefined && props.baudField) {
                port[props.baudField] = draftBaudrate.value;
            }
            if (draftMsp.value !== undefined) {
                port.msp = draftMsp.value;
            }
            if (draftMspBaudrate.value !== undefined) {
                port.msp_baudrate = draftMspBaudrate.value;
            }
        }

        reset();
    }

    return {
        loaded,
        hasGroup,
        functionItems,
        activeFunction,
        selectFunction,
        portItems,
        selectedValue,
        assignedPort,
        hasBaudField,
        baudItems,
        baudrate,
        evictions,
        displayName,
        selectPort,
        setBaudrate,
        msp,
        mspDisabled,
        mspBaudItems,
        mspBaudrate,
        setMsp,
        setMspBaudrate,
        hasPendingChange,
        apply,
        reset,
    };
}
