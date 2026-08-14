import { defineStore } from "pinia";
import { computed, ref, toRaw, watch } from "vue";
import CONFIGURATOR from "../js/data_storage";
import FC from "../js/fc";
import MSP from "../js/msp";
import MSPCodes from "../js/msp/MSPCodes";
import { mspHelper, isMspRejected } from "../js/msp/MSPHelper";
import { gui_log } from "../js/gui_log";
import { i18n } from "../js/localization";
import { tracking } from "../js/Analytics";
import { useDirtyState } from "../composables/useDirtyState";
import { usePortsRules } from "../composables/ports/usePortsRules";
import { useReboot } from "../composables/useReboot";

const PORT_NAMES = {
    0: "UART1",
    1: "UART2",
    2: "UART3",
    3: "UART4",
    4: "UART5",
    5: "UART6",
    6: "UART7",
    7: "UART8",
    8: "UART9",
    9: "UART10",
    20: "USB VCP",
    30: "SOFTSERIAL1",
    31: "SOFTSERIAL2",
    40: "LPUART1",
    50: "UART0",
    51: "UART1",
    52: "UART2",
    53: "UART3",
    54: "UART4",
    55: "UART5",
    56: "UART6",
    57: "UART7",
    58: "UART8",
    59: "UART9",
    60: "UART10",
    61: "UART11",
    62: "UART12",
    63: "UART13",
    64: "UART14",
    65: "UART15",
    70: "PIOUART0",
    71: "PIOUART1",
    72: "PIOUART2",
    73: "PIOUART3",
    74: "PIOUART4",
    75: "PIOUART5",
    76: "PIOUART6",
    77: "PIOUART7",
    78: "PIOUART8",
    79: "PIOUART9",
};

// The USB VCP port. Firmware refuses any config where it does not carry MSP, so its MSP
// assignment is not the user's to change.
const USB_VCP_IDENTIFIER = 20;

// A port holds one function per group, not one per function (see usePortsRules): the group a
// function belongs to determines which single field on the port it occupies. MSP and RX_SERIAL
// are booleans rather than slots.
const SLOT_FIELD_BY_GROUP = {
    telemetry: "telemetry",
    sensors: "sensor",
    peripherals: "peripheral",
};

/**
 * The single source of truth for serial port assignment.
 *
 * A Pinia store rather than a composable because it must outlive any one tab: only one tab is
 * mounted at a time, and an edit made on one tab has to survive the switch to the next so that
 * a whole configuration session still costs one reboot. It is a module singleton, so it is also
 * reset on disconnect - otherwise the next board would inherit the previous board's ports, and a
 * board with fewer UARTs would be shown, and written, a port array it cannot represent.
 */
export const useSerialPortsStore = defineStore("serialPorts", () => {
    /** Every port the FC reported, complete. A partial array is never safe to save (see save). */
    const ports = ref([]);
    /** Has loadConfig() completed for the current connection? Gates every consumer. */
    const loaded = ref(false);
    /** Is a load in flight right now? */
    const isLoading = ref(false);
    /** Did the last load fail? Lets a consumer show an error instead of an endless skeleton. */
    const loadFailed = ref(false);

    const analyticsChanges = ref({});

    const { dirty, markClean, takeSnapshot } = useDirtyState(() => JSON.stringify(ports.value));

    // usePortsRules is a pure factory over FC.CONFIG (api version, build options), so it is
    // re-derived rather than captured: at store construction no board is connected yet and the
    // rule set would be the one for API 0.0.0.
    const rules = computed(() => usePortsRules());
    const functionRules = computed(() => rules.value.functionRules);

    const findRule = (name) => functionRules.value.find((r) => r.name === name);
    const isMspSharable = (rule) => rule?.sharableWith?.includes("msp") === true;

    function portName(identifier) {
        return PORT_NAMES[identifier] || `UART (${identifier})`;
    }

    function portById(identifier) {
        return ports.value.find((p) => p.identifier === identifier);
    }

    /** Which field on a port object carries `serialFunction`, or null for the boolean functions. */
    function slotFieldFor(serialFunction) {
        const rule = findRule(serialFunction);
        if (!rule) {
            return null;
        }
        for (const [group, field] of Object.entries(SLOT_FIELD_BY_GROUP)) {
            if (rule.groups.includes(group)) {
                return field;
            }
        }
        return null;
    }

    function portUses(port, serialFunction) {
        if (serialFunction === "MSP") {
            return port.msp;
        }
        if (serialFunction === "RX_SERIAL") {
            return port.rxSerial;
        }
        const field = slotFieldFor(serialFunction);
        return Boolean(field) && port[field] === serialFunction;
    }

    /** Every port currently carrying `serialFunction`. */
    function portsUsing(serialFunction) {
        return ports.value.filter((p) => portUses(p, serialFunction));
    }

    // ---------------------------------------------------------------- loading

    function transformPortData(fcPort) {
        const getRules = rules.value.getRules;

        const msp = fcPort.functions.includes("MSP");
        const rxSerial = fcPort.functions.includes("RX_SERIAL");
        const telemetry = fcPort.functions.find((f) => getRules("telemetry").some((r) => r.name === f)) || "";
        const sensor = fcPort.functions.find((f) => getRules("sensors").some((r) => r.name === f)) || "";
        const peripheral = fcPort.functions.find((f) => getRules("peripherals").some((r) => r.name === f)) || "";

        // One slot per group means a decoded function no slot claimed - a second peripheral, or a
        // named function with no rule on this API version - would be dropped on save. Park it and
        // re-emit it verbatim instead.
        const claimed = [msp && "MSP", rxSerial && "RX_SERIAL", telemetry, sensor, peripheral].filter(Boolean);

        return {
            identifier: fcPort.identifier,
            // Raw mask as received; MSPHelper ORs the bits it cannot name back in on write.
            functionMask: fcPort.functionMask || 0,
            reservedFunctions: fcPort.functions.filter((f) => !claimed.includes(f)),
            msp_baudrate: fcPort.msp_baudrate,
            telemetry_baudrate: fcPort.telemetry_baudrate,
            gps_baudrate: fcPort.gps_baudrate === "AUTO" ? "AUTO" : fcPort.gps_baudrate || "AUTO",
            blackbox_baudrate: fcPort.blackbox_baudrate === "AUTO" ? "AUTO" : fcPort.blackbox_baudrate || "AUTO",
            msp,
            rxSerial,
            telemetry,
            sensor,
            peripheral,
        };
    }

    /**
     * True when a port carries something this build preserves but will not edit: a bit it cannot
     * name, or a named function with no slot on this API version.
     */
    function hasReservedFunctions(port) {
        return port.reservedFunctions?.length > 0 || mspHelper.serialPortUnknownFunctionMask(port.functionMask) !== 0;
    }

    /**
     * Read the serial config from the FC. Called once per connection rather than once per tab
     * mount, so switching between tabs that host a serial control costs no MSP round trip.
     *
     * Pending edits are never clobbered: a reload of a dirty store is skipped unless forced,
     * because the store is the only place an unsaved cross-tab edit lives.
     *
     * @param {{force?: boolean}} [options]
     */
    async function loadConfig({ force = false } = {}) {
        if (!force && dirty.value) {
            return;
        }

        isLoading.value = true;
        loadFailed.value = false;
        try {
            // Error-aware, so a board that never answers rejects instead of leaving every
            // consumer on a skeleton for ever.
            await MSP.promise(MSPCodes.MSP2_COMMON_SERIAL_CONFIG);
            ports.value = FC.SERIAL_CONFIG.ports.map(transformPortData);
            markClean();
            loaded.value = true;
        } catch (error) {
            console.error("Failed to load serial config:", error);
            loadFailed.value = true;
        } finally {
            isLoading.value = false;
        }
    }

    // ---------------------------------------------------------------- queries

    /**
     * What assigning `serialFunction` to `portId` would displace, without displacing it.
     *
     * Assignment is never silent: mutual exclusion clears sibling slots, and on a contextual
     * editor the cleared value is on a screen the user is not looking at.
     *
     * @returns {{portId: number, portName: string, serialFunction: string}[]}
     */
    function evictionsFor(serialFunction, portId) {
        const target = portById(portId);
        const evicted = [];
        if (!target || portUses(target, serialFunction)) {
            return evicted;
        }

        const rule = findRule(serialFunction);
        const record = (port, displaced) =>
            evicted.push({ portId: port.identifier, portName: portName(port.identifier), serialFunction: displaced });

        // A single-instance function moves rather than duplicates, so it leaves its old port.
        if (rule?.maxPorts === 1) {
            for (const other of portsUsing(serialFunction)) {
                record(other, serialFunction);
            }
        }

        const field = slotFieldFor(serialFunction);
        if (field && target[field]) {
            record(target, target[field]);
        }

        // Telemetry and peripherals are mutually exclusive on one port, and a function that
        // cannot share with MSP turns MSP off.
        if (field === "telemetry") {
            if (target.peripheral) {
                record(target, target.peripheral);
            }
            if (target.msp && !isMspSharable(rule)) {
                record(target, "MSP");
            }
        } else if (field === "peripheral") {
            if (target.telemetry) {
                record(target, target.telemetry);
            }
            if (target.msp && !serialFunction.includes("MSP") && !isMspSharable(rule)) {
                record(target, "MSP");
            }
        }

        return evicted;
    }

    /**
     * Whether `serialFunction` can take another port at all. A single-instance function always
     * can (it moves); a multi-port one - only MSP today - is capped at the firmware's limit.
     */
    function isAtPortLimit(serialFunction) {
        const rule = findRule(serialFunction);
        if (!rule?.maxPorts || rule.maxPorts === 1) {
            return false;
        }
        return portsUsing(serialFunction).length >= rule.maxPorts;
    }

    /**
     * Every port as a choice for `serialFunction`, annotated with what it currently carries and
     * what picking it would displace.
     */
    function availableFor(serialFunction) {
        const rule = findRule(serialFunction);
        const ruleDisabled = Boolean(rule && rules.value.isRuleDisabled(rule));
        const atLimit = isAtPortLimit(serialFunction);
        const field = slotFieldFor(serialFunction);

        return ports.value.map((port) => {
            const selected = portUses(port, serialFunction);
            const occupiedBy = field ? port[field] || "" : "";
            let disabledReason = null;

            if (ruleDisabled) {
                disabledReason = "unsupported";
            } else if (!selected && atLimit) {
                disabledReason = "maxPorts";
            } else if (!selected && serialFunction === "MSP" && port.identifier === USB_VCP_IDENTIFIER) {
                disabledReason = "required";
            }

            return {
                portId: port.identifier,
                portName: portName(port.identifier),
                selected,
                occupiedBy,
                evicts: disabledReason ? [] : evictionsFor(serialFunction, port.identifier),
                disabled: disabledReason !== null,
                disabledReason,
            };
        });
    }

    // ---------------------------------------------------------------- mutation

    function applyAnalytics(serialFunction) {
        const rule = findRule(serialFunction);
        const field = slotFieldFor(serialFunction);

        if (field === "telemetry" && rule) {
            analyticsChanges.value["Telemetry"] = rule.displayName;
            delete analyticsChanges.value["VtxControl"];
            delete analyticsChanges.value["MspControl"];
        } else if (field === "peripheral") {
            if (serialFunction.includes("MSP")) {
                analyticsChanges.value["MspControl"] = serialFunction;
            } else {
                delete analyticsChanges.value["MspControl"];
            }
            if (serialFunction === "TBS_SMARTAUDIO" || serialFunction === "IRC_TRAMP") {
                analyticsChanges.value["VtxControl"] = serialFunction;
            }
            delete analyticsChanges.value["Telemetry"];
        }
    }

    /**
     * Put `serialFunction` on `portId`, applying the group and exclusion rules, and report what
     * it displaced. Callers are required to surface the evictions - that is the whole point of
     * returning them rather than clearing silently.
     *
     * @returns {{assigned: boolean, evicted: object[], blockedBy: string|null}}
     */
    function assign(serialFunction, portId) {
        const target = portById(portId);
        if (!target) {
            return { assigned: false, evicted: [], blockedBy: "unknownPort" };
        }
        if (portUses(target, serialFunction)) {
            return { assigned: true, evicted: [], blockedBy: null };
        }

        const rule = findRule(serialFunction);
        if (rule && rules.value.isRuleDisabled(rule)) {
            return { assigned: false, evicted: [], blockedBy: "unsupported" };
        }
        // maxPorts was dead data until now. Master rejects a serial config that exceeds it and
        // reports the rejection as success on every released app, so cap it here.
        if (isAtPortLimit(serialFunction)) {
            return { assigned: false, evicted: [], blockedBy: "maxPorts" };
        }

        const evicted = evictionsFor(serialFunction, portId);

        if (serialFunction === "MSP") {
            target.msp = true;
        } else if (serialFunction === "RX_SERIAL") {
            for (const other of portsUsing("RX_SERIAL")) {
                other.rxSerial = false;
            }
            target.rxSerial = true;
        } else {
            const field = slotFieldFor(serialFunction);
            if (!field) {
                return { assigned: false, evicted: [], blockedBy: "unknownFunction" };
            }

            if (rule?.maxPorts === 1) {
                for (const other of portsUsing(serialFunction)) {
                    other[field] = "";
                }
            }
            target[field] = serialFunction;

            if (field === "telemetry") {
                target.peripheral = "";
                if (!isMspSharable(rule)) {
                    target.msp = false;
                }
            } else if (field === "peripheral") {
                target.telemetry = "";
                // MSP-based peripherals (VTX_MSP) need MSP on the same port.
                if (serialFunction.includes("MSP")) {
                    target.msp = true;
                } else if (!isMspSharable(rule)) {
                    target.msp = false;
                }
            }
        }

        applyAnalytics(serialFunction);
        return { assigned: true, evicted, blockedBy: null };
    }

    /**
     * Remove `serialFunction` from wherever it is, or from one port when `portId` is given.
     * @returns {{evicted: object[]}} what was removed, in the same shape assign() reports
     */
    function clear(serialFunction, portId = undefined) {
        const evicted = [];
        const targets =
            portId === undefined
                ? portsUsing(serialFunction)
                : portsUsing(serialFunction).filter((p) => p.identifier === portId);

        for (const port of targets) {
            if (serialFunction === "MSP") {
                if (port.identifier === USB_VCP_IDENTIFIER) {
                    continue; // firmware refuses a config where USB VCP has no MSP
                }
                port.msp = false;
            } else if (serialFunction === "RX_SERIAL") {
                port.rxSerial = false;
            } else {
                port[slotFieldFor(serialFunction)] = "";
            }
            evicted.push({
                portId: port.identifier,
                portName: portName(port.identifier),
                serialFunction,
            });
        }
        return { evicted };
    }

    // ---------------------------------------------------------------- saving

    function enabledFeaturesFromPorts(portsList) {
        const flags = { rxSerial: false, telemetry: false, blackbox: false, esc: false, gps: false };

        for (const port of portsList) {
            const func = port.functions;
            if (func.includes("RX_SERIAL")) {
                flags.rxSerial = true;
            }
            if (func.some((e) => e.startsWith("TELEMETRY"))) {
                flags.telemetry = true;
            }
            if (func.includes("BLACKBOX")) {
                flags.blackbox = true;
            }
            if (func.includes("ESC_SENSOR")) {
                flags.esc = true;
            }
            if (func.includes("GPS")) {
                flags.gps = true;
            }
        }
        return flags;
    }

    function updateFeatures() {
        const { rxSerial, telemetry, blackbox, esc, gps } = enabledFeaturesFromPorts(FC.SERIAL_CONFIG.ports);
        const featureConfig = FC.FEATURE_CONFIG.features;

        rxSerial ? featureConfig.enable("RX_SERIAL") : featureConfig.disable("RX_SERIAL");

        if (telemetry) {
            featureConfig.enable("TELEMETRY");
        }
        // TELEMETRY is deliberately never disabled here - a protocol can be carried by the RX
        // link rather than a UART, so an empty telemetry column does not mean "no telemetry".

        blackbox ? featureConfig.enable("BLACKBOX") : featureConfig.disable("BLACKBOX");
        esc ? featureConfig.enable("ESC_SENSOR") : featureConfig.disable("ESC_SENSOR");

        // GNSS: enable when a port is configured, never disable - Virtual GPS needs no UART.
        if (gps) {
            featureConfig.enable("GPS");
        }
    }

    /** Rebuild FC.SERIAL_CONFIG.ports from the store. Always the complete array (see save). */
    function toFcPorts() {
        return ports.value.map((p) => {
            const functions = [];
            if (p.msp) {
                functions.push("MSP");
            }
            if (p.rxSerial) {
                functions.push("RX_SERIAL");
            }
            if (p.telemetry) {
                functions.push(p.telemetry);
            }
            if (p.sensor) {
                functions.push(p.sensor);
            }
            if (p.peripheral) {
                functions.push(p.peripheral);
            }
            // Named functions this API version has no slot for; the unnamed bits ride along in
            // functionMask and are restored by mspHelper.serialPortFunctionsToMask.
            functions.push(...(p.reservedFunctions ?? []));

            return {
                identifier: p.identifier,
                functionMask: p.functionMask ?? 0,
                msp_baudrate: p.msp_baudrate,
                telemetry_baudrate: p.telemetry_baudrate,
                gps_baudrate: p.gps_baudrate === "AUTO" ? "57600" : p.gps_baudrate,
                blackbox_baudrate: p.blackbox_baudrate === "AUTO" ? "115200" : p.blackbox_baudrate,
                functions,
            };
        });
    }

    /**
     * Push the port array and the feature bits it implies to the FC, without saving EEPROM or
     * rebooting. Split out from save() so a tab with settings of its own can write those in the
     * same breath and spend a single reboot on the lot - five per-tab saves would be five reboots,
     * which would defeat the point of putting the controls on the feature tabs in the first place.
     *
     * There is no partial write at the protocol level: MSP2_COMMON_SET_SERIAL_CONFIG carries the
     * whole array and updateFeatures derives feature bits from it, so a store holding anything
     * less than the complete array would not "save only its part", it would clear other
     * subsystems.
     *
     * @throws if the FC rejects the serial config, so the caller can abandon the save chain
     */
    async function writeConfig() {
        const snapshot = takeSnapshot();

        tracking.sendSaveAndChangeEvents(
            tracking.EVENT_CATEGORIES.FLIGHT_CONTROLLER,
            toRaw(analyticsChanges.value),
            "ports",
        );
        analyticsChanges.value = {};

        FC.SERIAL_CONFIG.ports = toFcPorts();
        updateFeatures();

        const code = MSPCodes.MSP2_COMMON_SET_SERIAL_CONFIG;
        const response = await MSP.promise(code, mspHelper.crunch(code));

        // Firmware refuses a serial config it cannot apply (betaflight#15131). Writing the feature
        // bits, saving EEPROM and rebooting on top of that would report success over an unchanged
        // serial config, so stop here and tell the user.
        if (isMspRejected(response)) {
            gui_log(i18n.getMessage("portsSaveRejected"));
            throw new Error("Flight controller rejected the serial port configuration");
        }

        await MSP.promise(MSPCodes.MSP_SET_FEATURE_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_FEATURE_CONFIG));

        // The FC now holds this config in RAM, so the store matches it. Persisting and rebooting
        // is the caller's business.
        markClean(snapshot);
    }

    /**
     * Write, persist and reboot. The standalone entry point, for the Ports tab and the pending
     * changes banner; a tab that has its own settings to write should call writeConfig() and then
     * reboot once itself.
     *
     * @returns {Promise<boolean>} whether the configuration was written
     */
    async function save() {
        const { saveAndReboot } = useReboot();
        try {
            await writeConfig();
        } catch (error) {
            console.error("Failed to save serial port configuration:", error);
            return false;
        }

        await saveAndReboot();
        gui_log(i18n.getMessage("portsEepromSaved"));
        return true;
    }

    // ---------------------------------------------------------------- lifecycle

    /**
     * Drop everything on disconnect. Without this the next board inherits the previous board's
     * ports: a board with fewer UARTs would show phantom rows and could be written a port array
     * it cannot represent.
     */
    function $reset() {
        ports.value = [];
        analyticsChanges.value = {};
        loaded.value = false;
        isLoading.value = false;
        loadFailed.value = false;
        markClean();
    }

    watch(
        () => CONFIGURATOR.connectionValid,
        (valid) => {
            if (!valid) {
                $reset();
            }
        },
    );

    return {
        ports,
        loaded,
        isLoading,
        loadFailed,
        dirty,
        analyticsChanges,
        functionRules,
        portName,
        portById,
        portUses,
        hasReservedFunctions,
        loadConfig,
        availableFor,
        evictionsFor,
        isAtPortLimit,
        assign,
        clear,
        writeConfig,
        save,
        $reset,
    };
});
