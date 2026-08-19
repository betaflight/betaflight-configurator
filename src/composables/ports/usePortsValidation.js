import { computed } from "vue";
import FC from "../../js/fc";
import { mspHelper } from "../../js/msp/MSPHelper";
import { i18n } from "../../js/localization";
import { validateSerialConfig, SERIAL_VALIDATION_CODE as CODE } from "../../js/utils/serialConfigValidation";

// Maps a reactive Ports-tab port model to the { identifier, functionMask,
// *_baudrateIndex } shape the validator expects. The function list is built the
// same way saveConfig builds it, so we validate the mask that would be sent.
function portModelToRawPort(port) {
    const functions = [];
    if (port.msp) {
        functions.push("MSP");
    }
    if (port.rxSerial) {
        functions.push("RX_SERIAL");
    }
    if (port.telemetry) {
        functions.push(port.telemetry);
    }
    if (port.sensor) {
        functions.push(port.sensor);
    }
    if (port.peripheral) {
        functions.push(port.peripheral);
    }

    const baudIndex = (value) => {
        const index = mspHelper.BAUD_RATES.indexOf(value);
        return index < 0 ? 0 : index;
    };

    return {
        identifier: port.identifier,
        functionMask: mspHelper.serialPortFunctionsToMask(functions),
        gps_baudrateIndex: baudIndex(port.gps_baudrate),
        telemetry_baudrateIndex: baudIndex(port.telemetry_baudrate),
        blackbox_baudrateIndex: baudIndex(port.blackbox_baudrate),
    };
}

const CODE_TO_I18N = {
    [CODE.VCP_REQUIRES_MSP]: "portsValidationVcpRequiresMsp",
    [CODE.VTX_MSP_NOT_SHARED]: "portsValidationVtxMspNotShared",
    [CODE.TOO_MANY_FUNCTIONS]: "portsValidationTooManyFunctions",
    [CODE.INVALID_FUNCTION_COMBINATION]: "portsValidationInvalidCombination",
    [CODE.NO_MSP_PORT]: "portsValidationNoMspPort",
    [CODE.TOO_MANY_MSP_PORTS]: "portsValidationTooManyMspPorts",
    [CODE.SOFTSERIAL_FUNCTION_STRIPPED]: "portsNoticeSoftserialFunctionStripped",
    [CODE.SOFTSERIAL_BAUD_CLAMPED]: "portsNoticeSoftserialBaudClamped",
};

function messageFor(entry) {
    const key = CODE_TO_I18N[entry.code];
    if (!key) {
        return entry.code;
    }
    return i18n.getMessage(key, entry.params ? { ...entry.params } : undefined);
}

// Non-reactive validation, shared by the live computed and the save guard.
// Always validates; whether an invalid layout blocks the save is the caller's
// decision (Expert mode still sees the errors but may save anyway).
export function validatePortsConfig(ports) {
    const rawPorts = ports.map(portModelToRawPort);
    const serialRxProvider = FC.RX_CONFIG?.serialrx_provider ?? 0;

    // hasTelemetry / hasVtxMsp default to true — matches every standard build;
    // where wrong it only widens an advisory ceiling (8 vs 3).
    return validateSerialConfig(rawPorts, serialRxProvider);
}

export function usePortsValidation(ports) {
    const validationResult = computed(() => validatePortsConfig(ports));

    const isValid = computed(() => validationResult.value.valid);

    // Errors keyed by port identifier; config-wide errors (null id) are excluded.
    const portErrors = computed(() => {
        const map = {};
        for (const error of validationResult.value.errors) {
            if (error.identifier === null || error.identifier === undefined) {
                continue;
            }
            (map[error.identifier] ||= []).push(messageFor(error));
        }
        return map;
    });

    const configErrors = computed(() =>
        validationResult.value.errors.filter((e) => e.identifier === null).map(messageFor),
    );

    const notices = computed(() => validationResult.value.notices.map(messageFor));

    const portHasError = (identifier) => Boolean(portErrors.value[identifier]?.length);

    return {
        validationResult,
        isValid,
        portErrors,
        configErrors,
        notices,
        portHasError,
    };
}
