<template>
    <div class="flex flex-col gap-2">
        <!-- Protocol picker, when this row edits a whole group rather than one function. -->
        <SettingRow v-if="hasGroup" :label="protocolLabel || $t('portsTelemetryOut')">
            <USelect
                :model-value="selectedFunction"
                :items="functionItems"
                :disabled="!loaded"
                size="xs"
                class="min-w-56"
                @update:model-value="selectFunction"
            />
        </SettingRow>

        <SettingRow v-if="!hasGroup || activeFunction" :label="label || $t('serialPortAssign')" :help="help">
            <USelect
                :model-value="selectedValue"
                :items="portItems"
                :disabled="!loaded"
                size="xs"
                class="min-w-56"
                @update:model-value="selectPort"
            />
        </SettingRow>

        <SettingRow v-if="hasBaudField && (!hasGroup || activeFunction)" :label="$t('serialPortBaudrate')">
            <USelect
                :model-value="baudrate"
                :items="baudItems"
                :disabled="!assignedPort"
                size="xs"
                class="min-w-28"
                @update:model-value="setBaudrate"
            />
        </SettingRow>

        <!-- MSP on the chosen port, matching the Ports tab's Configuration column. -->
        <SettingRow v-if="!hasGroup || activeFunction" :label="$t('portsFunction_MSP')" :help="$t('portsMSPHelp')">
            <USwitch :model-value="msp" :disabled="mspDisabled" size="xs" @update:model-value="setMsp" />
            <USelect
                :model-value="mspBaudrate"
                :items="mspBaudItems"
                :disabled="!assignedPort"
                size="xs"
                class="min-w-28"
                @update:model-value="setMspBaudrate"
            />
        </SettingRow>

        <!--
            A picker shows one assignment. If firmware has more than one of this row's functions on
            different ports, name the ones it cannot show rather than letting the user find them
            missing later.
        -->
        <UAlert
            v-for="hidden in hiddenAssignments"
            :key="`hidden-${hidden.serialFunction}`"
            color="neutral"
            variant="subtle"
            icon="i-lucide-info"
        >
            <template #description>
                <span
                    v-html="
                        $t('serialPortAlsoAssigned', {
                            serialFunction: displayName(hidden.serialFunction),
                            port: hidden.portName,
                        })
                    "
                ></span>
            </template>
        </UAlert>

        <UAlert
            v-for="eviction in evictions"
            :key="`${eviction.portId}-${eviction.serialFunction}`"
            color="warning"
            variant="subtle"
            icon="i-lucide-triangle-alert"
        >
            <template #description>
                <span
                    v-html="
                        $t('serialPortWillEvict', {
                            serialFunction: displayName(eviction.serialFunction),
                            port: eviction.portName,
                        })
                    "
                ></span>
            </template>
        </UAlert>
    </div>
</template>

<script setup>
import SettingRow from "../elements/SettingRow.vue";
import { useSerialFunctionRow } from "../../composables/ports/useSerialFunctionRow";

/**
 * The reusable inline serial-port editor. Every feature tab renders this same component against
 * the same store, so there is no per-tab adapter layer and no per-tab save flow to keep in sync.
 *
 * There is no save button here, and no write to shared state either: the edit is held locally and
 * applied by the host tab's own save, so it costs the same single reboot as that tab's settings
 * and leaves nothing behind if the user walks away.
 *
 * The prop is `serialFunction` rather than `function`, which is a reserved word and cannot be
 * destructured.
 */
const props = defineProps({
    /** The serial function this row edits, e.g. "GPS". Omit when using `group`. */
    serialFunction: {
        type: String,
        default: "",
    },
    /**
     * Edit a whole rule group instead of one function - the row then offers a protocol picker over
     * the group and edits whichever member is assigned. Used for telemetry, where a port carries
     * one of six protocols and picking the protocol and the port is one decision.
     */
    group: {
        type: String,
        default: "",
    },
    /**
     * An explicit list of functions to offer, for a tab that wants some of a group but not all of
     * it - VtxTab offers its four VTX/camera protocols and must not offer blackbox or the serial
     * rangefinder, which share the same peripherals slot. Behaves exactly like `group`, over just
     * these names. It takes precedence over `group`, which may be passed alongside it to document
     * the slot being edited.
     */
    functions: {
        type: Array,
        default: () => [],
    },
    /** Label for the protocol picker, when `group` or `functions` is set. */
    protocolLabel: {
        type: String,
        default: "",
    },
    /**
     * Which per-port baudrate belongs to this function, or null when it has none.
     * @values gps_baudrate, telemetry_baudrate, blackbox_baudrate, msp_baudrate, null
     */
    baudField: {
        type: String,
        default: null,
    },
    /** Row label; defaults to a generic "Serial port". */
    label: {
        type: String,
        default: "",
    },
    help: {
        type: String,
        default: "",
    },
});

const {
    loaded,
    hasGroup,
    hiddenAssignments,
    functionItems,
    activeFunction,
    selectedFunction,
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
} = useSerialFunctionRow(props);

// The host tab owns the Save button, so it needs to know there is something to save and how to
// apply it. Nothing reaches the shared store until it calls apply().
defineExpose({ hasPendingChange, apply, reset });
</script>
