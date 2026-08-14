import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import { useTranslation } from "i18next-vue";
import { usePortsRules } from "./usePortsRules";
import { useSerialPortsStore } from "../../stores/serialPorts";

/** Sentinel for "no port", since a port identifier of 0 is a real port (UART1). */
export const NO_PORT = "_NONE_";

/** The USB VCP port, which must always keep MSP. */
const USB_VCP_IDENTIFIER = 20;

const BAUD_RATE_FIELDS = ["msp_baudrate", "gps_baudrate", "telemetry_baudrate", "blackbox_baudrate"];

/**
 * Everything SerialFunctionRow.vue does apart from render it. Split out so the option-list
 * construction and the eviction reporting are testable without standing up Nuxt UI's select,
 * which resolves at compile time and cannot be stubbed.
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

    // What the last change displaced. Mutual exclusion clears sibling slots, and here the cleared
    // value is on a screen the user is not looking at - so it has to be said out loud rather than
    // left for them to discover on the Ports tab.
    const evictions = ref([]);

    function displayName(name) {
        return functionRules.value.find((r) => r.name === name)?.displayName || name;
    }

    const options = computed(() => store.availableFor(props.serialFunction));
    const assignedPort = computed(() => options.value.find((o) => o.selected));
    const selectedValue = computed(() => assignedPort.value?.portId ?? NO_PORT);

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

    const currentPort = computed(() => assignedPort.value && store.portById(assignedPort.value.portId));
    const baudrate = computed(() => currentPort.value?.[props.baudField] ?? "");

    /**
     * Only *other* functions are worth warning about: this function leaving a port it is being
     * moved off, or being cleared, is the change the user just asked for and can see in the
     * selector.
     */
    function reportEvictions(evicted) {
        evictions.value = evicted.filter((e) => e.serialFunction !== props.serialFunction);
    }

    function selectPort(value) {
        if (value === NO_PORT) {
            reportEvictions(store.clear(props.serialFunction).evicted);
            return;
        }
        reportEvictions(store.assign(props.serialFunction, value).evicted);
    }

    function setBaudrate(value) {
        if (currentPort.value) {
            currentPort.value[props.baudField] = value;
        }
    }

    // MSP on the chosen port, the same control the Ports tab carries in its Configuration column.
    // Without it a contextual editor cannot express a shared port at all, and cannot undo an MSP
    // assignment that mutual exclusion turned off on the user's behalf.
    const msp = computed(() => Boolean(currentPort.value?.msp));

    // USB VCP is the port the app talks over; firmware refuses a config where it does not carry
    // MSP, so it is the one place this must not be switchable.
    const mspDisabled = computed(() => !currentPort.value || currentPort.value.identifier === USB_VCP_IDENTIFIER);

    const mspBaudItems = computed(() => rules.mspBaudRates.map((rate) => ({ value: rate, label: rate })));
    const mspBaudrate = computed(() => currentPort.value?.msp_baudrate ?? "");

    function setMsp(value) {
        if (currentPort.value && !mspDisabled.value) {
            currentPort.value.msp = value;
        }
    }

    function setMspBaudrate(value) {
        if (currentPort.value) {
            currentPort.value.msp_baudrate = value;
        }
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
    };
}
