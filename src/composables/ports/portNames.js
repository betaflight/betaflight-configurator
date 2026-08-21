export const PORT_NONE = -1;
export const PORT_NAME_NONE = "NONE";

/** The USB VCP port - the app's own link, and not somewhere a feature's UART ever goes. */
export const USB_VCP_IDENTIFIER = 20;

// Keyed by serialPortIdentifier_e. The UART block appears twice because the identifier base
// moved; only one of the two blocks is ever populated on a given target, so a name round trip
// is unambiguous in practice.
const portCliNames = {
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
    20: "VCP",
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

// The configurator has always shown the USB port as "USB VCP"; the firmware CLI knows it as "VCP".
const portDisplayNames = {
    20: "USB VCP",
};

/**
 * The name the firmware CLI accepts and prints for a port, or null when the identifier is
 * unknown to us.
 *
 * @param {number} identifier
 * @returns {string|null}
 */
export function getPortCliName(identifier) {
    return portCliNames[identifier] ?? null;
}

/**
 * @param {number} identifier
 * @returns {string}
 */
export function getPortDisplayName(identifier) {
    return portDisplayNames[identifier] ?? portCliNames[identifier] ?? `UART (${identifier})`;
}

/**
 * Builds the CLI command that assigns a port to a feature.
 *
 * Throws rather than falling back to the raw identifier: the firmware resolves this setting by
 * name only and rejects a number, so an unmappable identifier has to surface here instead of
 * failing on the board.
 *
 * @param {string} setting CLI setting name, e.g. "rx_uart"
 * @param {number} identifier
 * @returns {string}
 */
export function formatPortSetCommand(setting, identifier) {
    if (identifier === PORT_NONE) {
        return `set ${setting} = ${PORT_NAME_NONE}`;
    }

    const name = getPortCliName(identifier);
    if (!name) {
        throw new Error(`No serial port name for identifier ${identifier}`);
    }

    return `set ${setting} = ${name}`;
}
