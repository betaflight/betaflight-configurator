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
 * @param {{serialFunction: string, baudField?: string|null}} props
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

    function displayName(name) {
        return functionRules.value.find((r) => r.name === name)?.displayName || name;
    }

    // USB VCP is not offered. It is the app's own connection, never a place a feature's serial link
    // belongs, and firmware refuses a config where it stops carrying MSP. The Ports tab still shows
    // it, because that view is the complete picture; this one is a choice, and VCP is not a real
    // choice. It stays listed only if firmware already put this function there.
    const options = computed(() =>
        store
            .availableFor(props.serialFunction)
            .filter((option) => option.portId !== USB_VCP_IDENTIFIER || option.selected),
    );

    /** Where the function sits on the FC right now, ignoring the pending edit. */
    const savedPortId = computed(() => options.value.find((o) => o.selected)?.portId ?? NO_PORT);

    /** Where the function will sit once saved. */
    const selectedValue = computed(() => draftPortId.value ?? savedPortId.value);

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
        if (draftPortId.value === undefined || draftPortId.value === NO_PORT) {
            return [];
        }
        return store
            .evictionsFor(props.serialFunction, draftPortId.value)
            .filter((e) => e.serialFunction !== props.serialFunction);
    });

    const portChanged = computed(() => draftPortId.value !== undefined && draftPortId.value !== savedPortId.value);

    /** Whether there is anything here for a save to apply. */
    const hasPendingChange = computed(() => {
        if (portChanged.value) {
            return true;
        }
        const port = targetPort.value;
        return (
            (draftBaudrate.value !== undefined && draftBaudrate.value !== port?.[props.baudField]) ||
            (draftMsp.value !== undefined && draftMsp.value !== Boolean(port?.msp)) ||
            (draftMspBaudrate.value !== undefined && draftMspBaudrate.value !== port?.msp_baudrate)
        );
    });

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
    }

    /**
     * Push the pending edit into the shared store. The host tab's save calls this immediately
     * before writing; it is the only point at which this control changes anything.
     */
    function apply() {
        if (draftPortId.value !== undefined) {
            if (draftPortId.value === NO_PORT) {
                store.clear(props.serialFunction);
            } else {
                store.assign(props.serialFunction, draftPortId.value);
            }
        }

        const port = targetPort.value;
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
